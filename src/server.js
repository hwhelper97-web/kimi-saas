require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const app = require("./app");
const prisma = require("./config/prisma");
const server = http.createServer(app);

// Services for Background Work
const SLAService = require("./services/sla.service");
const AnalyticsService = require("./services/analytics.service");

// ─── Socket.IO Setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
});

app.set("io", io);

// Socket Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error("Authentication error"));

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Authentication error"));
    socket.user = decoded;
    next();
  });
});

const chatHandler = require("./modules/support/chat.handler");

// Presence State
const onlineUsers = new Map();

io.on("connection", (socket) => {
  const { id: userId, tenantId, role } = socket.user;
  
  onlineUsers.set(userId, { socketId: socket.id, tenantId, role });
  socket.join(`user_${userId}`);
  
  if (tenantId) {
    socket.join(`tenant_${tenantId}`);
    io.to(`tenant_${tenantId}`).emit("presence-update", { userId, status: "online" });
  }

  chatHandler(io, socket, onlineUsers);

  // Business-specific room joining
  socket.on("join_business", (businessId) => {
    if (businessId) {
      socket.join(businessId);
      console.log(`[Socket] User ${userId} joined business room: ${businessId}`);
    }
  });

  // Global SuperAdmin room joining
  socket.on("join_superadmin", () => {
    if (role && role.toString().toUpperCase() === "SUPERADMIN") {
      socket.join("superadmin");
      console.log(`[Socket] SuperAdmin ${userId} joined global monitoring room.`);
      socket.emit("call_debug", {
        timestamp: new Date().toISOString(),
        type: 'success',
        message: "PLATFORM_MONITOR_ACTIVATED: Secure bridge to master call feed established.",
        businessId: "SYSTEM"
      });
    } else {
      console.warn(`[Socket] Unauthorized join_superadmin attempt from user ${userId} with role ${role}`);
    }
  });

  // 🚀 Global Application Telemetry Relay
  socket.on("app_event", (data) => {
    // Relay all application events to SuperAdmin Terminal
    io.to("superadmin").emit("app_telemetry", {
      ...data,
      timestamp: new Date().toISOString(),
      userId: userId,
      role: role,
      socketId: socket.id
    });
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    if (tenantId) {
      io.to(`tenant_${tenantId}`).emit("presence-update", { userId, status: "offline" });
    }
  });
});

// ─── Periodic Heartbeat (SLAs & Dashboard Metrics) ─────────────────────────────
// Every 60 seconds, check for SLA breaches and broadcast dashboard updates
setInterval(async () => {
  try {
    const tenants = await prisma.tenant.findMany({ 
        where: { tickets: { some: { status: { not: "resolved" } } } },
        select: { id: true } 
    });

    for (const tenant of tenants) {
      // 1. Check SLA Breaches
      const breaches = await SLAService.checkBreaches(tenant.id);
      for (const b of breaches) {
        // Only log if not already logged (simple check to avoid spam)
        const exists = await prisma.ticketActivity.findFirst({
          where: { ticketId: b.ticketId, action: "SLA_BREACH", createdAt: { gte: new Date(Date.now() - 3600000) } }
        });

        if (!exists) {
          await SLAService.logBreach(b.ticketId, 'SYSTEM', `${b.type} Breach: ${b.actual}m vs ${b.limit}m limit`);
          io.to(`tenant_${tenant.id}`).emit("ticket-activity", { 
            type: "SLA_BREACH", 
            ticketId: b.ticketId,
            breachType: b.type
          });
        }
      }

      // 2. Broadcast Live Metrics Update
      const metrics = await AnalyticsService.getMetrics(tenant.id, 30);
      io.to(`tenant_${tenant.id}`).emit("metrics-pulse", metrics);
    }
  } catch (error) {
    console.error("[Background Monitor] Error:", error);
  }
}, 60000);

// 🔬 AI Lab Voice Gateway (Virtual Phone)
const voiceLabNamespace = io.of('/ai-lab-voice');
voiceLabNamespace.on('connection', (socket) => {
  const { handleVoiceLabSession } = require("./modules/developer/voice-lab.handler");
  handleVoiceLabSession(socket, io);
});

// ─── WebSocket (Telephony) ────────────────────────────────────────────────────
const wss = new WebSocket.Server({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  const { handleMediaStream, handleV2AgentEngine } = require("./modules/call/stream.handler");

  if (pathname.startsWith("/v2/stream")) {
    wss.handleUpgrade(request, socket, head, (ws) => handleV2AgentEngine(ws, request, io));
  } else if (pathname.startsWith("/media-stream")) {
    wss.handleUpgrade(request, socket, head, (ws) => handleMediaStream(ws, request, io));
  } else if (pathname.startsWith("/support/voice-stream")) {
    const { handleVoiceSupportStream } = require("./modules/support/voice-support.handler");
    wss.handleUpgrade(request, socket, head, (ws) => handleVoiceSupportStream(ws, request, io));
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 [NAXTON-AI-V2] Realtime Server LIVE on port ${PORT}`);
  
  // 🚀 Auto-sync all Twilio Phone Webhooks & Inventory on startup
  try {
    const twilioService = require("./services/twilio");
    twilioService.syncAllTwilioWebhooks().catch(err => {
      console.warn("[TWILIO_STARTUP_SYNC_WARN]", err.message);
    });
  } catch (e) {}
});

module.exports = app;


