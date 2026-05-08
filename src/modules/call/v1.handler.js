const WebSocket = require("ws");
const prisma = require("../../config/prisma");
const { createDeepgram } = require("../../services/deepgram");

/**
 * handleV1Stream (Legacy / Dashboard Transcription)
 * This handles the legacy /media-stream used for dashboard transcription.
 */
async function handleV1Stream(ws, req, io) {
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
    console.error("[WS V1] Business lookup failed:", err.message);
  }

  console.log("[WS V1] Twilio connected", { businessId, callId });

  const deepgramWs = createDeepgram();
  let deepgramReady = false;

  deepgramWs.on("open", () => {
    deepgramReady = true;
    console.log("[Deepgram V1] Ready");
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

    console.log(`[Deepgram V1] Transcript: "${transcript}"`);

    if (businessId && io) {
      io.to(businessId).emit("live-transcript", { businessId, callId, text: transcript });
      
      if (callId) {
        prisma.call.update({
          where: { id: callId },
          data: { 
            transcript: {
              set: (await prisma.call.findUnique({ where: { id: callId }, select: { transcript: true } }))?.transcript + " " + transcript
            }
          }
        }).catch(() => {});
      }
    }
  });

  deepgramWs.on("error", (err) => {
    console.error("[Deepgram V1] WebSocket error:", err.message);
  });

  ws.on("message", (msg) => {
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
    console.log("[WS V1] Call ended", { businessId, callId });
    if (deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }
  });

  ws.on("error", (err) => {
    console.error("[WS V1] Error:", err.message);
  });
}

module.exports = { handleV1Stream };
