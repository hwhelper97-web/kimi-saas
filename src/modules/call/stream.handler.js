const WebSocket = require("ws");
const prisma = require("../../config/prisma");
const menuAliasService = require("../../services/menu-alias.service");
const { createDeepgram } = require("../../services/deepgram");
const { getAIResponse } = require("../../services/openai");
const { getElevenLabsAudio } = require("../../services/elevenlabs");
const IntegrationManager = require("../integrations/core/IntegrationManager");

const normalizeBusinessType = (businessType = "") => {
  const type = (businessType || "").toLowerCase();
  if (
    ["restaurant", "bakery", "cafe", "pizzeria", "food", "shop", "store", "order", "dish", "burger", "pizza", "sushi"].some(k => type.includes(k))
  ) {
    return "order";
  }
  // Default to appointment for everything else (Salons, Clinics, etc.)
  return "appointment";
};

const isOrderBusiness = (type = "") => normalizeBusinessType(type) === "order";

const activeStreams = new Map(); 
const convToBiz = new Map(); // 🗺️ MAP: ElevenLabs conv_id -> business_id

/**
 * handleMediaStream
 * Manages the WebSocket connection for a Twilio Media Stream.
 */
async function handleMediaStream(ws, req, io) {
  const isV2 = req.url.includes("/v2/stream");
  let streamSid = null;
  let callSid = null;
  
  // Extract CallSid from URL if possible or wait for 'start' event
  const urlParts = req.url.split("/");
  const urlCallSid = urlParts[urlParts.length - 1]; // Assume /v2/stream/:id or similar
  let businessId = null;
  let tenantId = null;
  let businessContext = null;
  let messages = [];
  let isAiSpeaking = false;
  let callRecord = null;
  let elevenLabsFailed = false;

  // 🚀 PURE V2 GLOBAL ENFORCEMENT
  // Per user request, the legacy V1 (Deepgram+OpenAI fallback) system has been completely disabled.
  // ALL incoming Twilio streams will now route directly to the ElevenLabs Agent Engine.
  return handleV2AgentEngine(ws, req, io);
  const deepgramWs = createDeepgram();
  let deepgramReady = false;

  deepgramWs.on("open", () => {
    deepgramReady = true;
    console.log("[STREAM] Deepgram STT ready");
  });

  deepgramWs.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch { return; }

    const transcript = data.channel?.alternatives?.[0]?.transcript;
    const isFinal = data.is_final;

    if (!transcript || transcript.trim() === "") return;

    if (isFinal) {
      console.log(`[STREAM] User said: "${transcript}"`);
      
      // Emit to dashboard
      if (businessId) {
        io.to(businessId).emit("call_transcribed", {
          callSid,
          text: transcript,
          role: "user"
        });
      }

      // 💾 INCREMENTAL SAVE: Update transcript in DB immediately
      if (callRecord) {
        const tempMessages = [...messages, { role: "user", content: transcript }];
        const liveTranscript = tempMessages
          .filter(m => m.role !== 'system')
          .map(m => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n");
        
        prisma.call.update({
          where: { id: callRecord.id },
          data: { transcript: liveTranscript }
        }).catch(() => null);
      }

      // If AI was speaking, this is an interruption
      if (isAiSpeaking) {
        console.log("[STREAM] Interruption detected. Clearing buffer...");
        // In a full implementation, we would send a 'clear' message to Twilio here
        // ws.send(JSON.stringify({ event: "clear", streamSid }));
      }

      messages.push({ role: "user", content: transcript });

      try {
        isAiSpeaking = true;
        // 3. Get AI Response
        const aiResponse = await getAIResponse(messages, { 
          businessName: businessContext?.name,
          businessType: businessContext?.type,
          address: businessContext?.address,
          city: businessContext?.city,
          aiPersonality: businessContext?.aiPersonality,
          menuItems: businessContext?.allMenuItems || []
        });
        
        console.log(`[STREAM] AI response: "${aiResponse}"`);
        messages.push({ role: "assistant", content: aiResponse });

        // Emit to dashboard
        if (businessId) {
          io.to(businessId).emit("call_transcribed", {
            callSid,
            text: aiResponse,
            role: "assistant"
          });
        }

        // 💾 INCREMENTAL SAVE: Update transcript in DB immediately
        if (callRecord) {
          const liveTranscript = messages
            .filter(m => m.role !== 'system')
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n");
          
          prisma.call.update({
            where: { id: callRecord.id },
            data: { transcript: liveTranscript }
          }).catch(() => null);
        }

        // --- REFINED COMPLETION DETECTION ---
        // We only trigger completion if the AI explicitly uses our finalization tokens 
        // AND it's at the end of the response to prevent accidental hangups.
        const isComplete = aiResponse.toUpperCase().includes("ORDER_COMPLETE") || 
                          aiResponse.toUpperCase().includes("APPT_COMPLETE");

        if (isComplete) {
          console.log("[STREAM] Order finalized by AI. Starting Extraction...");
          const { parseUserRequest } = require("../../services/openai");
          
          const fullTranscript = messages.map(m => `${m.role}: ${m.content}`).join("\n");
          const extracted = await parseUserRequest(fullTranscript, {
            businessType: businessContext?.type,
            menuItems: businessContext?.allMenuItems?.map(i => i.name) || []
          });

          console.log("[STREAM] Extraction Result:", JSON.stringify(extracted, null, 2));

          if (extracted && businessContext) {
            try {
              // 1. Calculate price correctly
              let total = 0;
              const itemsToCreate = [];

              for (const item of extracted.orderItems) {
                // Find closest match or use fallback
                const match = businessContext.allMenuItems.find(i => 
                  i.name.toLowerCase().includes(item.name.toLowerCase()) || 
                  item.name.toLowerCase().includes(i.name.toLowerCase())
                );

                if (match) {
                  total += (match.price * (item.quantity || 1));
                  itemsToCreate.push({
                    menuItemId: match.id,
                    quantity: item.quantity || 1,
                    selectedSize: item.size || null,
                    tenantId: businessContext.tenantId,
                    unitPrice: match.price
                  });
                } else {
                   console.warn(`[STREAM] Unmatched item: ${item.name}. Skipping to prevent crash.`);
                }
              }

              if (itemsToCreate.length === 0 && businessContext.allMenuItems.length > 0) {
                 // Final fallback: use the first menu item if everything else fails
                 itemsToCreate.push({
                   menuItemId: businessContext.allMenuItems[0].id,
                   quantity: 1,
                   tenantId: businessContext.tenantId,
                   unitPrice: businessContext.allMenuItems[0].price
                 });
                 total = businessContext.allMenuItems[0].price;
              }

              const tId = businessContext?.tenantId;
              const bId = businessContext?.id;

              if (tId && bId && itemsToCreate.length > 0) {
                const order = await prisma.order.create({
                  data: {
                    customerName: (extracted.customerName && extracted.customerName !== "Unknown") ? extracted.customerName : "Voice Customer",
                    total: total,
                    businessId: bId,
                    tenantId: tId,
                    callId: callRecord?.id || null,
                    status: "PENDING",
                    items: { create: itemsToCreate }
                  },
                  include: { items: { include: { menuItem: true } } }
                });

                // 🚀 FORCE EMIT TO BUSINESS ROOM
                io.to(businessId).emit("new_order", order);
                console.log(`[STREAM] Order ${order.id} saved and emitted to ${businessId}`);
              } else {
                console.warn(`[STREAM] Skipping order creation: Missing tId(${tId}) or bId(${bId}) or items(${itemsToCreate.length})`);
              }
            } catch (err) {
              console.error("[STREAM] Critical Order creation failure:", err);
            }
          }

          // 2. If it's an Appointment Business
          if (extracted && businessContext && businessContext.type !== 'restaurant') {
            try {
              const appointment = await prisma.appointment.create({
                data: {
                  customerName: extracted.customerName || "Voice Customer",
                  serviceName: extracted.serviceName || "General Service",
                  appointmentTime: extracted.date ? new Date(extracted.date) : new Date(),
                  businessId: businessContext.id,
                  tenantId: businessContext.tenantId,
                  status: "CONFIRMED",
                  source: "AI"
                }
              });
              io.to(businessId).emit("new_appointment", appointment);
              console.log(`[STREAM] Appointment ${appointment.id} saved and emitted to ${businessId}`);
            } catch (err) {
              console.error("[STREAM] Appointment creation failure:", err);
            }
          }

          // 📞 UNIVERSAL AUTO-HANGUP: Terminate call after 5 seconds
          setTimeout(async () => {
            try {
              const twilio = require('twilio');
              const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
              await client.calls(callSid).update({ status: 'completed' });
              console.log(`[STREAM] Auto-hangup executed for ${callSid}`);
            } catch (e) {
              console.warn("[STREAM] Auto-hangup failed or call already ended:", e.message);
            }
          }, 5000);
        }

        // 4. Synthesize with ElevenLabs (STREAMING for Ultra-Low Latency)
        // ⚡ Strip technical tokens from the spoken response
        const spokenResponse = aiResponse
          .replace(/ORDER_COMPLETE/gi, "")
          .replace(/APPT_COMPLETE/gi, "")
          .trim();

        let vid = businessContext?.aiVoice === 'eleven_custom' ? (businessContext?.aiVoiceId || null) : businessContext?.aiVoice.replace("eleven_", "");
        
        try {
          const { streamElevenLabsAudio } = require("../../services/elevenlabs");
          const response = await streamElevenLabsAudio(spokenResponse, vid, 'ulaw_8000');
          
          if (response && response.body && streamSid && ws.readyState === WebSocket.OPEN) {
            console.log("[STREAM] ElevenLabs streaming started");
            const reader = response.body.getReader();
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (ws.readyState !== WebSocket.OPEN) break;

              ws.send(JSON.stringify({
                event: "media",
                streamSid,
                media: { payload: Buffer.from(value).toString("base64") }
              }));
            }
            console.log("[STREAM] ElevenLabs streaming finished");
            audioBuffer = true;
          }
        } catch (err) {
          console.warn(`[STREAM] ElevenLabs Stream failed: ${err.message}. Using fallback.`);
        }

        // 🚀 PROFESSIONAL HANGUP: Triggered ONLY after the whole turn's audio is finished
        if (isComplete && audioBuffer) {
          setTimeout(async () => {
            try {
              const { hangupCall } = require("../../services/twilio");
              await hangupCall(callSid);
              console.log(`[STREAM] Auto-hangup executed for ${callSid}`);
            } catch (e) {}
          }, 7000);
        }
        
        // 🚀 FALLBACK: If streaming fails, use Deepgram Aura (very fast)
        if (!audioBuffer) {
          const { getDeepgramAuraAudio } = require("../../services/deepgram-tts");
          const fallbackAudio = await getDeepgramAuraAudio(spokenResponse, "aura-asteria-en").catch(() => null);
          if (fallbackAudio && streamSid && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              event: "media",
              streamSid,
              media: { payload: fallbackAudio.toString("base64") }
            }));

            if (isComplete) {
              setTimeout(async () => {
                try {
                  const { hangupCall } = require("../../services/twilio");
                  await hangupCall(callSid);
                } catch (e) {}
              }, 7000);
            }
          }
        }
      } catch (err) {
        console.error("[STREAM] AI/TTS error:", err.message);
      } finally {
        isAiSpeaking = false;
      }
    }
  });

  // 3. Handle Twilio WebSocket Messages
  // ⚡ Ensure context is loaded before we start processing events
  const contextPromise = (async () => {
    try {
      console.log(`[STREAM] Raw URL: ${req.url}`);
      
      // Extract businessId from path: /v2/stream/:businessId
      const parts = req.url.split('/');
      businessId = parts[parts.length - 1].split('?')[0]; 
      
      console.log(`[STREAM] Context Lookup - ID: ${businessId}`);
      
      if (businessId) {
        businessContext = await prisma.business.findUnique({
          where: { id: businessId },
          include: { 
            tenant: true,
            menuCategories: {
              include: {
                items: {
                  include: {
                    sizes: true,
                    optionGroups: { include: { options: true } }
                  }
                }
              }
            }
          }
        });
        
        if (businessContext) {
          console.log(`[STREAM] Context Loaded: ${businessContext.name}`);
          tenantId = businessContext.tenantId;
          
          // Flatten menu items for AI context
          const allItems = businessContext.menuCategories.flatMap(cat => cat.items);
          businessContext.allMenuItems = allItems;

          messages.push({ 
            role: "system", 
            content: `You are a professional voice assistant for ${businessContext.name}. 
            Your goal is to help customers make orders or book appointments. 
            Keep responses very short (1-2 sentences). 
            
            SPEECH STYLE: 
            - When listing menu items, SLOW DOWN. 
            - Use commas and periods to create pauses between items (e.g., "We have the Pepperoni Pizza... the Veggie Supreme... and the Spicy Kabob.").
            - Do NOT list everything at once unless asked.
            
            If the customer is finished with an order, end your response with "ORDER_COMPLETE".
            If they are finished booking, end with "APPOINTMENT_COMPLETE".
            Current date: ${new Date().toLocaleDateString()}.`
          });

          // Create Call Record
          callRecord = await prisma.call.create({
            data: {
              businessId: businessContext.id,
              tenantId: businessContext.tenantId,
              fromNumber: "Unknown",
              toNumber: businessContext.phoneNumber || "AI Agent",
              transcript: ""
            }
          });

          // Notify dashboard
          io.to(businessId).emit("call_started", {
            id: callRecord.id,
            from: "Voice Customer",
            status: "active"
          });

          return businessContext;
        } else {
          console.warn(`[STREAM] Business ${businessId} not found in DB`);
        }
      } else {
        console.warn("[STREAM] No businessId in WS URL");
      }
    } catch (err) {
      console.error("[STREAM] Context error:", err.message);
    }
    return null;
  })();

  const startTime = Date.now();

  ws.on("message", async (msg) => {
    // Wait for context to be ready if it's not yet
    if (!businessContext) await contextPromise;

    let data;
    try {
      const msgStr = msg.toString('utf-8');
      if (msgStr.startsWith('{')) {
        data = JSON.parse(msgStr);
      } else {
        return;
      }
    } catch (e) { return; }

    switch (data.event) {
      case "start":
        streamSid = data.start.streamSid;
        callSid = data.start.callSid;
        const customParams = data.start.customParameters || {};
        const toNumber = (data.start.to || "").replace(/[^0-9]/g, "").slice(-10);

        // 🛡️ V1 BLOCKADE CHECK
        const business = await prisma.business.findFirst({
           where: { phoneNumber: { contains: toNumber } }
        });

        if (business) {
          const isV2Eligible = ["RESTAURANT", "BAKERY", "CAFE", "PIZZERIA", "FOOD", "SHOP", "STORE"].includes(business.type?.toUpperCase()) || !!business.aiVoiceId || (business.aiVoice && business.aiVoice.startsWith("eleven_"));
          if (isV2Eligible) {
            console.warn(`[STREAM] Blocked redundant V1 stream for V2-eligible business: ${business.name}`);
            return ws.close(); // KILL THE GHOST!
          }
        }
        
        // Update Call Record with Twilio SID
        if (callRecord) {
          await prisma.call.update({
            where: { id: callRecord.id },
            data: { twilioSid: callSid }
          });
        }
        
        // 🚀 PROACTIVE GREETING: Send the first hello as soon as we connect
        if (businessContext) {
          const greeting = isOrderBusiness(businessContext.type)
            ? `Thanks for calling ${businessContext.name}! What can I get for you today?`
            : `Thanks for calling ${businessContext.name}! How can I help you today?`;
          
          (async () => {
            try {
              const vid = businessContext?.aiVoice === 'eleven_custom' ? (businessContext?.aiVoiceId || null) : businessContext?.aiVoice.replace("eleven_", "");
              
              // Try ElevenLabs STREAMING for the critical first greeting
              let streamSuccess = false;
              try {
                const { streamElevenLabsAudio } = require("../../services/elevenlabs");
                const response = await streamElevenLabsAudio(greeting, vid, 'ulaw_8000');
                
                if (response && response.body && streamSid && ws.readyState === WebSocket.OPEN) {
                  const reader = response.body.getReader();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (ws.readyState !== WebSocket.OPEN) break;
                    ws.send(JSON.stringify({
                      event: "media",
                      streamSid,
                      media: { payload: Buffer.from(value).toString("base64") }
                    }));
                  }
                  streamSuccess = true;
                }
              } catch (e) {
                console.warn("[STREAM GREETING] ElevenLabs Stream failed. Using fallback.");
              }
              
              if (!streamSuccess) {
                const { getDeepgramAuraAudio } = require("../../services/deepgram-tts");
                const fallbackAudio = await getDeepgramAuraAudio(greeting, "aura-asteria-en").catch(() => null);
                if (fallbackAudio && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ 
                    event: "media", 
                    streamSid, 
                    media: { payload: fallbackAudio.toString("base64") } 
                  }));
                }
              }

              if ((streamSuccess || true) && ws.readyState === WebSocket.OPEN) {
                messages.push({ role: "assistant", content: greeting });
                
                // Emit to dashboard
                io.to(businessId).emit("call_transcribed", {
                  callSid,
                  text: greeting,
                  role: "assistant"
                });
              }
            } catch (err) {
              console.error("[STREAM GREETING FATAL]", err.message);
            }
          })();
        }
        break;

      case "media":
        if (deepgramReady && deepgramWs.readyState === WebSocket.OPEN) {
          const audioBuffer = Buffer.from(data.media.payload, "base64");
          deepgramWs.send(audioBuffer);
        }
        break;

      case "stop":
        console.log(`[STREAM] Call stopped. StreamSid: ${streamSid}`);
        // Save full transcript
        if (callRecord) {
          const fullTranscript = messages
            .filter(m => m.role !== 'system')
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n");
          
          await prisma.call.update({
            where: { id: callRecord.id },
            data: { transcript: fullTranscript }
          }).catch(() => null);
          
          io.to(businessId).emit("call_ended", { callSid });
        }
        break;
    }
  });

  ws.on("close", async () => {
    if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.close();
    console.log("[STREAM] WebSocket closed");

    // FINAL CLOSE-OUT LOGIC
    if (callRecord) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      const fullTranscript = messages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

      // AI Analysis (Name & Summary)
      const { summarizeCall } = require("../../services/openai");
      const analysis = await summarizeCall(fullTranscript);

      await prisma.call.update({
        where: { id: callRecord.id },
        data: { 
          duration,
          transcript: fullTranscript,
          customerName: analysis.name || "Voice Customer",
          summary: analysis.summary || "No summary available",
          sentiment: analysis.sentiment,
          language: analysis.language
        }
      }).catch(err => console.error("[STREAM] Final update fail:", err.message));
      
      io.to(businessId).emit("call_ended", { callSid, duration, customerName: analysis.name });
    }
  });

  ws.on("error", (err) => {
    console.error("[STREAM] WebSocket error:", err.message);
  });
}

/**
 * 🚀 handleV2AgentEngine (ElevenLabs Direct Bridge)
 * This provides the 'Zero Latency' experience by bridging Twilio directly to ElevenLabs ConvAI.
 */
const bizCache = new Map();

async function handleV2AgentEngine(ws, req, io) {
  const businessId = req.url.split("/").pop().split("?")[0];
  let streamSid = null;
  let callSid = null;
  let callRecord = null;
  let startTime = Date.now();
  let transcript = "";
  let messages = [];
  let isAiSpeaking = false;
  let aiSpeakTimer = null;
  let aiEndTime = 0;
  let canStream = false;
  let fromNumber = "unknown"; 
  let audioBuffer = []; 
  let variableData = {}; 
  let routingConfig = null;
  let elWs = null;
  let business = null;
  let globalSettings = null;
  let isApptBiz = false;
  let isOrderBiz = false;

  console.log(`[V2_DEBUG] Initializing stream for business: ${businessId}`);

  // 🚀 1. FAST-PATH: Fetch only what we need for the handshake (Always fresh from DB)
  const quickBizPromise = (async () => {
    const biz = await prisma.business.findUnique({
      where: { id: businessId },
      select: { type: true, aiVoiceId: true, aiVoice: true, name: true, tenantId: true }
    });
    if (biz) bizCache.set(businessId, biz); // Still update cache for other uses
    return biz;
  })();

  // 🚀 2. DEEP-PATH: Fetch menu/slots in background
  const businessPromise = prisma.business.findUnique({
    where: { id: businessId },
    include: { 
      tenant: true, 
      menuCategories: { include: { items: { include: { aliases: true } } } }, 
      menuItems: { include: { aliases: true } },
      serviceCategories: { include: { services: { include: { aliases: true } } } },
      appointmentServices: { include: { aliases: true } }
    }
  }).then(b => {
    if (b) bizCache.set(businessId, { type: b.type, aiVoiceId: b.aiVoiceId, name: b.name });
    return b;
  }).catch(err => {
    console.error(`[V2_FATAL] Business Lookup failed: ${err.message}`);
    return null;
  });

// 🚀 SHARED SESSION MAP (Accessed by Webhooks)
const convToBiz = new Map();
exports.convToBiz = convToBiz;

  const globalSettingsPromise = prisma.globalAiSettings.findUnique({ where: { id: "global" } });

  // 🚀 2. START ELEVENLABS HANDSHAKE IMMEDIATELY (ZERO WAIT)
  let elHandshakePromise = (async () => {
    try {
      const [qBiz, settings] = await Promise.all([quickBizPromise, globalSettingsPromise]);
      if (!qBiz) return null;

      const isAppt = normalizeBusinessType(qBiz.type) === "appointment";
      const defaultOrderingAgent = "agent_9401kqqj87jzf9mrmfwsprqh3frh";
      const defaultAppointmentAgent = "agent_5501kqtn1qjxe5nvyc9x6zyn8w8g";
      
      let agentId = isAppt ? defaultAppointmentAgent : defaultOrderingAgent;
      if (settings) {
        const assignedSlot = isAppt ? settings.apptAgentSlot : settings.orderAgentSlot;
        if (assignedSlot && settings[`${assignedSlot}Id`]) agentId = settings[`${assignedSlot}Id`];
      }

      // 🛡️ SECURITY & STABILITY: Only use aiVoiceId if it looks like a real ElevenLabs ID (28 chars after 'agent_')
      // Placeholder slugs like 'agent_appt_sophie_luxe' will fallback to the default verified agent.
      if (qBiz.aiVoiceId && qBiz.aiVoiceId.startsWith("agent_") && qBiz.aiVoiceId.length > 30) {
        agentId = qBiz.aiVoiceId;
      }

      console.log(`[V2_HANDSHAKE] Connecting to ElevenLabs: agent_id=${agentId}`);
      logToTerminal(businessId, 'info', `Initiating ElevenLabs ConvAI Handshake (Agent: ${agentId})`);

      return new Promise((resolve, reject) => {
        const headers = { 
          "Origin": (process.env.BASE_URL || "https://naxton.ai").replace("http://", "https://"),
          "xi-api-key": process.env.ELEVENLABS_API_KEY
        };
        const elWs = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`, { headers });
        
        const timeout = setTimeout(() => {
          logToTerminal(businessId, 'error', "ElevenLabs Handshake Timed Out (10s)");
          reject(new Error("Handshake timeout"));
        }, 10000);

        elWs.on("open", () => {
          clearTimeout(timeout);
          console.log(`[V2_SOCKET] ElevenLabs connected for ${businessId}`);
          logToTerminal(businessId, 'success', "ElevenLabs WebSocket Connected.");
          resolve(elWs);
        });

        elWs.on("error", (err) => {
          clearTimeout(timeout);
          logToTerminal(businessId, 'error', `ElevenLabs Socket Error: ${err.message}`);
          reject(err);
        });
      });
    } catch (err) {
      console.error("[V2_EL_EARLY_FAIL]", err.message);
      return null;
    }
  })();

  // 🚀 3. ATTACH TWILIO LISTENER
  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      switch (data.event) {
        case "start":
          streamSid = data.start.streamSid;
          callSid = data.start.callSid;
          fromNumber = (data.start.from || "").replace(/[^0-9]/g, "").slice(-10);
          
          if (activeStreams.has(callSid)) {
            console.warn(`[V2] Duplicate stream detected for ${callSid}.`);
            return;
          }
          activeStreams.set(callSid, ws);
          
          console.log(`[V2] Call started: ${callSid} from ${fromNumber}`);
          logToTerminal(businessId, 'info', `Incoming call received from ${fromNumber}. (StreamSid: ${streamSid})`);
          
          // Start preparing greeting as soon as Twilio starts
          triggerAiGreeting(fromNumber); 
          break;

        case "media":
          if (elWs && elWs.readyState === WebSocket.OPEN && canStream) {
            const muLawBuffer = Buffer.from(data.media.payload, 'base64');
            const pcmBuffer = Buffer.alloc(muLawBuffer.length * 4); 
            for (let i = 0; i < muLawBuffer.length; i++) {
              let pcmSample = decodeMulaw(muLawBuffer[i]);
              pcmBuffer.writeInt16LE(pcmSample, i * 4);
              pcmBuffer.writeInt16LE(pcmSample, (i * 4) + 2);
            }
            elWs.send(JSON.stringify({ type: "user_audio_chunk", user_audio_chunk: pcmBuffer.toString('base64') }));
          }
          break;

        case "stop":
          console.log(`[V2] Call stopped.`);
          if (elWs && elWs.readyState === WebSocket.OPEN) elWs.close();
          break;
      }
    } catch (e) { console.error("[V2_TWILIO_ERR]", e.message); }
  });

  // 🚀 Helper for Real-time Terminal Logging
  function logToTerminal(businessId, type, message, data = {}) {
    if (!businessId) return;
    const logData = {
      timestamp: new Date().toISOString(),
      type, // 'info', 'success', 'warning', 'error', 'ai', 'tool'
      message,
      data,
      callSid,
      businessId
    };
    io.to(businessId).emit("call_debug", logData);
    io.to("superadmin").emit("call_debug", logData);
  }

  async function triggerAiGreeting(callerPhone = "Unknown") {
    try {
      const [biz, settings, wsEl] = await Promise.all([businessPromise, globalSettingsPromise, elHandshakePromise]);
      if (!biz || !wsEl) return;
      elWs = wsEl;
      business = biz;
      globalSettings = settings;

      if (!elWs.hasHandlersAttached) {
        setupElevenLabsHandlers(elWs);
        elWs.hasHandlersAttached = true;
      }

      logToTerminal(business.id, 'ai', `Voice Bridge Activated: Using ElevenLabs Agent [${business.aiVoiceId || 'Sarah_Default'}]`);

      isApptBiz = normalizeBusinessType(business.type) === "appointment";
      isOrderBiz = !isApptBiz;
      
      // 🚀 1. MASTER PROMPT CONFIGURATION
      const bizType = (business.subType || "").toLowerCase();
      const isMedical = bizType.includes("clinic") || bizType.includes("medical") || bizType.includes("dental");
      
      const termService = isMedical ? "treatments" : "services";
      const termStaff = isMedical ? "practitioners" : "stylists";

      const masterApptPrompt = `
You are ${business.aiName || "Sarah"}, the professional receptionist for ${business.name}.

# STRICT OPERATIONAL RULES:
- PHONE VERIFICATION: When you need a contact number, first say: "I see you're calling from {{caller_phone}}. Is this the best number to reach you if we need to contact you about your appointment?"
  - If they say YES, use '{{caller_phone}}'.
  - If they say NO, then ask for their preferred mobile number.
1. ${termService.toUpperCase()} MENU: You must ONLY suggest ${termService} from the official menu provided in context. Always state the exact price.
2. AVAILABILITY: NEVER suggest a time slot from memory. ALWAYS call the 'check_availability' tool.
3. BOOKING: When a user confirms a time, call 'book_appointment'. You must have their Name and the Service ID.
4. IDENTITY: You represent ${business.name}. Be warm, calm, and professional.
- DATES: Today is {{current_date}}. ALWAYS use the current year (2026) for all bookings.

# DATA CONTEXT:
- Your Business ID: {{business_id}}
- Current Date: {{current_date}}
- Business Hours: {{business_settings}}
- Available Services: {{services}}
- Availability Status: {{availability}}

# TOOL CALL RULES:
- You MUST ALWAYS pass the exact Business ID '{{business_id}}' as the 'businessId' parameter in every tool call.
`;

      // 🚀 1.5 PRE-HYDRATE PROMPT
      let servicesList = [];
      let staffList = [];
      let availString = "Available upon request (use check_availability tool).";

      if (isApptBiz) {
        staffList = await prisma.staff.findMany({
          where: { businessId: business.id, isActive: true },
          select: { name: true }
        }).catch(() => []);
        servicesList = (business.appointmentServices || []).filter(s => s.isActive);

        try {
          const slotService = require("../../services/slot.service");
          const oneWeekSchedule = await slotService.getOneWeekAvailability(business.tenantId, business.id);
          const scheduleLines = oneWeekSchedule.map(day => 
            `* ${day.dayOfWeek} (${day.date}): ${day.availableTimes.join(", ")}`
          ).join("\n");
          availString = `1-WEEK CALENDAR AVAILABILITY SCHEDULE (Suggest 3-4 of these exact timing slots to the caller when booking):\n${scheduleLines}`;
        } catch (e) {
          availString = "1-WEEK CALENDAR: Daily slots available at 10:00 AM, 01:30 PM, 03:30 PM, and 05:00 PM.";
        }
      }
      
      const vData = {
        business_id: business.id,
        business_name: business.name,
        agent_name: business.aiName || "Sarah",
        services: servicesList.map(s => `${s.name} ($${s.price})`).join(", "),
        availability: availString,
        staff_members: staffList.map(s => s.name).join(", "),
        business_settings: `Hours: ${business.openTime}-${business.closeTime}, Timezone: ${business.timezone || 'UTC'}.`,
        current_date: new Intl.DateTimeFormat('en-US', { 
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: business.timezone || 'UTC'
        }).format(new Date()),
        caller_phone: callerPhone
      };

      // 🍕 Build Restaurant-specific Menu Context strings
      const menuByCategoryLines = [];
      const menuDetailsLines = [];

      for (const cat of (business.menuCategories || [])) {
        if (cat.items && cat.items.length > 0) {
          const catItemNames = cat.items.map(item => item.name).join(", ");
          menuByCategoryLines.push(`* Category: ${cat.name} (Items: ${catItemNames})`);
          
          for (const item of cat.items) {
            menuDetailsLines.push(`- ${item.name} (${cat.name}): Price: $${item.price}, Ingredients/Description: ${item.description || 'None'}`);
          }
        }
      }

      const menuStr = `MENU CATEGORIES & ITEMS (Refer to this to know what items are in each category. NEVER read this entire list at once. List category names first, then up to 4 items when requested):
${menuByCategoryLines.join("\n")}

MENU DETAILS (Refer to this ONLY when asked specifically about an item's ingredients, toppings, description, or price):
${menuDetailsLines.join("\n")}`;

      const menuCategoriesStr = (business.menuCategories || []).map(c => c.name).join(", ");
      const itemAvailabilityStr = (business.menuItems || []).map(i => `${i.name}: ${i.isAvailable ? 'Available' : 'Out of stock'}`).join("\n");

      // 📅 Build Appointment-specific Calendar strings
      const bookedAppointments = Array.isArray(business.appointments) && business.appointments.length > 0
        ? business.appointments.map(a => {
            const d = new Date(a.appointmentTime);
            return new Intl.DateTimeFormat('en-US', { 
              weekday: 'short', month: 'short', day: 'numeric', 
              hour: '2-digit', minute: '2-digit', 
              timeZone: business.timezone || 'UTC' 
            }).format(d);
          }).join(" | ")
        : "None";

      // 🚀 Perform Dynamic Prompt Template Substitution
      let promptTemplate = isApptBiz 
        ? (globalSettings?.apptPrompt || masterApptPrompt) 
        : (globalSettings?.orderPrompt || "You are a professional assistant.");

      promptTemplate = promptTemplate
        .replace(/{{business_id}}/g, business.id)
        .replace(/{{system_business_id}}/g, business.id)
        .replace(/{{business_name}}/g, business.name)
        .replace(/{{agent_name}}/g, business.aiName || "Sarah")
        .replace(/{{current_date}}/g, vData.current_date)
        .replace(/{{caller_phone}}/g, vData.caller_phone)
        .replace(/{{business_settings}}/g, vData.business_settings)
        .replace(/{{business_type}}/g, business.type)
        .replace(/{{business_address}}/g, business.address || "our physical location")
        .replace(/{{business_phone}}/g, business.phoneNumber)
        .replace(/{{business_hours}}/g, `Open from ${business.openTime} to ${business.closeTime}`)
        .replace(/{{business_days}}/g, business.timings || "Every day")
        .replace(/{{delivery_available}}/g, business.deliveryAvailable ? "Yes" : "No")
        .replace(/{{pickup_available}}/g, business.takeawayAvailable ? "Yes" : "No")
        .replace(/{{dinein_available}}/g, business.dineInAvailable ? "Yes" : "No")
        .replace(/{{delivery_radius}}/g, `${business.deliveryRadius || 5} miles`);

      if (isApptBiz) {
        promptTemplate = promptTemplate
          .replace(/{{services}}/g, vData.services)
          .replace(/{{availability}}/g, vData.availability)
          .replace(/{{staff_members}}/g, vData.staff_members)
          .replace(/{{calendar}}/g, bookedAppointments);
      } else {
        promptTemplate = promptTemplate
          .replace(/{{menu}}/g, menuStr)
          .replace(/{{menu_categories}}/g, menuCategoriesStr)
          .replace(/{{item_availability}}/g, itemAvailabilityStr);
      }

      const finalPrompt = promptTemplate;

      const firstMsg = isApptBiz 
        ? `Hello, thank you for calling ${business.name}. This is ${business.aiName || "Sarah"}. How can I help you today?`
        : `Thank you for calling ${business.name}. This is ${business.aiName || "Sarah"}. How may I assist you today?`;

      // 🚀 2. INSTANT GREETING (Zero Latency Path)
      const initiationData = {
        type: "conversation_initiation_client_data",
        dynamic_variables: {
          business_id: business.id,
          system_business_id: business.id,
          business_name: business.name,
          agent_name: business.aiName || "Sarah",
          current_date: vData.current_date,
          caller_phone: vData.caller_phone,
          business_settings: vData.business_settings,
          business_type: business.type,
          business_address: business.address || "our physical location",
          business_phone: business.phoneNumber,
          business_hours: `Open from ${business.openTime} to ${business.closeTime}`,
          business_days: business.timings || "Every day",
          delivery_available: business.deliveryAvailable ? "Yes" : "No",
          pickup_available: business.takeawayAvailable ? "Yes" : "No",
          dinein_available: business.dineInAvailable ? "Yes" : "No",
          delivery_radius: `${business.deliveryRadius || 5} miles`,
          menu: menuStr,
          menu_categories: menuCategoriesStr,
          item_availability: itemAvailabilityStr,
          services: vData.services,
          availability: vData.availability,
          staff_members: vData.staff_members,
          calendar: bookedAppointments
        },
        conversation_config_override: {
          agent: {
            prompt: { prompt: finalPrompt },
            first_message: firstMsg,
            tools: isApptBiz ? [
              {
                type: "client",
                name: "get_salon_services",
                description: "Get the list of available services, their prices, and durations.",
                parameters: { 
                  type: "object", 
                  properties: {
                    businessId: { type: "string", description: "The Business ID: {{business_id}}" }
                  },
                  required: ["businessId"]
                }
              },
              {
                type: "client",
                name: "check_salon_availability",
                description: "Check available time slots for a specific service on a specific date.",
                parameters: {
                  type: "object",
                  properties: {
                    businessId: { type: "string", description: "The Business ID: {{business_id}}" },
                    serviceId: { type: "string", description: "The ID of the service." },
                    date: { type: "string", description: "The date in YYYY-MM-DD format. ALWAYS use the year 2026." }
                  },
                  required: ["businessId", "date"]
                }
              },
              {
                type: "client",
                name: "book_salon_appointment",
                description: "Create a new appointment booking.",
                parameters: {
                  type: "object",
                  properties: {
                    businessId: { type: "string", description: "The Business ID: {{business_id}}" },
                    serviceId: { type: "string", description: "The ID of the service." },
                    customerName: { type: "string", description: "Full name of the customer." },
                    customerPhone: { type: "string", description: "Mobile number of the customer. Use '{{caller_phone}}' if they confirmed it is best." },
                    date: { type: "string", description: "The date in YYYY-MM-DD format. ALWAYS use the year 2026." },
                    time: { type: "string", description: "The time in HH:mm format." }
                  },
                  required: ["businessId", "serviceId", "customerName", "customerPhone", "date", "time"]
                }
              }
            ] : [
              {
                type: "client",
                name: "get_menu",
                description: "Get the live menu, items, prices, and categories of the restaurant.",
                parameters: {
                  type: "object",
                  properties: {
                    businessId: { type: "string", description: "The Business ID: {{business_id}}" }
                  },
                  required: ["businessId"]
                }
              },
              {
                type: "client",
                name: "create_order",
                description: "Create a new food or product order for the customer.",
                parameters: {
                  type: "object",
                  properties: {
                    customerName: { type: "string", description: "Name of the customer." },
                    items: {
                      type: "array",
                      description: "List of menu items being ordered.",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "The name of the menu item." },
                          quantity: { type: "integer", description: "The quantity of this item." }
                        },
                        required: ["name", "quantity"]
                      }
                    },
                    notes: { type: "string", description: "Special instructions or notes for the order." }
                  },
                  required: ["items"]
                }
              }
            ]
          }
        }
      };

      if (business.aiVoice && business.aiVoice.startsWith('eleven_')) {
        initiationData.conversation_config_override.tts = {
          voice_id: business.aiVoice.replace('eleven_', '')
        };
      }

      elWs.send(JSON.stringify(initiationData));
      canStream = true;
      console.log(`[V2] INSTANT GREETING SENT to ElevenLabs for ${business.name}`);
      logToTerminal(business.id, 'info', `AI Handshake initiated for ${business.name}.`);

      // 🚀 3. PERSISTENT LOGGING & REAL-TIME SYNC
      callRecord = await prisma.call.create({
        data: { 
          twilioSid: callSid, 
          businessId: business.id, 
          tenantId: business.tenantId, 
          fromNumber: fromNumber || "Voice", 
          toNumber: business.phoneNumber || "Reception", 
          outcome: "active" 
        }
      });

      const startData = { 
        id: callRecord.id, 
        from: fromNumber || "Voice Customer", 
        status: "active", 
        businessId: business.id, 
        businessName: business.name 
      };
      
      io.to(business.id).emit("call_started", startData);
      io.to("superadmin").emit("call_started", startData);
      
      console.log(`[V2] AI SESSION READY for ${business.name}. Call ID: ${callRecord.id}`);

    } catch (err) { console.error("[V2_GREET_FAIL]", err.message); }
  }

  function setupElevenLabsHandlers(targetWs) {
    targetWs.on("error", (err) => {
      console.error(`[V2_ELEVENLABS_ERROR] Business: ${businessId} | Error:`, err.message);
    });

    targetWs.on("close", (code, reason) => {
      console.warn(`[V2_ELEVENLABS_CLOSE] Business: ${businessId} | Code: ${code} | Reason: ${reason || "No reason provided"}`);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });

    // 🚀 LISTEN FOR AI EVENTS
    targetWs.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        console.log(`[EL_RAW] ${data.type}`);
        
        // 🧪 DEBUG_RAW: Log all non-audio messages
        if (data.type !== "audio") {
          console.log(`[EL_V2_MESSAGE] Type: ${data.type}`, JSON.stringify(data));
        }

        // 🔗 MAPPING HANDSHAKE
        if (data.type === "conversation_initiation_metadata" || data.type === "metadata" || data.conversation_id) {
          const convId = data.conversation_id || 
                         data.conversation_initiation_metadata?.conversation_id || 
                         data.metadata?.conversation_id;
                         
          if (convId && businessId) {
            if (!convToBiz.has(convId)) {
              convToBiz.set(convId, businessId);
              console.log(`[V2_MAPPING] SUCCESS: ${convId} -> ${businessId}`);
              
              // Notify SuperAdmin Terminal
              io.to("superadmin").emit("call_debug", {
                timestamp: new Date().toISOString(),
                type: 'success',
                message: `[MAPPING] Session ${convId} linked to Business ${businessId}`,
                businessId: businessId
              });
              
              // Cleanup after 2 hours (7,200,000 ms)
              setTimeout(() => convToBiz.delete(convId), 2 * 60 * 60 * 1000);
            }
          }
        }
      
      if (data.type === "audio") {
        isAiSpeaking = true; // 🛡️ LOCK: AI is now talking
        if (aiSpeakTimer) clearTimeout(aiSpeakTimer);
        
        const payload = data.audio || data.audio_event?.audio_base_64;
        if (!payload) return;
        
        if (!streamSid) {
          console.log(`[V2] Buffering initial audio event (Waiting for streamSid)`);
          audioBuffer.push(payload);
          logToTerminal(businessId, 'info', "AI generated early audio. Buffering...");
          return;
        }

        // 🚀 FLUSH BUFFERED AUDIO
        if (audioBuffer.length > 0) {
          console.log(`[V2] Flushing ${audioBuffer.length} buffered audio chunks`);
          logToTerminal(businessId, 'info', `Flushing ${audioBuffer.length} buffered audio chunks...`);
          const temp = [...audioBuffer];
          audioBuffer = [];
          for (const p of temp) processAndSendAudio(p);
        }

        processAndSendAudio(payload);

        function processAndSendAudio(audioPayload) {
          if (ws.readyState !== WebSocket.OPEN) return;
          
          const pcmBuffer = Buffer.from(audioPayload, 'base64');
          
          // ⚡ DIGITAL TRANSFORMER: 16-bit PCM (16kHz) -> 8-bit mu-law (8kHz)
          const stride = 4; 
          const muLawBuffer = Buffer.alloc(Math.floor(pcmBuffer.length / stride));
          
          for (let i = 0; i < muLawBuffer.length; i++) {
            const pcmSample = pcmBuffer.readInt16LE(i * stride);
            muLawBuffer[i] = encodeMulaw(pcmSample);
          }

          const CHUNK_SIZE = 320; // ⚡ 40ms chunks for better sound clarity and lower jitter
          for (let i = 0; i < muLawBuffer.length; i += CHUNK_SIZE) {
            const chunk = muLawBuffer.slice(i, i + CHUNK_SIZE);
            if (ws.readyState !== WebSocket.OPEN) break;
            ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: chunk.toString('base64') } }));
          }

          const chunkDurationMs = (muLawBuffer.length / 8000) * 1000;
          const now = Date.now();
          if (!aiEndTime || aiEndTime < now) aiEndTime = now;
          aiEndTime += chunkDurationMs;
          
          if (aiSpeakTimer) clearTimeout(aiSpeakTimer);
          aiSpeakTimer = setTimeout(() => { isAiSpeaking = false; }, (aiEndTime - now) + 400);
        }
      }
      if (data.type === "interruption") {
        console.log(`[V2] INTERRUPTED! Clearing Twilio audio buffer for ${callSid}`);
        if (ws.readyState === WebSocket.OPEN && streamSid) {
          ws.send(JSON.stringify({ event: "clear", streamSid }));
        }
        isAiSpeaking = false;
        if (aiSpeakTimer) clearTimeout(aiSpeakTimer);
      }

      if (data.type === "user_transcript") {
         const event = data.user_transcription_event || data.user_transcript_event || data.transcript_event || data;
         const text = event.user_transcript || event.text || event.transcript;
          if (text && text.trim().length > 1 && !text.includes("???")) {
            transcript += `User: ${text}\n`;
            messages.push({ role: "user", content: text });
            const transData = { callSid, text, role: "user", businessId };
            io.to(businessId).emit("call_transcribed", transData);
            io.to("superadmin").emit("call_transcribed", transData);
          }
      }

      if (data.type === "agent_response") {
         const event = data.agent_response_event || data.transcript_event || data;
         const text = event.agent_response || event.text || event.transcript;
         if (text) {
           transcript += `AI: ${text}\n`;
           messages.push({ role: "assistant", content: text });
           const transData = { callSid, text, role: "ai", businessId };
           io.to(businessId).emit("call_transcribed", transData);
           io.to("superadmin").emit("call_transcribed", transData);
           logToTerminal(businessId, 'ai', text);
           if (text.toUpperCase().includes("TRANSFER_CALL") && routingConfig?.transferNumber) {
             require("../../services/twilio").transferCall(callSid, routingConfig.transferNumber);
           }
         }
      }

      // 🛠️ TOOL CALL HANDLER
      if (data.type === "client_tool_call") {
        const { tool_name, parameters, call_id } = data.client_tool_call;
        console.log(`[V2_TOOL] Executing: ${tool_name}`, parameters);
        logToTerminal(businessId, 'tool', `AI calling tool: ${tool_name}`);

        const aiTools = require("../../services/ai-tools.service");
        let result = { success: false, error: "Tool not found" };

        try {
          if (tool_name === "get_salon_services" || tool_name === "get_services") {
            result = await aiTools.getBusinessServices(businessId, business.tenantId);
          } else if (tool_name === "get_menu" || tool_name === "get_restaurant_menu") {
            result = await aiTools.getBusinessMenu(businessId);
          } else if (tool_name === "check_salon_availability" || tool_name === "check_availability") {
            result = await aiTools.getAvailableSlots(businessId, business.tenantId, parameters.serviceId, parameters.date);
          } else if (tool_name === "book_salon_appointment" || tool_name === "book_appointment") {
            // Parse date/time into appointmentTime if needed
            const date = parameters.date;
            const time = parameters.time || parameters.appointmentTime;
            const apptTime = (date && time) ? new Date(`${date}T${time}:00`) : parameters.appointmentTime;

            result = await aiTools.bookAppointment({
              ...parameters,
              appointmentTime: apptTime,
              businessId,
              tenantId: business.tenantId,
              customerPhone: fromNumber,
              callId: callRecord?.id,
              source: "AI"
            });

            if (result.success) {
               console.log(`[V2_TOOL] Booking Success! Emitting to dashboard and updating call status.`);
               
               // 1. Update Call Outcome for Analytics
               await prisma.call.updateMany({
                 where: { businessId, outcome: "active" },
                 data: { outcome: "success", actionTaken: `Booked ${result.booking?.service?.name || 'Appointment'}` }
               });

               // 2. Notify Dashboard Layers
               const data = result.booking;
               io.to(businessId).emit("new_appointment", data);
               io.to(`tenant_${business.tenantId}`).emit("new_appointment", data);
               io.to("superadmin").emit("new_appointment", data);
            }
          } 
          else if (tool_name === "create_order" || tool_name === "create-order") {
             // Proxy to createOrder logic
             const { customerName, items, notes } = parameters;
             
             // Reuse createOrder-like logic here or call a service
             const orderController = require("../webhooks/webhooks.controller");
             // We can mock req/res or just extract the logic
             // For simplicity, let's just use the logic directly here
             
             const business = await prisma.business.findUnique({ where: { id: businessId } });
             let total = 0;
             const orderItems = [];

             if (items && Array.isArray(items)) {
               for (const item of items) {
                 const menuItem = await prisma.menuItem.findFirst({
                   where: { 
                     OR: [
                       { id: item.id || "" },
                       { name: { contains: item.name || "", mode: 'insensitive' } }
                     ],
                     businessId
                   }
                 });
                 if (menuItem) {
                   const qty = parseInt(item.quantity) || 1;
                   const price = menuItem.price * qty;
                   total += price;
                   orderItems.push({
                     menuItemId: menuItem.id,
                     quantity: qty,
                     unitPrice: menuItem.price,
                     totalPrice: price,
                     tenantId: business.tenantId
                   });
                 }
               }
             }

             if (business.taxRate) total *= (1 + (business.taxRate / 100));

             const order = await prisma.order.create({
               data: {
                 businessId,
                 tenantId: business.tenantId,
                 customerName: customerName || "Voice Guest",
                 total,
                 notes,
                 status: "pending",
                 source: "AI",
                 items: { create: orderItems }
               },
               include: { items: { include: { menuItem: true } } }
             });

             const displayId = `#A${String(order.orderNumber).padStart(3, '0')}`;
             const finalOrder = { ...order, displayId };

             result = { success: true, message: "Order placed", order: finalOrder };

             // 1. Update Call Outcome
             await prisma.call.updateMany({
               where: { businessId, outcome: "active" },
               data: { outcome: "success", actionTaken: `Placed Order ${displayId}` }
             });

             // 2. Notify Dashboard
             io.to(businessId).emit("new_order", finalOrder);
             io.to(`tenant_${business.tenantId}`).emit("new_order", finalOrder);
             io.to("superadmin").emit("new_order", finalOrder);
          }

          // Send response back to ElevenLabs
          targetWs.send(JSON.stringify({
            type: "tool_response",
            tool_call_id: call_id,
            output: JSON.stringify(result)
          }));
          
          logToTerminal(businessId, 'success', `Tool ${tool_name} returned success.`);
        } catch (toolErr) {
          console.error(`[V2_TOOL_ERR] ${tool_name}:`, toolErr.message);
          targetWs.send(JSON.stringify({
            type: "tool_response",
            tool_call_id: call_id,
            output: JSON.stringify({ success: false, error: toolErr.message })
          }));
        }
      }
    } catch (err) {
      console.error("[V2] Error parsing ElevenLabs message:", err.message);
    }
    });

    targetWs.on("close", (code, reason) => {
      console.warn(`[V2_ELEVENLABS_CLOSE] Business: ${businessId} | Code: ${code} | Reason: ${reason || "No reason provided"}`);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });
  }

  ws.on("close", async () => {
    console.log("[V2] Twilio connection closed");
    if (callSid) activeStreams.delete(callSid); // 🛡️ UNLOCK for next call
    if (elWs.readyState === WebSocket.OPEN) elWs.close();

    // 🏁 FINAL PROCESSING (Orders & Summaries)
    try {
      if (callRecord && messages.length > 0) {
        const duration = Math.round((Date.now() - startTime) / 1000);
        const fullTranscript = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

        const { summarizeCall, parseUserRequest } = require("../../services/openai");
        const analysis = await summarizeCall(fullTranscript);

        // 🛡️ RECORD USAGE
        const billingService = require("../../services/billing.service");
        await billingService.recordCallUsage(callRecord.tenantId, duration).catch(() => null);

        await prisma.call.update({
          where: { id: callRecord.id },
          data: {
            duration,
            transcript: fullTranscript,
            customerName: analysis.name || "Voice Customer",
            summary: analysis.summary || "No summary available",
            sentiment: analysis.sentiment,
            language: analysis.language
          }
        });

        // 🍕 ORDER EXTRACTION (For Restaurants)
        if (isOrderBiz) {
          const extracted = await parseUserRequest(fullTranscript, {
            businessType: business.type,
            menuItems: (business.menuItems || []).map(i => i.name)
          });

          if (extracted && extracted.orderItems && extracted.orderItems.length > 0 && extracted.status === 'confirmed') {
            let total = 0;
            const itemsToCreate = [];
            for (const item of extracted.orderItems) {
              // 🤖 Enhanced fuzzy matching
              const matchData = await menuAliasService.matchItem(business.id, item.name);
              let match = null;
              if (matchData) {
                match = matchData.item;
              } else {
                const iName = item.name.toLowerCase();
                match = (business.menuItems || []).find(m => {
                  const mName = m.name.toLowerCase();
                  return mName.includes(iName) || iName.includes(mName);
                });
              }
              
              if (match) {
                total += (match.price * (item.quantity || 1));
                itemsToCreate.push({
                  menuItemId: match.id,
                  quantity: item.quantity || 1,
                  tenantId: business.tenantId,
                  unitPrice: match.price
                });
              } else {
                // 🛡️ If AI found an item but we can't link it to a DB ID, put it in notes so kitchen sees it!
                const unmatchedNote = `${item.quantity || 1}x ${item.name} (Unmatched Item)`;
                extracted.notes = (extracted.notes ? extracted.notes + " | " : "") + unmatchedNote;
              }
            }

            if (itemsToCreate.length > 0) {
              // 🚀 Combine item-level notes into a single string for the kitchen
              let combinedNotes = extracted.notes || "";
              extracted.orderItems.forEach(oi => {
                if (oi.notes) {
                  combinedNotes += (combinedNotes ? " | " : "") + `${oi.name}: ${oi.notes}`;
                }
              });

              const order = await prisma.order.create({
                data: {
                  customerName: (extracted.customerName && extracted.customerName !== "Unknown") ? extracted.customerName : (analysis.name !== "Unknown" ? analysis.name : "Voice Customer"),
                  customerPhone: fromNumber || "Unknown",
                  total: total,
                  businessId: business.id,
                  tenantId: business.tenantId,
                  callId: callRecord.id,
                  notes: combinedNotes,
                  items: { create: itemsToCreate }
                },
                include: { items: { include: { menuItem: true } } }
              });

              // 🚀 Calculate displayId for real-time UI (#A001 style)
              const orderWithDisplay = { 
                ...order, 
                displayId: `#A${String(order.orderNumber).padStart(3, '0')}` 
              };

              io.to(businessId).emit("new_order", orderWithDisplay);
              logToTerminal(businessId, 'success', `ORDER CREATED: ${orderWithDisplay.displayId} for ${orderWithDisplay.customerName}. Total: $${total.toFixed(2)}`);

              // 🚀 POS INJECTION (Clover / Toast)
              try {
                const connectedIntegrations = await prisma.integration.findMany({ 
                  where: { businessId: business.id, status: "CONNECTED" } 
                });
                for (const integration of connectedIntegrations) {
                  const adapter = await IntegrationManager.getProviderInstance(business.id, integration.provider);
                  if (adapter) {
                    await adapter.pushOrder(order);
                  }
                }
              } catch (posErr) {
                console.error("[POS_INJECTION_FAILED]", posErr.message);
              }
            }
          }
        }

        // 📅 APPOINTMENT EXTRACTION (For Salons / Appointments) - Fallback if tool wasn't called
        if (isApptBiz) {
          // Check if already created via tool call during conversation
          const existingAppt = await prisma.appointment.findFirst({
            where: { callId: callRecord.id }
          });

          if (!existingAppt) {
            const extracted = await parseUserRequest(fullTranscript, {
              businessType: "appointment"
            });

            if (extracted && (extracted.serviceName || extracted.intent === 'appointment') && extracted.status !== 'cancelled') {
              let apptDate = new Date(extracted.date);
              if (isNaN(apptDate.getTime())) {
                  const dateService = require("../../services/date.service");
                  apptDate = dateService.buildDateTime(extracted.date || "", extracted.time || "");
              }

              // 🛡️ YEAR ENFORCEMENT: Force to 2026 to avoid invisibility
              if (!isNaN(apptDate.getTime()) && apptDate.getFullYear() !== 2026) {
                apptDate.setFullYear(2026);
              }

              try {
                // Fuzzy match service name to ID
                const allServices = await prisma.appointmentService.findMany({
                  where: { businessId: business.id, tenantId: business.tenantId }
                });
                const match = allServices.find(s => 
                  s.name.toLowerCase().includes(extracted.serviceName.toLowerCase()) ||
                  extracted.serviceName.toLowerCase().includes(s.name.toLowerCase())
                );

                const appointment = await appointmentService.createBooking({
                  tenantId: business.tenantId,
                  businessId: business.id,
                  serviceId: match ? match.id : (allServices[0]?.id), // Fallback to first service or handle error
                  customerName: extracted.customerName || analysis.name || "Voice Customer",
                  customerPhone: fromNumber || extracted.customerPhone || "Unknown",
                  appointmentTime: apptDate,
                  callId: callRecord.id,
                  source: "AI",
                  notes: extracted.notes || "Automatically extracted from voice call summary."
                });

                io.to(businessId).emit("new_appointment", appointment);
                logToTerminal(businessId, 'success', `APPOINTMENT EXTRACTED: ${appointment.service.name} for ${appointment.customerName}.`);
              } catch (extrErr) {
                console.error("[V2_EXTRACTION_ERR] Failed to save extracted appointment:", extrErr.message);
              }
            }
          }
        }

        const endData = { callSid, duration, businessId: business.id };
        io.to(businessId).emit("call_ended", endData);
        io.to("superadmin").emit("call_ended", endData);
      }
    } catch (err) {
      console.error("[V2_CLOSE_FATAL] Error in final processing:", err.message);
    }
  });
}

/**
 * decodeMulaw
 * Converts an 8-bit mu-law sample to 16-bit linear PCM.
 */
function decodeMulaw(muLawByte) {
  muLawByte = ~muLawByte;
  const sign = muLawByte & 0x80;
  let exponent = (muLawByte >> 4) & 0x07;
  let mantissa = muLawByte & 0x0f;
  let sample = (mantissa << 3) + 132;
  sample <<= exponent;
  sample -= 132;

  return sign ? -sample : sample;
}

/**
 * encodeMulaw
 * Converts a 16-bit linear PCM sample to 8-bit mu-law.
 */
function encodeMulaw(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign, exponent, mantissa, muLawByte;

  sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample = sample + BIAS;

  exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--) {
    expMask >>= 1;
  }

  mantissa = (sample >> (exponent + 3)) & 0x0f;
  muLawByte = ~(sign | (exponent << 4) | mantissa);

  return muLawByte & 0xff;
}

module.exports = { 
  handleMediaStream, 
  handleV2AgentEngine,
  convToBiz
};
