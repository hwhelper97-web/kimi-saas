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
        // Notify agents of a new live call
        io.to("agent-monitoring").emit("live-call-started", { 
          streamSid, 
          from: "Customer", 
          startedAt: new Date() 
        });
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
        io.to("agent-monitoring").emit("live-call-ended", { streamSid });
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
      
      // Emit to monitoring agents
      io.to("agent-monitoring").emit("live-transcript-delta", {
        streamSid,
        text: response.transcript,
        sender: "AI"
      });

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
    
    // Also handle input transcript (customer speech)
    if (response.type === "conversation.item.input_audio_transcription.completed") {
       io.to("agent-monitoring").emit("live-transcript-delta", {
        streamSid,
        text: response.transcript,
        sender: "CUSTOMER"
      });
    }
  });

  ws.on("close", () => {
    openAIWs.close();
    console.log("[Voice Support] Twilio connection closed");
  });
};
