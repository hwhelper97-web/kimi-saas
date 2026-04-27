const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const aiService = require("../../services/ai.service");
const speechService = require("../../services/speech.service");
const prisma = require("../../config/prisma");
const ttsService = require("../../services/tts.service");

/* =========================================
   🧠 DATE PARSER
========================================= */
const parseDate = (dateString) => {
  const now = new Date();

  if (!dateString) return now;

  const direct = new Date(dateString);
  if (!isNaN(direct.getTime())) return direct;

  const text = dateString.toLowerCase();
  let date = new Date(now);

  if (text.includes("tomorrow")) {
    date.setDate(now.getDate() + 1);
  }

  const match = text.match(/(\d{1,2})(am|pm)/);

  if (match) {
    let hour = parseInt(match[1]);
    const period = match[2];

    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    date.setHours(hour, 0, 0, 0);
  } else {
    date.setHours(12, 0, 0, 0);
  }

  if (date < now) {
    const future = new Date(now);
    future.setHours(now.getHours() + 1);
    return future;
  }

  return date;
};

const setupMediaStream = (server) => {
  const wss = new WebSocket.Server({
    server,
    path: "/api/call/media-stream"
  });

  wss.on("connection", async (ws, req) => {
    console.log("🎙️ Voice stream connected");

    const url = new URL(req.url, `http://${req.headers.host}`);
    const businessId = url.searchParams.get("businessId");

    let tenantId = null;

    try {
      const business = await prisma.business.findUnique({
        where: { id: businessId }
      });

      tenantId = business?.tenantId;
    } catch (err) {
      console.error("Business fetch error:", err);
    }

    let audioChunks = [];

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());

        /* ===============================
           🎧 COLLECT AUDIO
        =============================== */
        if (data.event === "media") {
          const chunk = Buffer.from(data.media.payload, "base64");
          audioChunks.push(chunk);
        }

        /* ===============================
           🛑 PROCESS WHEN CALL ENDS
        =============================== */
        if (data.event === "stop") {
          const filePath = path.join(__dirname, "call.wav");

          fs.writeFileSync(filePath, Buffer.concat(audioChunks));

          // 🎤 Speech → Text (Deepgram)
          const text = await speechService.transcribeAudio(filePath);
          console.log("🎤 TRANSCRIBED:", text);

          // 🤖 AI (OpenAI)
          let aiResult = await aiService.parseUserRequest(text);
          console.log("🤖 AI RESULT:", aiResult);

          /* ===============================
             🔥 FALLBACK INTENT
          =============================== */
          if (aiResult.intent === "unknown") {
            const lower = text.toLowerCase();

            if (
              lower.includes("haircut") ||
              lower.includes("appointment") ||
              lower.includes("booking")
            ) {
              aiResult.intent = "appointment";
              aiResult.serviceName = "haircut";
            }

            if (
              lower.includes("pizza") ||
              lower.includes("burger") ||
              lower.includes("order")
            ) {
              aiResult.intent = "order";
            }
          }

          /* ===============================
             🧠 GENERATE RESPONSE
          =============================== */
          let reply = "Sorry, I didn’t understand.";

          if (aiResult.intent === "appointment") {
            await prisma.appointment.create({
              data: {
                customerName: "Voice Caller",
                serviceName: aiResult.serviceName || "service",
                date: parseDate(aiResult.date),
                businessId,
                tenantId
              }
            });

            reply = `Your appointment for ${aiResult.serviceName || "service"} is booked successfully`;
          }

          if (aiResult.intent === "order") {
            await prisma.order.create({
              data: {
                customerName: "Voice Caller",
                total: 0,
                businessId,
                tenantId
              }
            });

            reply = "Your order has been placed successfully";
          }

          console.log("🗣️ AI REPLY:", reply);

          /* ===============================
             🔊 TEXT → SPEECH (Deepgram)
          =============================== */
          const audioPath = await ttsService.textToSpeech(reply);

          if (audioPath) {
            const publicUrl = `${process.env.BASE_URL}/audio/response.mp3`;

            console.log("🔊 AUDIO URL:", publicUrl);

            // 🔥 SEND SIGNAL (for Twilio redirect flow)
            ws.send(
              JSON.stringify({
                event: "play-audio",
                url: publicUrl
              })
            );
          }

          audioChunks = [];
        }

      } catch (err) {
        console.error("STREAM ERROR:", err);
      }
    });

    ws.on("close", () => {
      console.log("📴 Call disconnected");
    });
  });
};

module.exports = setupMediaStream;