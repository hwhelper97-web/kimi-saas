const WebSocket = require("ws");
const { OpenAI } = require("openai");

/**
 * Handle Twilio Media Stream and bridge to OpenAI Realtime API
 * This is a simplified version of the low-latency voice pipeline.
 */
exports.handleVoiceSupportStream = async (ws, req, io) => {
  console.log("[Voice Support] Media stream connected");

  // OpenAI Realtime API WebSocket URL
  const openAIUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
  const openAIWs = new WebSocket(openAIUrl, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  let streamSid = null;

  // Configuration for OpenAI Realtime
  const sessionConfig = {
    type: "session.update",
    session: {
      instructions: "You are a professional voice support assistant. Help customers with their inquiries and booking requests.",
      voice: "alloy",
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
      modalities: ["audio", "text"],
      temperature: 0.7,
    },
  };

  openAIWs.on("open", () => {
    console.log("[Voice Support] Connected to OpenAI Realtime");
    openAIWs.send(JSON.stringify(sessionConfig));
  });

  // Handle messages from Twilio
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.event) {
      case "start":
        streamSid = data.start.streamSid;
        console.log(`[Voice Support] Stream started: ${streamSid}`);
        break;
      case "media":
        if (openAIWs.readyState === WebSocket.OPEN) {
          const audioAppend = {
            type: "input_audio_buffer.append",
            audio: data.media.payload,
          };
          openAIWs.send(JSON.stringify(audioAppend));
        }
        break;
      case "stop":
        console.log("[Voice Support] Stream stopped");
        openAIWs.close();
        break;
    }
  });

  // Handle messages from OpenAI
  openAIWs.on("message", (data) => {
    const response = JSON.parse(data);

    if (response.type === "response.audio.delta" && streamSid) {
      const audioDelta = {
        event: "media",
        streamSid: streamSid,
        media: {
          payload: response.delta,
        },
      };
      ws.send(JSON.stringify(audioDelta));
    }

    if (response.type === "response.audio_transcript.done") {
      const prisma = require("../../config/prisma");
      console.log(`[Voice Support Transcript] ${response.transcript}`);
      // Persist transcript as a call log
      prisma.call.create({
        data: {
          tenantId: "system", 
          businessId: "system",
          fromNumber: "Unknown",
          toNumber: "Support Line",
          transcript: response.transcript,
          summary: "AI Support Voice Interaction"
        }
      }).catch(err => console.error("Failed to save call transcript:", err));
    }
  });

  ws.on("close", () => {
    openAIWs.close();
    console.log("[Voice Support] Twilio connection closed");
  });
};
