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
 * Creates a new demo session using STRICT inventory phone allocation.
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

    if (!result.success) {
      return res.status(409).json({
        success: false,
        code: result.code || "NUMBERS_BUSY",
        error: result.message || "Currently, our system demo phone lines are busy with active testing."
      });
    }

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
 * Submits VIP Demo Queue Waitlist when system numbers are busy.
 */
exports.joinWaitlist = async (req, res) => {
  try {
    const { email, fullName, mobilePhone, category, notes } = req.body;

    if (!email || !fullName || !mobilePhone) {
      return res.status(400).json({
        success: false,
        error: "Email address, Full Name, and Mobile Phone are required."
      });
    }

    const waitlist = await prisma.demoWaitlist.create({
      data: {
        email,
        fullName,
        mobilePhone,
        category: category || "general",
        notes: notes || "",
        status: "PENDING"
      }
    });

    const emailService = require("../../services/email.service");
    emailService.sendEmail({
      to: email,
      subject: "Your VIP Demo Line Reservation — Naxton Technologies",
      html: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 30px; border-radius: 16px; border: 1px solid #334155;">
          <h2 style="color: #38bdf8; margin-top: 0;">🎉 Priority Demo Line Reserved!</h2>
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Thank you for requesting an interactive AI receptionist demo for <strong>${(category || "business").toUpperCase()}</strong>.</p>
          <p>Our system demo phone lines are currently handling active prospect test calls. Your reservation has been placed at the top of the priority queue.</p>
          <p style="background: rgba(56, 189, 248, 0.1); padding: 15px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.2); color: #38bdf8;">
            <strong>What happens next:</strong> As soon as a demo phone line frees up within 12 hours, your personalized AI access credentials and direct phone number will be delivered straight to this email!
          </p>
        </div>
      `
    }).catch(e => console.error("[WAITLIST_EMAIL_ERR]", e.message));

    return res.json({
      success: true,
      message: "Thank you! Your demo priority reservation is confirmed. Credentials will be emailed as soon as a demo line frees up."
    });
  } catch (err) {
    console.error("[WAITLIST_ERR]", err);
    return res.status(500).json({ success: false, error: "Unable to submit waitlist reservation." });
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
      where: {
        OR: [
          { businessId: session.businessId },
          { tenantId: session.tenantId }
        ]
      },
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
      where: {
        OR: [
          { businessId: session.businessId },
          { tenantId: session.tenantId }
        ]
      },
      orderBy: { createdAt: "desc" },
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
