const prisma = require("../../config/prisma");
const scraperService = require("../../services/scraper.service");

/* ===============================
   Safe JSON parse helper
   Prevents crashes when businessHours is corrupt
=============================== */
function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* ===============================
   LIST BUSINESSES
=============================== */
exports.list = async (req, res) => {
  try {
    const whereClause = req.user.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    const businesses = await prisma.business.findMany({
      where: whereClause,
    });

    return res.json({ success: true, data: businesses });
  } catch (error) {
    console.error("[Business] list error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch businesses" });
  }
};

/* ===============================
   CREATE BUSINESS (Superadmin & Dashboard)
=============================== */
exports.create = async (req, res) => {
  try {
    const {
      name,
      subdomain,
      phoneNumber,
      address,
      city,
      country,
      type,
      isMainBranch,
      ownerName,
      ownerEmail,
      ownerPhone,
      ownerPassword,
      importUrl,
      manualMenuText,
      businessType: bType,
    } = req.body;
    
    const businessType = bType || "restaurant";

    // 0. Prevent Duplicates
    if (subdomain) {
      const existingTenant = await prisma.tenant.findFirst({ where: { stripeId: subdomain } });
      if (existingTenant) {
        return res.status(400).json({ success: false, error: "This subdomain is already taken or being provisioned." });
      }
    }
    
    if (ownerEmail) {
      const existingUser = await prisma.user.findFirst({ where: { email: ownerEmail } });
      if (existingUser) {
        return res.status(400).json({ success: false, error: "An owner with this email already exists." });
      }
    }

    if (!name) {
      return res.status(400).json({ success: false, error: "Business name is required" });
    }

    // businessType is already defined above from req.body or fallback

    // 1. Create a NEW isolated Tenant for this business
    const newTenant = await prisma.tenant.create({
      data: { 
        name: `${name} Tenant`,
        stripeId: subdomain || null 
      }
    });

    // 2. Create Business under the new Tenant
    const business = await prisma.business.create({
      data: {
        name,
        type: businessType,
        subType: req.body.subType || null,
        currency: req.body.currency || "USD",
        phoneNumber: phoneNumber || "",
        address: address || "",
        city: city || "",
        country: country || "",
        isMainBranch: isMainBranch !== undefined ? isMainBranch : true,
        tenantId: newTenant.id, // Strictly isolated
        aiVoiceId: "agent_9401kqqj87jzf9mrmfwsprqh3frh"
      },
    });

    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash("password", 10);
    const hashedOwnerPassword = ownerPassword ? await bcrypt.hash(ownerPassword, 10) : null;

    // 3. Create Owner inside the new Tenant
    if (ownerEmail && hashedOwnerPassword) {
      await prisma.user.create({
        data: {
          email: ownerEmail,
          password: hashedOwnerPassword, 
          role: "OWNER",
          tenantId: newTenant.id,
        }
      });
    }

    // 4. Dynamic Setup Based on Type (Create default staff accounts for demonstration)
    if (businessType === "appointment") {
      await prisma.user.createMany({
        data: [
          { email: `barber_${business.id.substring(0,6)}@naxton.ai`, password: hashedPassword, role: "BARBER", tenantId: newTenant.id },
          { email: `stylist_${business.id.substring(0,6)}@naxton.ai`, password: hashedPassword, role: "STYLIST", tenantId: newTenant.id },
          { email: `therapist_${business.id.substring(0,6)}@naxton.ai`, password: hashedPassword, role: "THERAPIST", tenantId: newTenant.id },
        ]
      });
    } else {
      await prisma.user.createMany({
        data: [
          { email: `chef_${business.id.substring(0,6)}@naxton.ai`, password: hashedPassword, role: "HEAD_CHEF", tenantId: newTenant.id },
          { email: `kitchen_${business.id.substring(0,6)}@naxton.ai`, password: hashedPassword, role: "KITCHEN_STAFF", tenantId: newTenant.id },
          { email: `manager_${business.id.substring(0,6)}@naxton.ai`, password: hashedPassword, role: "MANAGER", tenantId: newTenant.id },
        ]
      });
    }

    // 5. Trigger Smart Setup or Import
    if (businessType === "appointment" && business.subType) {
      await initializeDefaultServices(newTenant.id, business.id, business.subType);
    }

    if (importUrl || manualMenuText) {
      const io = req.app.get("io");
      scraperService.importBusinessData(business.id, importUrl, io, manualMenuText).catch(err => {
        console.error("[Business] Background import error:", err);
      });
    }

    return res.status(201).json({ success: true, data: business });
  } catch (error) {
    console.error("[Business] create error:", error);
    return res.status(500).json({ success: false, error: "Failed to create business" });
  }
};

/* ===============================
   GET CURRENT / SPECIFIC BUSINESS
=============================== */
exports.getCurrent = async (req, res) => {
  try {
    const { businessId } = req.query;
    console.log(`[Business] Fetching current. ID: ${businessId} | User: ${req.user?.email} | Role: ${req.user?.role}`);

    const whereClause = req.user?.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    if (businessId) whereClause.id = businessId;

    const business = await prisma.business.findFirst({
      where: whereClause,
      include: {
        menuItems: { include: { sizes: true, addons: true } },
        tenant: true,
      },
    });

    if (!business) {
      console.warn(`[Business] No business found for query:`, whereClause);
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: business });
  } catch (error) {
    console.error("[Business] getCurrent CRITICAL error:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error: " + error.message });
  }
};

/* ===============================
   UPDATE CURRENT BUSINESS
=============================== */
exports.updateCurrent = async (req, res) => {
  try {
    const businessId = req.params.id || req.query.businessId;

    const whereClause = req.user.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    if (businessId) whereClause.id = businessId;

    const business = await prisma.business.findFirst({
      where: whereClause,
    });

    if (!business) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    let { name, phoneNumber, address, city, country, timings, currency, taxRate, logoUrl, aiVoice, aiVoiceId, aiPersonality, timezone, appointmentDuration, openTime, closeTime } = req.body;
    console.log(`[Business Update] ID: ${business.id} | Voice: ${aiVoice} | Personality: ${aiPersonality} | Timezone: ${timezone}`);

    // 1. Feature Gate: White Labeling (Logo/Branding updates)
    const { hasFeature } = require("../../constants/plans");
    const isBrandingChange = req.file || logoUrl || req.body.aiName;
    
    if (isBrandingChange) {
        const tenant = await prisma.tenant.findUnique({ where: { id: business.tenantId }, select: { plan: true } });
        if (tenant && !hasFeature(tenant.plan, "WHITE_LABEL_READY")) {
            // If they are trying to change branding but don't have the feature, we only allow it if it's the FIRST time (setup) or if they are SuperAdmin
            if (req.user.role !== "SUPERADMIN" && business.logoUrl) {
                console.warn(`[BILLING] White-label attempt blocked for tenant ${business.tenantId}`);
                return res.status(403).json({ success: false, error: "Custom branding is only available on Prime and Enterprise plans.", code: "FEATURE_LOCKED" });
            }
        }
    }

    // If a file was uploaded, use its path
    if (req.file) {
      logoUrl = `/uploads/${req.file.filename}`;
    }

    // (Legacy auto-extract removed to prevent overwriting V2 Agent IDs)

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: { 
        name, 
        phoneNumber, 
        address, 
        city, 
        country,
        ...(timings !== undefined && { timings }),
        ...(currency !== undefined && { currency }),
        ...(taxRate !== undefined && { taxRate: parseFloat(taxRate) || 0 }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(aiVoice !== undefined && { aiVoice }),
        ...(aiVoiceId !== undefined && { aiVoiceId }),
        ...(aiPersonality !== undefined && { aiPersonality }),
        ...(req.body.aiName !== undefined && { aiName: req.body.aiName }),
        ...(timezone !== undefined && { timezone }),
        ...(openTime !== undefined && { openTime }),
        ...(closeTime !== undefined && { closeTime }),
        ...(appointmentDuration !== undefined && { appointmentDuration: parseInt(appointmentDuration) }),
        ...(req.body.slotInterval !== undefined && { slotInterval: parseInt(req.body.slotInterval) }),
        ...(req.body.bufferTime !== undefined && { bufferTime: parseInt(req.body.bufferTime) }),
        ...(req.body.breakStartTime !== undefined && { breakStartTime: req.body.breakStartTime }),
        ...(req.body.breakEndTime !== undefined && { breakEndTime: req.body.breakEndTime }),
        ...(req.body.maxBookingsPerSlot !== undefined && { maxBookingsPerSlot: parseInt(req.body.maxBookingsPerSlot) }),
        ...(req.body.orderSmsEnabled !== undefined && { orderSmsEnabled: req.body.orderSmsEnabled === 'true' || req.body.orderSmsEnabled === true }),
        ...(req.body.deliveryAvailable !== undefined && { deliveryAvailable: req.body.deliveryAvailable === 'true' || req.body.deliveryAvailable === true }),
        ...(req.body.deliveryRadius !== undefined && { deliveryRadius: parseFloat(req.body.deliveryRadius) || 0 }),
        ...(req.body.dineInAvailable !== undefined && { dineInAvailable: req.body.dineInAvailable === 'true' || req.body.dineInAvailable === true }),
        ...(req.body.takeawayAvailable !== undefined && { takeawayAvailable: req.body.takeawayAvailable === 'true' || req.body.takeawayAvailable === true }),
        ...(req.body.reservationsEnabled !== undefined && { reservationsEnabled: req.body.reservationsEnabled === 'true' || req.body.reservationsEnabled === true })
      },
    });

    // Persistent Tenant-wide Branding Sync
    if (logoUrl) {
      await prisma.tenant.update({
        where: { id: business.tenantId },
        data: { logoUrl }
      });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Business] updateCurrent error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

async function initializeDefaultServices(tenantId, businessId, subType) {
  const { seedDefaultServices } = require("../../services/appointment-seeder.service");
  await seedDefaultServices(businessId, tenantId, subType);
}

/* ===============================
   GET ALL BUSINESSES (switcher)
=============================== */
exports.getAllBusinesses = async (req, res) => {
  try {
    const whereClause = req.user.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    const businesses = await prisma.business.findMany({
      where: whereClause,
      select: { id: true, name: true, type: true, logoUrl: true },
    });

    return res.json({ success: true, data: businesses });
  } catch (error) {
    console.error("[Business] getAllBusinesses error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

/* ===============================
   DELETE BUSINESS (Secure)
=============================== */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmPassword } = req.body;

    if (!confirmPassword) {
      return res.status(400).json({ success: false, error: "Password confirmation required" });
    }

    // 1. Verify Superadmin Identity
    const bcrypt = require("bcrypt");
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isMatch = await bcrypt.compare(confirmPassword, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid Superadmin password" });
    }

    // 2. Verify Business exists
    const business = await prisma.business.findUnique({
      where: { id }
    });

    if (!business) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    // 3. Nuclear Cascading Delete (Wipe EVERYTHING linked to this Tenant)
    const tenantId = business.tenantId;
    
    // Step A: Level 4 Relations (Deepest dependencies)
    await prisma.menuOption.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.menuAddon.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.menuSize.deleteMany({ where: { tenantId } }).catch(()=>null);
    
    // Step B: Level 3 Relations
    await prisma.menuOptionGroup.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.orderItem.deleteMany({ where: { tenantId } }).catch(()=>null);
    
    // Step C: Level 2 Relations
    await prisma.menuItem.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.menuCategory.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.order.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.call.deleteMany({ where: { tenantId } }).catch(()=>null);
    
    // Step D: Platform Identity Records
    await prisma.user.deleteMany({ where: { tenantId } }).catch(()=>null);
    await prisma.business.deleteMany({ where: { tenantId } }).catch(()=>null);
    
    // Step E: The Master Tenant Record (Zero remaining FKs)
    await prisma.tenant.delete({ where: { id: tenantId } });

    return res.json({ success: true, message: "Business instance and all sub-assets permanently terminated" });
  } catch (error) {
    console.error("[Business] remove error:", error);
    return res.status(500).json({ success: false, error: "Deletion failed: Secure cleanup could not be completed." });
  }
};

/* ===============================
   RENDER LIVE DEBUG TERMINAL
=============================== */
exports.renderTerminal = async (req, res) => {
  try {
    const { id } = req.params;
    const business = await prisma.business.findUnique({
      where: { id },
      select: { id: true, name: true }
    });

    if (!business) return res.status(404).send("Business not found");

    return res.render("live-terminal", { business });
  } catch (error) {
    console.error("[Terminal] Render Error:", error);
    res.status(500).send("Internal Server Error");
  }
};
