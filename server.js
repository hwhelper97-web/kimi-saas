require("dotenv").config();

const http = require("http");
const WebSocket = require("ws");
const { Server } = require("socket.io");

const app = require("./app");
const prisma = require("./config/prisma");

const { createDeepgram } = require("./services/deepgram");
const { getAIResponse } = require("./services/openai");

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Dashboard connected:", socket.id);

  socket.on("join-business", (businessId) => {
    socket.join(businessId);
    console.log(`Joined room: ${businessId}`);
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", async (ws, req) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const businessId = requestUrl.searchParams.get("businessId");
  const callId = requestUrl.searchParams.get("callId");
  let businessContext = null;

  if (businessId) {
    businessContext = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        menuItems: true,
      },
    });
  }

  console.log("Twilio connected", {
    path: requestUrl.pathname,
    businessId,
    callId,
  });

  const deepgramWs = createDeepgram();
  let deepgramReady = false;

  deepgramWs.on("open", () => {
    console.log("Deepgram ready");
    deepgramReady = true;
  });

  deepgramWs.on("message", async (msg) => {
    let data;

    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    const transcript = data.channel?.alternatives?.[0]?.transcript;

    if (!transcript || transcript.trim() === "") {
      return;
    }

    console.log("User:", transcript);

    const io = app.get("io");

    if (io && businessId) {
      io.to(businessId).emit("live-transcript", {
        businessId,
        callId,
        text: transcript,
      });
    }

    try {
      const reply = await getAIResponse(transcript, {
        businessName: businessContext?.name,
        businessType: businessContext?.type,
        menuItems: businessContext?.menuItems?.map((item) => item.name) || [],
      });
      console.log("AI:", reply);
    } catch (err) {
      console.error("AI ERROR:", err.message);
    }
  });

  ws.on("message", (msg) => {
    if (typeof msg !== "string" && !msg.toString().startsWith("{")) {
      return;
    }

    let data;

    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.event === "media" && deepgramReady) {
      const audioBuffer = Buffer.from(data.media.payload, "base64");
      deepgramWs.send(audioBuffer);
    }
  });

  ws.on("close", () => {
    console.log("Call ended", { businessId, callId });

    if (deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }
  });

  ws.on("error", (err) => {
    console.error("WS Error:", err.message);
  });
});
app.use("/download", require("express").static("public"));
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
