const prisma = require("../../config/prisma");

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
      phoneNumber,
      address,
      city,
      country,
      type,
      isMainBranch,
      ownerName,
      ownerEmail,
      ownerPhone,
      ownerPassword
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: "Business name is required" });
    }

    const businessType = (type || "restaurant").toLowerCase();

    // 1. Create a NEW isolated Tenant for this business
    const newTenant = await prisma.tenant.create({
      data: { name: `${name} Tenant` }
    });

    // 2. Create Business under the new Tenant
    const business = await prisma.business.create({
      data: {
        name,
        type: businessType,
        phoneNumber: phoneNumber || "",
        address: address || "",
        city: city || "",
        country: country || "",
        isMainBranch: isMainBranch !== undefined ? isMainBranch : true,
        tenantId: newTenant.id, // Strictly isolated
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
          { email: `barber_${business.id.substring(0,6)}@nexton.ai`, password: hashedPassword, role: "BARBER", tenantId: newTenant.id },
          { email: `stylist_${business.id.substring(0,6)}@nexton.ai`, password: hashedPassword, role: "STYLIST", tenantId: newTenant.id },
          { email: `therapist_${business.id.substring(0,6)}@nexton.ai`, password: hashedPassword, role: "THERAPIST", tenantId: newTenant.id },
        ]
      });
    } else {
      await prisma.user.createMany({
        data: [
          { email: `chef_${business.id.substring(0,6)}@nexton.ai`, password: hashedPassword, role: "HEAD_CHEF", tenantId: newTenant.id },
          { email: `kitchen_${business.id.substring(0,6)}@nexton.ai`, password: hashedPassword, role: "KITCHEN_STAFF", tenantId: newTenant.id },
          { email: `manager_${business.id.substring(0,6)}@nexton.ai`, password: hashedPassword, role: "MANAGER", tenantId: newTenant.id },
        ]
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

    const whereClause = req.user.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    if (businessId) whereClause.id = businessId;

    const business = await prisma.business.findFirst({
      where: whereClause,
      include: {
        menuItems: { include: { sizes: true, addons: true } },
        staff: true,
      },
    });

    if (!business) {
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: business });
  } catch (error) {
    console.error("[Business] getCurrent error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch business" });
  }
};

/* ===============================
   UPDATE CURRENT BUSINESS
=============================== */
exports.updateCurrent = async (req, res) => {
  try {
    const { businessId } = req.query;

    const whereClause = req.user.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    if (businessId) whereClause.id = businessId;

    const business = await prisma.business.findFirst({
      where: whereClause,
    });

    if (!business) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    let { name, phoneNumber, address, city, country, timings, currency, taxRate, logoUrl } = req.body;

    // If a file was uploaded, use its path
    if (req.file) {
      logoUrl = `/uploads/${req.file.filename}`;
    }

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
        ...(taxRate !== undefined && { taxRate }),
        ...(logoUrl !== undefined && { logoUrl })
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Business] updateCurrent error:", error);
    return res.status(500).json({ success: false, error: "Failed to update business" });
  }
};

/* ===============================
   GET ALL BUSINESSES (switcher)
=============================== */
exports.getAllBusinesses = async (req, res) => {
  try {
    const whereClause = req.user.role === "SUPERADMIN" ? {} : { tenantId: req.tenantId };
    const businesses = await prisma.business.findMany({
      where: whereClause,
      select: { id: true, name: true, type: true },
    });

    return res.json({ success: true, data: businesses });
  } catch (error) {
    console.error("[Business] getAllBusinesses error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

/* ===============================
   DELETE BUSINESS
=============================== */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify it exists in this tenant (or if superadmin, bypass tenant restriction)
    const whereClause = req.user.role === "SUPERADMIN" ? { id } : { id, tenantId: req.tenantId };
    const business = await prisma.business.findFirst({
      where: whereClause
    });

    if (!business) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    // Must delete related records manually because SQLite doesn't natively cascade nicely without setup
    await prisma.orderItem.deleteMany({ where: { businessId: id } }).catch(()=>null);
    await prisma.order.deleteMany({ where: { businessId: id } }).catch(()=>null);
    await prisma.appointment.deleteMany({ where: { businessId: id } }).catch(()=>null);
    await prisma.call.deleteMany({ where: { businessId: id } }).catch(()=>null);
    await prisma.menuItem.deleteMany({ where: { businessId: id } }).catch(()=>null);

    await prisma.business.delete({ where: { id } });

    return res.json({ success: true });
  } catch (error) {
    console.error("[Business] delete error:", error);
    return res.status(500).json({ success: false, error: "Failed to delete business" });
  }
};
