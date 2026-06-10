
const prisma = require("../../config/prisma");

exports.requestMints = async (req, res) => {
  try {
    const { amount, tier } = req.body;
    const tenantId = req.user.tenantId;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const request = await prisma.mintRequest.create({
      data: {
        tenantId,
        amount: parseInt(amount),
        tier: tier || "CUSTOM",
        status: "PENDING"
      }
    });

    res.json({ success: true, message: "Mint request submitted successfully. Our team will review it shortly.", data: request });
  } catch (error) {
    console.error("Request mints error:", error);
    res.status(500).json({ success: false, message: "Failed to submit request" });
  }
};

exports.getBillingStatus = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        plan: true,
        tokenBalance: true,
        totalTokensPurchased: true,
        usedMinutes: true,
        monthlyLimit: true,
        monthlyUsedTokens: true,
        monthlyTokenLimit: true,
        staffLimit: true,
        businessLimit: true,
        isDemoAccount: true
      }
    });

    const pendingRequests = await prisma.mintRequest.findMany({
      where: { tenantId, status: "PENDING" },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: { ...tenant, pendingRequests } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
