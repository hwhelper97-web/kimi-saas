const fs = require("fs");
const path = require("path");
let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (e) {
  console.warn("[EMAIL_SERVICE_WARN] nodemailer package missing. Run `npm install nodemailer`.");
}

/**
 * Reads SMTP / Email transport config from platform.json and process.env
 */
function getEmailConfig() {
  const configPath = path.join(__dirname, "../config/platform.json");
  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {}
  }

  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || fileConfig.smtpHost;
  const user = process.env.SMTP_USER || process.env.MAIL_USER || fileConfig.smtpUser;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS || fileConfig.smtpPass;
  const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || fileConfig.smtpPort || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465 || fileConfig.smtpSecure === true;
  const from = process.env.SMTP_FROM || process.env.MAIL_FROM || fileConfig.smtpFrom || '"Naxton Live Demo Center" <demo@naxtontechnologies.com>';

  return { host, user, pass, port, secure, from, configured: Boolean(host && user && pass) };
}

/**
 * Creates and returns the active Nodemailer transporter instance.
 */
function getTransporter() {
  if (!nodemailer) return null;
  const config = getEmailConfig();

  if (!config.configured) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Sends a professional 12-Hour Live Demo confirmation email to the prospect.
 */
async function sendDemoConfirmationEmail(demoData) {
  const {
    email,
    contactName = "Valued Customer",
    businessName = "Your Business",
    businessType = "restaurant",
    aiName = "Sarah",
    phoneNumber = "+18884918668",
    token,
    host = "naxtontechnologies.com"
  } = demoData;

  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const dashboardUrl = `${protocol}://${host}/demo/live/${token}`;
  const subject = `Your 12-Hour AI Receptionist Demo is Live — Naxton Technologies`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Live Demo Access</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
    .header { background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 2px; color: #ffffff; }
    .content { padding: 30px; line-height: 1.6; }
    .badge { display: inline-block; background-color: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
    .box { background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .phone { font-size: 26px; font-weight: 900; color: #38bdf8; letter-spacing: 2px; margin: 10px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 30px; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-top: 15px; }
    .footer { text-align: center; padding: 20px; font-size: 11px; color: #64748b; border-t: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>NAXTON TECHNOLOGIES</h1>
      <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;">Engineering Intelligent Software for Modern Businesses</p>
    </div>
    <div class="content">
      <div class="badge">🟢 12-HOUR LIVE DEMO ACTIVE</div>
      <h2 style="margin-top: 0; color: #ffffff;">Hello ${contactName},</h2>
      <p>Your interactive AI receptionist environment for <strong>${businessName}</strong> has been created and is ready for live phone testing.</p>

      <div class="box">
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8;">STEP 1: CALL YOUR AI RECEPTIONIST NOW</div>
        <div class="phone">${phoneNumber}</div>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #cbd5e1;">
          Call directly from your mobile phone. Speak naturally with <strong>${aiName}</strong> to experience real AI phone conversations.
        </p>
      </div>

      <div class="box">
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8;">STEP 2: ACCESS YOUR 12-HOUR DASHBOARD ANYTIME</div>
        <p style="font-size: 12px; color: #cbd5e1;">
          Your demo session remains active for <strong>12 hours</strong>. Use the direct link below anytime to observe live transcripts, AI reasoning logs, and orders/appointments created live in your database.
        </p>
        <div style="text-align: center;">
          <a href="${dashboardUrl}" class="btn">LAUNCH LIVE DASHBOARD &rarr;</a>
        </div>
      </div>

      <p style="font-size: 12px; color: #94a3b8;">
        If you have any questions or would like to deploy AI receptionists for your business 24/7, reply directly to this email or visit Naxton Technologies.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Naxton Technologies. All rights reserved.<br>
      Live Demo Center Protocol Enabled &bull; 12-Hour Session Expiration Policy
    </div>
  </div>
</body>
</html>
  `;

  const config = getEmailConfig();

  try {
    const mailer = getTransporter();
    if (mailer) {
      const info = await mailer.sendMail({
        from: config.from,
        to: email,
        subject,
        html
      });
      console.log(`[EMAIL_SERVICE] 📩 Live Demo confirmation email delivered to ${email} (MessageID: ${info.messageId})`);
      return { success: true, messageId: info.messageId, dashboardUrl };
    } else {
      console.warn(`[EMAIL_SERVICE_WARN] SMTP not configured. Demo confirmation email logged: ${email} | Link: ${dashboardUrl}`);
      return { success: false, error: "SMTP settings not configured on server. Please configure SMTP in SuperAdmin System Settings.", dashboardUrl };
    }
  } catch (err) {
    console.error("[EMAIL_SERVICE_ERROR] Failed to deliver email:", err.message);
    return { success: false, error: err.message, dashboardUrl };
  }
}

/**
 * Sends a test email to verify SMTP configuration.
 */
async function sendTestEmail(targetEmail) {
  const config = getEmailConfig();
  if (!config.configured) {
    return { success: false, error: "SMTP settings missing. Please fill in Host, Port, Username and Password." };
  }

  try {
    const mailer = getTransporter();
    const info = await mailer.sendMail({
      from: config.from,
      to: targetEmail,
      subject: "Naxton Technologies — SMTP Test Connection Successful",
      html: `
        <div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 30px; border-radius: 12px;">
          <h2 style="color: #38bdf8;">✅ SMTP Connection Successful!</h2>
          <p>Your Naxton Technologies email delivery system is fully configured and operational.</p>
          <p style="font-size: 12px; color: #94a3b8;">Sent via ${config.host}:${config.port} on ${new Date().toLocaleString()}</p>
        </div>
      `
    });
    return { success: true, messageId: info.messageId, message: `Test email successfully sent to ${targetEmail}!` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getEmailConfig,
  sendDemoConfirmationEmail,
  sendTestEmail
};
