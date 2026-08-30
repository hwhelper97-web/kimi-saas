const demoService = require("./demo.service");
const prisma = require("../../config/prisma");

/**
 * Renders the Demo Setup Wizard page.
 */
exports.renderSetupWizard = (req, res) => {
  res.render("demo-setup", {
    title: "Try Naxton AI Live — Interactive Demo Center",
    projectName: res.locals.projectName || "Naxton Technologies"
  });
};

/**
 * Renders the Live Demo Dashboard page.
 */
exports.renderLiveDashboard = async (req, res) => {
  const { token } = req.params;
  const session = await demoService.getSessionByToken(token);

  if (!session) {
    return res.status(404).render("demo-setup", {
      error: "Demo session not found or has expired. Please create a new demo.",
      projectName: res.locals.projectName || "Naxton Technologies"
    });
  }

  res.render("demo-dashboard", {
    title: `${session.businessName} — Live AI Receptionist Demo`,
    session,
    projectName: res.locals.projectName || "Naxton Technologies"
  });
};

/**
 * Creates a new demo session.
 */
exports.createDemo = async (req, res) => {
  try {
    const { businessName, email } = req.body;

    if (!businessName || !email) {
      return res.status(400).json({
        success: false,
        error: "Business Name and Email address are required."
      });
    }

    const result = await demoService.createDemoSession(req.body);
    return res.status(201).json({
      success: true,
      token: result.token,
      redirectUrl: `/demo/live/${result.token}`,
      session: result.session
    });
  } catch (err) {
    console.error("[DEMO_CONTROLLER] Create error:", err);
    return res.status(500).json({
      success: false,
      error: "Unable to provision live demo right now. Please try again."
    });
  }
};

/**
 * Returns JSON status of an active/expired demo session.
 */
exports.getSessionState = async (req, res) => {
  try {
    const { token } = req.params;
    const session = await demoService.getSessionByToken(token);

    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    return res.json({
      success: true,
      session
    });
  } catch (err) {
    console.error("[DEMO_CONTROLLER] Get session error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Returns call history for demo session.
 */
exports.getDemoCalls = async (req, res) => {
  try {
    const { token } = req.params;
    const session = await demoService.getSessionByToken(token);
    if (!session) return res.status(404).json({ success: false, error: "Session not found" });

    const calls = await prisma.call.findMany({
      where: { businessId: session.businessId },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    return res.json({ success: true, calls });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Returns orders for demo session.
 */
exports.getDemoOrders = async (req, res) => {
  try {
    const { token } = req.params;
    const session = await demoService.getSessionByToken(token);
    if (!session) return res.status(404).json({ success: false, error: "Session not found" });

    const orders = await prisma.order.findMany({
      where: { businessId: session.businessId },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { menuItem: true } } }
    });

    return res.json({ success: true, orders });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Returns appointments for demo session.
 */
exports.getDemoAppointments = async (req, res) => {
  try {
    const { token } = req.params;
    const session = await demoService.getSessionByToken(token);
    if (!session) return res.status(404).json({ success: false, error: "Session not found" });

    const appointments = await prisma.appointment.findMany({
      where: { businessId: session.businessId },
      orderBy: { appointmentTime: "desc" },
      include: { service: true }
    });

    return res.json({ success: true, appointments });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Deactivates demo session.
 */
exports.deactivateDemo = async (req, res) => {
  try {
    const { token } = req.params;
    const updated = await demoService.deactivateSession(token);
    if (!updated) return res.status(404).json({ success: false, error: "Session not found" });

    return res.json({ success: true, message: "Demo session deactivated." });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
