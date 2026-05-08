require("dotenv").config();

const http = require("http");
const WebSocket = require("ws");
const { Server } = require("socket.io");

const app = require("./app");
const prisma = require("./config/prisma");

const { createDeepgram } = require("./services/deepgram");
const { getAIResponse } = require("./services/openai");

const server = http.createServer(app);

// ─── Socket.IO (dashboard real-time) ─────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*" },
});

app.set("io", io);

const chatHandler = require("./modules/support/chat.handler");

io.on("connection", (socket) => {
  console.log("[Socket.IO] New connection:", socket.id);

  // Dashboard logic
  socket.on("join-business", (businessId) => {
    socket.join(businessId);
    console.log(`[Socket.IO] Socket ${socket.id} joined business room: ${businessId}`);
  });

  // Support Chat logic
  chatHandler(io, socket);

  socket.on("disconnect", () => {
    console.log("[Socket.IO] Disconnected:", socket.id);
  });
});

// ─── WebSocket (Twilio Media Stream → AI Processor) ──────────────────────────
const wss = new WebSocket.Server({ noServer: true });
const { handleMediaStream } = require("./modules/call/stream.handler");

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  console.log(`[WEBSOCKET_UPGRADE] Requested Path: ${pathname}`);
  
  const { handleMediaStream, handleV2AgentEngine } = require("./modules/call/stream.handler");

  if (pathname.startsWith("/v2/stream")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleV2AgentEngine(ws, request, io).catch(err => {
        console.error("[V2 CRASH] Stream initialization failed:", err);
        ws.close();
      });
    });
  } else if (pathname.startsWith("/media-stream")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleMediaStream(ws, request, io).catch(err => {
        console.error("[V1 CRASH] Stream initialization failed:", err);
        ws.close();
      });
    });
  } else if (pathname.startsWith("/support/voice-stream")) {
    const { handleVoiceSupportStream } = require("./modules/support/voice-support.handler");
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleVoiceSupportStream(ws, request, io).catch(err => {
        console.error("[Support Voice CRASH] Stream initialization failed:", err);
        ws.close();
      });
    });
  }
  // Socket.IO is handled automatically by its own listener attached to 'server'
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 [NEXTON-AI-V2] Server LIVE on port ${PORT}`);
});
