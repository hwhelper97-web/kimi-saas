const prisma = require("../../config/prisma");
const { seedDefaultServices } = require("../../services/appointment-seeder.service");

/* ===============================
   SERVICE CATEGORIES
=============================== */

exports.listCategories = async (req, res) => {
  try {
    const { businessId } = req.query;
    if (!businessId) return res.status(400).json({ error: "businessId required" });

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN") {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    const categories = await prisma.serviceCategory.findMany({
      where: { businessId, tenantId },
      include: { 
        _count: {
          select: { services: true }
        }
      },
      orderBy: { sortOrder: "asc" }
    });

    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, businessId, sortOrder, imageUrl } = req.body;
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : imageUrl;
    
    const parsedSortOrder = parseInt(sortOrder);

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }
    
    const category = await prisma.serviceCategory.create({
      data: { 
        name, 
        description, 
        businessId, 
        tenantId, 
        sortOrder: isNaN(parsedSortOrder) ? 0 : parsedSortOrder,
        imageUrl: finalImageUrl
      }
    });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sortOrder, isActive, imageUrl } = req.body;
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : imageUrl;
    const parsedSortOrder = parseInt(sortOrder);

    const category = await prisma.serviceCategory.update({
      where: req.user.role === "SUPERADMIN" ? { id } : { id, tenantId: req.tenantId },
      data: { 
        name, 
        description, 
        sortOrder: isNaN(parsedSortOrder) ? 0 : parsedSortOrder, 
        isActive: isActive === 'true' || isActive === true,
        imageUrl: finalImageUrl
      }
    });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.serviceCategory.delete({ 
      where: req.user.role === "SUPERADMIN" ? { id } : { id, tenantId: req.tenantId } 
    });
    res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ===============================
   APPOINTMENT SERVICES
=============================== */

exports.listServices = async (req, res) => {
  try {
    const { businessId, categoryId } = req.query;
    
    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    const where = { businessId, tenantId };
    if (categoryId) where.categoryId = categoryId;

    const services = await prisma.appointmentService.findMany({
      where,
      include: { 
        category: true,
        addons: true,
        staffAssignments: { include: { staff: true } },
        availability: true,
        aliases: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createService = async (req, res) => {
  try {
    const { 
      name, description, price, duration, categoryId, businessId, 
      preparationTime, isPopular, allowOnlineBooking, requiresStaffSelection, imageUrl, variants
    } = req.body;
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : imageUrl;

    const parsedVariants = variants ? (typeof variants === 'string' ? JSON.parse(variants) : variants) : [];

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    const service = await prisma.appointmentService.create({
      data: {
        name, description, 
        price: parseFloat(price) || 0, 
        duration: parseInt(duration) || 0,
        durationMinutes: parseInt(duration) || 0,
        bufferMinutes: parseInt(req.body.bufferMinutes) || 0,
        categoryId, businessId, tenantId,
        preparationTime: parseInt(preparationTime) || 0,
        isActive: true,
        isPopular: isPopular === 'true' || isPopular === true,
        allowOnlineBooking: allowOnlineBooking === 'false' ? false : true,
        requiresStaffSelection: requiresStaffSelection === 'true' || requiresStaffSelection === true,
        imageUrl: finalImageUrl,
        variants: {
          create: parsedVariants.map(v => ({
            name: v.name,
            price: parseFloat(v.price),
            duration: parseInt(v.duration),
            tenantId
          }))
        }
      },
      include: { variants: true }
    });

    res.status(201).json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { variants, ...rest } = req.body;
    const data = { ...rest };
    
    if (req.file) data.imageUrl = `/uploads/${req.file.filename}`;
    
    if (data.price) data.price = parseFloat(data.price);
    if (data.duration) {
      data.duration = parseInt(data.duration);
      data.durationMinutes = data.duration;
    }
    if (data.bufferMinutes) data.bufferMinutes = parseInt(data.bufferMinutes);
    if (data.preparationTime) data.preparationTime = parseInt(data.preparationTime);
    if (data.isPopular !== undefined) data.isPopular = data.isPopular === 'true' || data.isPopular === true;
    if (data.isActive !== undefined) data.isActive = data.isActive === 'true' || data.isActive === true;
    if (data.allowOnlineBooking !== undefined) data.allowOnlineBooking = data.allowOnlineBooking !== 'false';
    if (data.requiresStaffSelection !== undefined) data.requiresStaffSelection = data.requiresStaffSelection === 'true' || data.requiresStaffSelection === true;

    // Handle variants update
    if (variants) {
      const parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      
      // 🛡️ Resolve tenantId for SuperAdmin
      let tenantId = req.tenantId;
      if (req.user.role === "SUPERADMIN") {
        const service = await prisma.appointmentService.findUnique({ where: { id } });
        if (service) tenantId = service.tenantId;
      }

      // Simple strategy: delete and recreate for now
      await prisma.serviceVariant.deleteMany({ where: { serviceId: id } });
      data.variants = {
        create: parsedVariants.map(v => ({
          name: v.name,
          price: parseFloat(v.price),
          duration: parseInt(v.duration),
          tenantId
        }))
      };
    }

    const service = await prisma.appointmentService.update({
      where: req.user.role === "SUPERADMIN" ? { id } : { id, tenantId: req.tenantId },
      data,
      include: { variants: true }
    });

    res.json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.appointmentService.delete({ 
      where: req.user.role === "SUPERADMIN" ? { id } : { id, tenantId: req.tenantId } 
    });
    res.json({ success: true, message: "Service deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ===============================
   STAFF MANAGEMENT
=============================== */

exports.listStaff = async (req, res) => {
  try {
    const { businessId } = req.query;

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    const staff = await prisma.staff.findMany({
      where: { businessId, tenantId },
      include: { services: { include: { service: true } } }
    });
    res.json({ success: true, data: staff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const { name, role, email, phone, businessId } = req.body;

    // 🛡️ Resolve tenantId for SuperAdmin
    let tenantId = req.tenantId;
    if (req.user.role === "SUPERADMIN" && businessId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz) tenantId = biz.tenantId;
    }

    const staff = await prisma.staff.create({
      data: { name, role, email, phone, businessId, tenantId }
    });
    res.status(201).json({ success: true, data: staff });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, email, phone } = req.body;
    const staff = await prisma.staff.update({
      where: req.user.role === "SUPERADMIN" ? { id } : { id, tenantId: req.tenantId },
      data: { name, role, email, phone }
    });
    res.json({ success: true, data: staff });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.staff.delete({ 
      where: req.user.role === "SUPERADMIN" ? { id } : { id, tenantId: req.tenantId } 
    });
    res.json({ success: true, message: "Staff removed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.assignStaffToService = async (req, res) => {
  try {
    const { staffId, serviceId } = req.body;
    if (!staffId || !serviceId) return res.status(400).json({ error: "staffId and serviceId required" });

    const isSuperAdmin = req.user && req.user.role === "SUPERADMIN";
    const tenantFilter = isSuperAdmin ? {} : { tenantId: req.tenantId };

    // 🛡️ Verify both staff and service belong to tenant
    const staff = await prisma.staff.findFirst({ where: { id: staffId, ...tenantFilter } });
    if (!staff) return res.status(404).json({ error: "Staff member not found or access denied" });

    const service = await prisma.appointmentService.findFirst({ where: { id: serviceId, ...tenantFilter } });
    if (!service) return res.status(404).json({ error: "Service not found or access denied" });

    const assignment = await prisma.staffService.create({
      data: { staffId: staff.id, serviceId: service.id }
    });
    res.json({ success: true, data: assignment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ===============================
   ADDONS & ALIASES
=============================== */

exports.addServiceAlias = async (req, res) => {
  try {
    const { serviceId, alias } = req.body;
    const entry = await prisma.serviceAlias.create({
      data: { serviceId, alias, tenantId: req.tenantId }
    });
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
