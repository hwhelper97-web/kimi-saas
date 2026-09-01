const prisma = require("../../config/prisma");
const smsService = require("../../services/sms.service");

exports.getConfigs = async (req, res) => {
  try {
    const { businessId } = req.query;
    const tenantId = req.user.tenantId;

    const whereClause = req.user.role === "SUPERADMIN" 
      ? (businessId ? { businessId } : {}) 
      : { tenantId, ...(businessId ? { businessId } : {}) };

    const configs = await prisma.tenantPhoneNumber.findMany({
      where: whereClause,
      include: { business: true }
    });

    res.json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const { 
      businessId, 
      businessPhoneNumber, 
      transferNumber, 
      fallbackNumber, 
      aiEnabled, 
      humanTransferEnabled,
      transferTimeout,
      recordingEnabled, 
      forwardingEnabled, 
      businessHours 
    } = req.body;

    const tenantId = req.user.tenantId;
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const { id } = req.params;

    let config;
    if (id) {
      // 🛡️ Verify tenant ownership before updating
      const existing = await prisma.tenantPhoneNumber.findFirst({
        where: { id, ...(isSuperAdmin ? {} : { tenantId }) }
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: "Phone configuration not found or access denied" });
      }

      // Check if transfer number changed
      let transferVerificationStatus = existing.transferVerificationStatus;
      if (transferNumber && transferNumber !== existing.transferNumber) {
        transferVerificationStatus = "PENDING";
      }

      const updateData = {
        businessId: businessId || existing.businessId,
        businessPhoneNumber: businessPhoneNumber !== undefined ? businessPhoneNumber : existing.businessPhoneNumber,
        transferNumber: transferNumber !== undefined ? transferNumber : existing.transferNumber,
        fallbackNumber: fallbackNumber !== undefined ? fallbackNumber : existing.fallbackNumber,
        aiEnabled: aiEnabled !== undefined ? Boolean(aiEnabled) : existing.aiEnabled,
        humanTransferEnabled: humanTransferEnabled !== undefined ? Boolean(humanTransferEnabled) : existing.humanTransferEnabled,
        transferTimeout: transferTimeout ? parseInt(transferTimeout, 10) : existing.transferTimeout,
        recordingEnabled: recordingEnabled !== undefined ? Boolean(recordingEnabled) : existing.recordingEnabled,
        forwardingEnabled: forwardingEnabled !== undefined ? Boolean(forwardingEnabled) : existing.forwardingEnabled,
        transferVerificationStatus,
        businessHours: typeof businessHours === 'object' ? JSON.stringify(businessHours) : businessHours
      };

      config = await prisma.tenantPhoneNumber.update({
        where: { id: existing.id },
        data: updateData
      });
    } else {
      const createData = {
        businessId,
        tenantId: isSuperAdmin && req.body.tenantId ? req.body.tenantId : tenantId,
        businessPhoneNumber,
        transferNumber,
        fallbackNumber,
        aiEnabled: aiEnabled !== undefined ? Boolean(aiEnabled) : true,
        humanTransferEnabled: humanTransferEnabled !== undefined ? Boolean(humanTransferEnabled) : true,
        transferTimeout: transferTimeout ? parseInt(transferTimeout, 10) : 30,
        recordingEnabled: recordingEnabled !== undefined ? Boolean(recordingEnabled) : true,
        forwardingEnabled: forwardingEnabled !== undefined ? Boolean(forwardingEnabled) : true,
        transferVerificationStatus: transferNumber ? "PENDING" : "VERIFIED",
        twilioPhoneNumber: req.body.twilioPhoneNumber || "PENDING",
        businessHours: typeof businessHours === 'object' ? JSON.stringify(businessHours) : businessHours
      };
      config = await prisma.tenantPhoneNumber.create({ data: createData });
    }

    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.toggleAI = async (req, res) => {
  try {
    const { id } = req.params;
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantId = req.user.tenantId;

    // 🛡️ Verify tenant ownership before toggling
    const config = await prisma.tenantPhoneNumber.findFirst({
      where: { id, ...(isSuperAdmin ? {} : { tenantId }) }
    });
    
    if (!config) return res.status(404).json({ success: false, error: "Phone configuration not found or access denied" });

    const updated = await prisma.tenantPhoneNumber.update({
      where: { id: config.id },
      data: { aiEnabled: !config.aiEnabled }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.requestTransferVerification = async (req, res) => {
  try {
    const { id, businessId, transferNumber } = req.body;
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantId = req.user.tenantId;

    const whereClause = isSuperAdmin 
      ? (id ? { id } : { businessId }) 
      : (id ? { id, tenantId } : { businessId, tenantId });

    const config = await prisma.tenantPhoneNumber.findFirst({
      where: whereClause,
      include: { business: true }
    });

    if (!config) {
      return res.status(404).json({ success: false, error: "Phone configuration not found or access denied" });
    }

    const targetNumber = transferNumber || config.transferNumber;
    if (!targetNumber) {
      return res.status(400).json({ success: false, error: "Transfer phone number required for verification" });
    }

    // Rate limiting check
    if (config.transferOtpExpiresAt && config.transferOtpExpiresAt > new Date() && config.transferOtpAttempts >= 5) {
      return res.status(429).json({ success: false, error: "Too many verification requests. Please wait 10 minutes before retrying." });
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.tenantPhoneNumber.update({
      where: { id: config.id },
      data: {
        transferNumber: targetNumber,
        transferOtp: otpCode,
        transferOtpExpiresAt: expiresAt,
        transferOtpAttempts: 0,
        transferVerificationStatus: "PENDING"
      }
    });

    const businessName = config.business ? config.business.name : "Naxton AI Voice";
    await smsService.sendOtpSms(targetNumber, otpCode, businessName);

    return res.json({
      success: true,
      message: `Verification code sent to ${targetNumber}`,
      data: {
        id: config.id,
        transferNumber: targetNumber,
        status: "PENDING",
        expiresAt
      }
    });
  } catch (error) {
    console.error("[PhoneController] requestTransferVerification error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.verifyTransferOtp = async (req, res) => {
  try {
    const { id, businessId, otp } = req.body;
    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const tenantId = req.user.tenantId;

    if (!otp) {
      return res.status(400).json({ success: false, error: "Verification code required" });
    }

    const whereClause = isSuperAdmin 
      ? (id ? { id } : { businessId }) 
      : (id ? { id, tenantId } : { businessId, tenantId });

    const config = await prisma.tenantPhoneNumber.findFirst({
      where: whereClause
    });

    if (!config) {
      return res.status(404).json({ success: false, error: "Phone configuration not found or access denied" });
    }

    if (!config.transferOtp || !config.transferOtpExpiresAt) {
      return res.status(400).json({ success: false, error: "No pending verification found. Please request a new code." });
    }

    if (config.transferOtpExpiresAt < new Date()) {
      await prisma.tenantPhoneNumber.update({
        where: { id: config.id },
        data: { transferVerificationStatus: "EXPIRED" }
      });
      return res.status(400).json({ success: false, error: "Verification code has expired. Please request a new code." });
    }

    if (config.transferOtpAttempts >= 5) {
      return res.status(429).json({ success: false, error: "Maximum verification attempts exceeded. Please request a new code." });
    }

    // Check OTP
    if (config.transferOtp.trim() !== otp.toString().trim()) {
      await prisma.tenantPhoneNumber.update({
        where: { id: config.id },
        data: { transferOtpAttempts: { increment: 1 } }
      });
      return res.status(400).json({ success: false, error: "Invalid verification code. Please check and try again." });
    }

    // OTP Verified!
    const verifiedConfig = await prisma.tenantPhoneNumber.update({
      where: { id: config.id },
      data: {
        transferVerificationStatus: "VERIFIED",
        transferVerifiedAt: new Date(),
        transferOtp: null,
        transferOtpExpiresAt: null,
        transferOtpAttempts: 0
      }
    });

    return res.json({
      success: true,
      message: "Owner/Manager transfer number verified successfully!",
      data: verifiedConfig
    });
  } catch (error) {
    console.error("[PhoneController] verifyTransferOtp error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { businessId } = req.query;
    const tenantId = req.user.tenantId;

    const whereClause = req.user.role === "SUPERADMIN"
      ? (businessId ? { businessId } : {})
      : { tenantId, ...(businessId ? { businessId } : {}) };

    const stats = await prisma.callAnalytics.aggregate({
      where: whereClause,
      _sum: {
        incomingCalls: true,
        aiHandledCalls: true,
        transferredCalls: true
      }
    });

    res.json({
      success: true,
      data: {
        incomingCalls: stats._sum.incomingCalls || 0,
        aiHandledCalls: stats._sum.aiHandledCalls || 0,
        transferredCalls: stats._sum.transferredCalls || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
