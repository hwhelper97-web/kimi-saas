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

io.on("connection", (socket) => {
  console.log("[Socket.IO] Dashboard connected:", socket.id);

  socket.on("join-business", (businessId) => {
    socket.join(businessId);
    console.log(`[Socket.IO] Socket ${socket.id} joined room: ${businessId}`);
  });

  socket.on("disconnect", () => {
    console.log("[Socket.IO] Dashboard disconnected:", socket.id);
  });
});

// ─── WebSocket (Twilio Media Stream → Deepgram STT) ──────────────────────────
const wss = new WebSocket.Server({ server });

wss.on("connection", async (ws, req) => {
  let businessContext = null;
  let businessId = null;
  let callId = null;

  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    businessId = requestUrl.searchParams.get("businessId");
    callId = requestUrl.searchParams.get("callId");

    if (businessId) {
      businessContext = await prisma.business.findUnique({
        where: { id: businessId },
        include: { menuItems: true },
      });
    }
  } catch (err) {
    console.error("[WS] Business lookup failed:", err.message);
    // Continue without business context — don't crash the connection
  }

  console.log("[WS] Twilio connected", { businessId, callId });

  const deepgramWs = createDeepgram();
  let deepgramReady = false;

  deepgramWs.on("open", () => {
    deepgramReady = true;
    console.log("[Deepgram] Ready");
  });

  deepgramWs.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript || transcript.trim() === "") return;

    console.log(`[Deepgram] Transcript: "${transcript}"`);

    // Emit live transcript to the dashboard room
    if (businessId) {
      io.to(businessId).emit("live-transcript", { businessId, callId, text: transcript });
    }

    /* 
    // Generate AI reply (used for analytics / logging — TwiML still drives the Twilio side)
    try {
      const reply = await getAIResponse(transcript, {
        businessName: businessContext?.name,
        businessType: businessContext?.type,
        menuItems: businessContext?.menuItems?.map((i) => i.name) || [],
      });
      console.log(`[AI] Reply: "${reply}"`);
    } catch (err) {
      console.error("[AI] getAIResponse error:", err.message);
    }
    */
  });

  deepgramWs.on("error", (err) => {
    console.error("[Deepgram] WebSocket error:", err.message);
  });

  ws.on("message", (msg) => {
    // Only forward binary or JSON media events — skip plain text metadata
    const str = msg.toString();
    let data;
    try {
      data = JSON.parse(str);
    } catch {
      return;
    }

    if (data.event === "media" && deepgramReady) {
      const audioBuffer = Buffer.from(data.media.payload, "base64");
      if (deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.send(audioBuffer);
      }
    }
  });

  ws.on("close", () => {
    console.log("[WS] Call ended", { businessId, callId });
    if (deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }
  });

  ws.on("error", (err) => {
    console.error("[WS] Error:", err.message);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});
