const WebSocket = require('ws');
const prisma = require("../../config/prisma");

/**
 * AI Lab Voice Session Handler
 * Enables "Virtual Phone" testing directly in the dashboard.
 */
async function handleVoiceLabSession(socket, io) {
  console.log(`[AI_LAB_VOICE] New session started: ${socket.id}`);

  let elWs = null;
  let isAiSpeaking = false;

  try {
    // 1. Fetch Global Settings
    const globalSettings = await prisma.globalAiSettings.findUnique({ where: { id: "global" } });

    // 2. Determine Agent ID from Slot Mapping
    let baseAgentId = "agent_5501kqtn1qjxe5nvyc9x6zyn8w8g"; // default fallback
    let isAgentId = true;
    let userProvidedId = baseAgentId;

    if (globalSettings) {
      const slot = globalSettings.apptAgentSlot; // e.g. 'slot1', 'slot2', 'slot3', 'slot4'
      if (slot && globalSettings[`${slot}Id`]) {
        baseAgentId = globalSettings[`${slot}Id`];
        userProvidedId = baseAgentId;
      }
    }
    
    const elUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${baseAgentId}`;
    const headers = { "xi-api-key": process.env.ELEVENLABS_API_KEY };

    elWs = new WebSocket(elUrl, { headers });

    elWs.on("open", () => {
      console.log(`[AI_LAB_VOICE] Connected to ElevenLabs: ${baseAgentId}`);
      socket.emit('ai_status', 'Listening...');

      // Initial Handshake
      const config = {
        type: "conversation_initiation_client_data",
        conversation_config_override: {
          agent: {
            first_message: "Hello! This is the AI Lab Voice Preview. I am ready to test my vocal interaction with you. How do I sound?",
          }
        }
      };

      // Add voice override if it's a Voice ID
      if (!isAgentId) {
        config.conversation_config_override.agent.voice = {
          voice_id: userProvidedId,
          stability: globalSettings.apptStability,
          similarity_boost: globalSettings.apptSimilarity
        };
      }

      elWs.send(JSON.stringify(config));
    });

    elWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'audio') {
        socket.emit('audio_chunk', msg.audio_event.audio_base_64);
        if (!isAiSpeaking) {
          isAiSpeaking = true;
          socket.emit('ai_status', 'AI Speaking...');
        }
      } else if (msg.type === 'agent_response') {
        // Agent finished speaking or update
      } else if (msg.type === 'user_transcript') {
        socket.emit('ai_status', 'Listening...');
        isAiSpeaking = false;
      }
    });

    elWs.on("close", () => {
      console.log(`[AI_LAB_VOICE] ElevenLabs disconnected.`);
      socket.emit('ai_status', 'Disconnected');
    });

    elWs.on("error", (err) => {
      console.error(`[AI_LAB_VOICE] ElevenLabs Error:`, err);
      socket.emit('ai_status', 'Error');
    });

    // 3. Receive Mic Data from Browser
    socket.on('mic_data', (buffer) => {
      if (elWs && elWs.readyState === WebSocket.OPEN) {
        // Convert PCM16 to Base64 as expected by ElevenLabs
        const base64 = Buffer.from(buffer).toString('base64');
        elWs.send(JSON.stringify({
          type: "user_audio_chunk",
          user_audio_chunk: base64
        }));
      }
    });

    socket.on('disconnect', () => {
      console.log(`[AI_LAB_VOICE] Client disconnected.`);
      if (elWs) elWs.close();
    });

  } catch (error) {
    console.error("[AI_LAB_VOICE] Critical Error:", error);
    socket.emit('ai_status', 'Critical Error');
  }
}

module.exports = { handleVoiceLabSession };
