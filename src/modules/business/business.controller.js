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
        aiVoiceId: businessType === "appointment" ? "agent_5501kqtn1qjxe5nvyc9x6zyn8w8g" : "agent_9401kqqj87jzf9mrmfwsprqh3frh"
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
    const { businessId } = req.query;

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
        ...(req.body.orderSmsEnabled !== undefined && { orderSmsEnabled: req.body.orderSmsEnabled === 'true' || req.body.orderSmsEnabled === true }),
        ...(req.body.deliveryAvailable !== undefined && { deliveryAvailable: req.body.deliveryAvailable === 'true' || req.body.deliveryAvailable === true }),
        ...(req.body.deliveryRadius !== undefined && { deliveryRadius: parseFloat(req.body.deliveryRadius) || 0 }),
        ...(req.body.dineInAvailable !== undefined && { dineInAvailable: req.body.dineInAvailable === 'true' || req.body.dineInAvailable === true }),
        ...(req.body.takeawayAvailable !== undefined && { takeawayAvailable: req.body.takeawayAvailable === 'true' || req.body.takeawayAvailable === true }),
        ...(req.body.reservationsEnabled !== undefined && { reservationsEnabled: req.body.reservationsEnabled === 'true' || req.body.reservationsEnabled === true })
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Business] updateCurrent error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

async function initializeDefaultServices(tenantId, businessId, subType) {
  const templates = {
    "Barber Shop": [
      { name: "Haircut", price: 20, category: "Grooming", serviceDuration: 30 },
      { name: "Beard Trim", price: 10, category: "Grooming", serviceDuration: 15 },
      { name: "Hair Wash", price: 5, category: "Grooming", serviceDuration: 10 },
      { name: "Facial", price: 25, category: "Skin Care", serviceDuration: 30 },
      { name: "Hair Coloring", price: 50, category: "Treatments", serviceDuration: 60 },
      { name: "Head Massage", price: 15, category: "Relaxation", serviceDuration: 20 },
      { name: "Kids Haircut", price: 12, category: "Grooming", serviceDuration: 20 }
    ],
    "Beauty Salon": [
      { name: "Hair Styling", price: 60, category: "Hair", serviceDuration: 60 },
      { name: "Hair Coloring", price: 150, category: "Hair", serviceDuration: 120 },
      { name: "Makeup", price: 80, category: "Makeup", serviceDuration: 90 },
      { name: "Manicure", price: 30, category: "Nails", serviceDuration: 45 },
      { name: "Pedicure", price: 35, category: "Nails", serviceDuration: 45 },
      { name: "Bridal Package", price: 500, category: "Premium", serviceDuration: 240 },
      { name: "Waxing", price: 40, category: "Body", serviceDuration: 30 },
      { name: "Facial", price: 80, category: "Skin", serviceDuration: 60 }
    ],
    "Spa Center": [
      { name: "Full Body Massage", price: 80, category: "Massage", serviceDuration: 60 },
      { name: "Hot Stone Massage", price: 120, category: "Therapy", serviceDuration: 90 },
      { name: "Steam Bath", price: 30, category: "Relaxation", serviceDuration: 30 },
      { name: "Aromatherapy", price: 90, category: "Therapy", serviceDuration: 60 },
      { name: "Couple Spa", price: 250, category: "Premium", serviceDuration: 120 },
      { name: "Foot Massage", price: 30, category: "Relaxation", serviceDuration: 30 },
      { name: "Sauna", price: 40, category: "Relaxation", serviceDuration: 45 }
    ],
    "Dental Clinic": [
      { name: "Dental Checkup", price: 50, category: "Exam", serviceDuration: 30 },
      { name: "Teeth Cleaning", price: 100, category: "Hygiene", serviceDuration: 45 },
      { name: "Root Canal", price: 500, category: "Surgery", serviceDuration: 90 },
      { name: "Teeth Whitening", price: 300, category: "Esthetics", serviceDuration: 60 },
      { name: "Braces Consultation", price: 150, category: "Consult", serviceDuration: 45 },
      { name: "Tooth Extraction", price: 200, category: "Surgery", serviceDuration: 45 },
      { name: "Dental Filling", price: 150, category: "Procedure", serviceDuration: 30 }
    ],
    "Medical Clinic": [
      { name: "General Checkup", price: 60, category: "Primary Care", serviceDuration: 30 },
      { name: "Blood Test", price: 40, category: "Lab", serviceDuration: 15 },
      { name: "Ultrasound", price: 150, category: "Imaging", serviceDuration: 45 },
      { name: "Specialist Consultation", price: 200, category: "Specialist", serviceDuration: 45 },
      { name: "Vaccination", price: 50, category: "Preventive", serviceDuration: 15 }
    ]
  };

  // Add aliases for legacy/other names
  templates["Hair salons / barbershops"] = templates["Barber Shop"];
  templates["Spas & massage therapy"] = templates["Spa Center"];
  templates["Doctors / clinics"] = templates["Medical Clinic"];
  templates["Dentists"] = templates["Dental Clinic"];

  const services = templates[subType];
  if (!services) return;

  // Create Categories Unique
  const categoryNames = [...new Set(services.map(s => s.category))];
  const categoryMap = {};

  for (const catName of categoryNames) {
    const cat = await prisma.menuCategory.create({
      data: { name: catName, businessId, tenantId }
    });
    categoryMap[catName] = cat.id;
  }

  // Create Services
  for (const s of services) {
    await prisma.menuItem.create({
      data: {
        name: s.name,
        price: s.price,
        pricingType: s.pricingType || "FIXED",
        serviceDuration: s.serviceDuration || 30,
        categoryId: categoryMap[s.category],
        businessId,
        tenantId
      }
    });
  }
}

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
