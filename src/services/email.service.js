const fs = require("fs");
const path = require("path");
let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (e) {
  console.warn("[EMAIL_SERVICE_WARN] nodemailer package missing. Run `npm install nodemailer`.");
}

/**
 * Reads SMTP / Resend config from platform.json and process.env
 */
function getEmailConfig() {
  const configPath = path.join(__dirname, "../config/platform.json");
  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {}
  }

  const resendApiKey = process.env.RESEND_API_KEY || fileConfig.resendApiKey;
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || fileConfig.smtpHost;
  const user = process.env.SMTP_USER || process.env.MAIL_USER || fileConfig.smtpUser;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS || fileConfig.smtpPass;
  const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || fileConfig.smtpPort || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465 || fileConfig.smtpSecure === true;
  const from = process.env.SMTP_FROM || process.env.MAIL_FROM || fileConfig.smtpFrom || 'Naxton AI <onboarding@resend.dev>';

  const configured = Boolean(resendApiKey || (host && user && pass));

  return { resendApiKey, host, user, pass, port, secure, from, configured };
}

/**
 * Creates and returns Nodemailer SMTP transporter instance.
 */
function getTransporter() {
  if (!nodemailer) return null;
  const config = getEmailConfig();

  if (!config.host || !config.user || !config.pass) {
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
 * Core email dispatch function:
 * Priority 1: Resend API (HTTP)
 * Priority 2: Nodemailer SMTP
 */
async function sendEmail({ to, subject, html }) {
  const config = getEmailConfig();

  // 1. Try Resend API (HTTP)
  const resendApiKey = config.resendApiKey;
  if (resendApiKey) {
    try {
      let fromAddr = config.from || "Naxton AI <onboarding@resend.dev>";
      if (!fromAddr.includes("@")) {
        fromAddr = "Naxton AI <onboarding@resend.dev>";
      }

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromAddr,
          to: Array.isArray(to) ? to : [to],
          subject: subject,
          html: html
        })
      });

      const resendData = await resendResponse.json();

      if (resendResponse.ok && resendData.id) {
        console.log(`[EMAIL_SERVICE] 📩 Resend API delivered email to ${to} (ID: ${resendData.id})`);
        return { success: true, provider: "RESEND_API", messageId: resendData.id };
      } else {
        console.warn(`[EMAIL_SERVICE_WARN] Resend API primary sender failed:`, resendData);

        // Fallback to default Resend onboarding domain if custom sender unverified
        if (fromAddr !== "Naxton AI <onboarding@resend.dev>") {
          const fallbackRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey.trim()}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              from: "Naxton AI <onboarding@resend.dev>",
              to: Array.isArray(to) ? to : [to],
              subject: subject,
              html: html
            })
          });
          const fallbackData = await fallbackRes.json();
          if (fallbackRes.ok && fallbackData.id) {
            console.log(`[EMAIL_SERVICE] 📩 Resend API (Fallback Sender) delivered email to ${to} (ID: ${fallbackData.id})`);
            return { success: true, provider: "RESEND_API", messageId: fallbackData.id };
          }
        }
      }
    } catch (resendErr) {
      console.error(`[EMAIL_SERVICE_ERR] Resend API call failed:`, resendErr.message);
    }
  }

  // 2. Try Nodemailer SMTP Transporter
  const mailer = getTransporter();
  if (mailer) {
    try {
      const info = await mailer.sendMail({
        from: config.from,
        to: to,
        subject: subject,
        html: html
      });
      console.log(`[EMAIL_SERVICE] 📩 Nodemailer SMTP delivered email to ${to} (MessageID: ${info.messageId})`);
      return { success: true, provider: "SMTP", messageId: info.messageId };
    } catch (smtpErr) {
      console.error(`[EMAIL_SERVICE_ERR] Nodemailer SMTP failed:`, smtpErr.message);
      return { success: false, error: smtpErr.message };
    }
  }

  console.warn(`[EMAIL_SERVICE_WARN] No active email provider configured (Resend API or SMTP). Email to ${to} not sent.`);
  return { success: false, error: "No active email credentials configured (Resend API key or SMTP settings)." };
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

  const result = await sendEmail({ to: email, subject, html });
  return { ...result, dashboardUrl };
}

/**
 * Sends a professional Demo Expiration Email to the prospect when time, calls, or duration expires.
 */
async function sendDemoExpirationEmail(demoData) {
  const {
    email,
    contactName = "Valued Customer",
    businessName = "Your Business",
    phoneNumber = "+18884918668",
    reason = "12_HOURS_EXPIRED", // 12_HOURS_EXPIRED, 5_CALLS_REACHED, 10_MINS_REACHED
    host = "naxtontechnologies.com"
  } = demoData;

  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const newDemoUrl = `${protocol}://${host}/demo/new`;

  let reasonTitle = "12-Hour Expiration Time Completed";
  let reasonDescription = "Your 12-hour demo access window has naturally expired.";

  if (reason === "5_CALLS_REACHED" || reason.includes("CALLS")) {
    reasonTitle = "5 Demo Calls Completed";
    reasonDescription = "You have completed the maximum limit of 5 demo calls for this session.";
  } else if (reason === "10_MINS_REACHED" || reason.includes("DURATION") || reason.includes("MINUTES")) {
    reasonTitle = "10 Minutes Total Call Duration Completed";
    reasonDescription = "You have completed the maximum total call duration limit of 10 minutes for this session.";
  }

  const subject = `Demo Expired: ${reasonTitle} — Naxton Technologies`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Demo Session Has Expired</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
    .header { background: linear-gradient(135deg, #e11d48 0%, #be123c 100%); padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 2px; color: #ffffff; }
    .content { padding: 30px; line-height: 1.6; }
    .badge { display: inline-block; background-color: rgba(244, 63, 94, 0.2); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.3); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
    .box { background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .reason { font-size: 18px; font-weight: 800; color: #fb7185; margin: 5px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 30px; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-top: 15px; }
    .footer { text-align: center; padding: 20px; font-size: 11px; color: #64748b; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>NAXTON TECHNOLOGIES</h1>
      <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;">Engineering Intelligent Software for Modern Businesses</p>
    </div>
    <div class="content">
      <div class="badge">🔴 DEMO SESSION EXPIRED</div>
      <h2 style="margin-top: 0; color: #ffffff;">Hello ${contactName},</h2>
      <p>Your AI receptionist demo session for <strong>${businessName}</strong> has ended, and your demo phone line (<strong>${phoneNumber}</strong>) has been automatically released back to our inventory pool.</p>

      <div class="box">
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8;">EXPIRATION REASON</div>
        <div class="reason">${reasonTitle}</div>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #cbd5e1;">
          ${reasonDescription}
        </p>
      </div>

      <div class="box" style="text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; margin-bottom: 10px;">NEED MORE TESTING?</div>
        <p style="font-size: 13px; color: #cbd5e1;">
          If you need additional testing time or would like to launch another live demo, click below to create a fresh demo session.
        </p>
        <a href="${newDemoUrl}" class="btn">BOOK ANOTHER DEMO &rarr;</a>
      </div>

      <p style="font-size: 12px; color: #94a3b8;">
        Ready to deploy a 24/7 permanent AI receptionist for your business? Contact our team at <a href="mailto:support@naxtontechnologies.com" style="color: #38bdf8;">support@naxtontechnologies.com</a>.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Naxton Technologies. All rights reserved.<br>
      Automated Inventory Release Protocol Enabled
    </div>
  </div>
</body>
</html>
  `;

  const result = await sendEmail({ to: email, subject, html });
  return result;
}

/**
 * Sends a test email to verify Resend or SMTP configuration.
 */
async function sendTestEmail(targetEmail) {
  const config = getEmailConfig();
  if (!config.configured) {
    return { success: false, error: "Email credentials missing. Please set up Resend API key or SMTP settings." };
  }

  const subject = "Naxton Technologies — Live Email Dispatch Test Successful";
  const html = `
    <div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 30px; border-radius: 12px; border: 1px solid #334155;">
      <h2 style="color: #38bdf8; margin-top: 0;">🎉 Resend / SMTP Connection Successful!</h2>
      <p>Your Naxton Technologies email delivery system is fully configured and operational.</p>
      <p style="font-size: 12px; color: #94a3b8;">Dispatched via ${config.resendApiKey ? 'Resend API' : config.host} on ${new Date().toLocaleString()}</p>
    </div>
  `;

  const result = await sendEmail({ to: targetEmail, subject, html });
  if (result.success) {
    return { success: true, message: `Test email successfully sent to ${targetEmail} via ${result.provider}!` };
  } else {
    return { success: false, error: result.error || "Failed to dispatch email" };
  }
}

module.exports = {
  getEmailConfig,
  sendEmail,
  sendDemoConfirmationEmail,
  sendDemoExpirationEmail,
  sendTestEmail
};
