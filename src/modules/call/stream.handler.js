const WebSocket = require("ws");
const prisma = require("../../config/prisma");
const { createDeepgram } = require("../../services/deepgram");
const { getAIResponse } = require("../../services/openai");
const { getElevenLabsAudio } = require("../../services/elevenlabs");
const IntegrationManager = require("../integrations/core/IntegrationManager");

const normalizeBusinessType = (type = "") => {
  const t = type.toLowerCase();
  if (["restaurant", "bakery", "cafe", "pizzeria", "food", "shop", "store"].some(k => t.includes(k))) return "order";
  if (["salon", "spa", "clinic", "doctor", "dentist", "appointment", "service"].some(k => t.includes(k))) return "appointment";
  return "order"; // fallback
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
                  status: "PENDING"
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
  let fromNumber = "unknown"; // 📞 CALLER IDENTITY: Initialized early to prevent ReferenceError
  let audioBuffer = []; // 📦 BUFFER: Store audio events that arrive before streamSid

  // 1. Get Business Context
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { tenant: true, menuCategories: { include: { items: true } }, menuItems: true }
  });

  if (!business) {
    console.error(`[V2] Business ${businessId} not found`);
    return ws.close();
  }

  // 🍕 PREPARE LIVE DATA (Menu for Restaurants, Services for Appointments)
  const isApptBiz = normalizeBusinessType(business.type) === "appointment";
  const isOrderBiz = normalizeBusinessType(business.type) === "order";
  
  const contextText = business.menuCategories.map(cat => {
    const prods = cat.items.map(p => `- ${p.name}: $${p.price}`).join("\n");
    return `### ${cat.name}\n${prods}`;
  }).join("\n\n");

  const variableData = {
    businessId: business.id,
    business_name: business.name || "the business",
    business_type: business.type || "service",
    address: business.address || "our local branch",
    current_date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    current_time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    caller_phone: fromNumber || "unknown",
    caller_appointments: "None",
    delivery_available: business.deliveryAvailable,
    delivery_radius: business.deliveryRadius || 5,
    pickup_available: business.takeawayAvailable ? "Available" : "Not available",
    takeaway_available: business.takeawayAvailable ? "Available" : "Not available",
    delivery_available: business.deliveryAvailable ? "Available" : "Not available",
    dinein_available: business.dineInAvailable ? "Available" : "Not available",
    reservations_enabled: business.reservationsEnabled ? "Available" : "Not available",
    agent_name: business.aiName || "Sarah",
    business_hours: business.openTime + " to " + business.closeTime,
    business_days: business.timings || "Monday to Friday",
    business_website: business.website || "N/A",
    business_email: business.email || "N/A",
    business_phone: business.phoneNumber || "N/A",
    timezone: business.timezone || "UTC",
    walkin_policy: business.walkinPolicy || "Walk-ins are welcome but appointments are preferred.",
    late_policy: business.latePolicy || "Please arrive on time. We hold appointments for 15 minutes.",
    cancellation_policy: business.cancellationPolicy || "Please notify us 24 hours in advance for cancellations.",
    business_notes: business.notes || "None",
    industry_mode: business.type === "restaurant" ? "RESTAURANT" : "SALON",
    business_address: business.address || "N/A",
    orders: "No recent orders",
    business_settings: "Standard enterprise settings",
    delivery_settings: `Radius: ${business.deliveryRadius || 5}km`,
    store_status: "Open",
    item_availability: "All items in stock",
    staff_members: "Professional Staff",
    appointment_rules: "Book at least 1 hour in advance",
    booking_policies: "Standard booking",
    availability: "Slots available today",
    calendar: "Current calendar active",
    appointments: "No conflicting bookings",
    operating_hours: business.openTime + " to " + business.closeTime,
    holiday_schedule: "None",
    special_events: "None"
  };

  const agentIntro = `Hello, I am ${variableData.agent_name} from ${variableData.business_name}.`;

  if (isApptBiz) {
    variableData.services = contextText;
    variableData.menu = "N/A (This is an appointment business)";
    variableData.instructions = `
# IDENTITY
You are ${variableData.ai_name}, an elite AI virtual receptionist and appointment coordinator for ${variableData.business_name}.
You are highly professional, warm, intelligent, calm under pressure, and exceptionally organized.

# BUSINESS INFORMATION
Business Name: ${variableData.business_name}
Business Type: ${variableData.business_type}
Address: ${variableData.address}
Phone: ${variableData.business_phone}
Hours: ${variableData.business_hours}
Days: ${variableData.business_days}
Services: ${variableData.services}
Policies: Walk-in: ${variableData.walkin_policy}, Late: ${variableData.late_policy}, Cancel: ${variableData.cancellation_policy}

# VOICE & STYLE
- Natural, human-like, conversational.
- Use brief acknowledgements like "Absolutely", "Got it", "One moment".
- NEVER interrupt. Speak clearly and slowly.

# PRIMARY RESPONSIBILITIES
- Booking, rescheduling, and cancelling appointments.
- For NEW bookings, you MUST ask: "Is the number you're calling from (${variableData.caller_phone}) the best way to reach you?".
- Collect: Service, Date, Time, Customer Name, and Phone.
- Confirm all details before finalizing.

# DATA ACCESS
LIVE SERVICES: ${variableData.services}
LIVE APPOINTMENTS: ${variableData.caller_appointments}

# MULTILINGUAL
Respond in the language the customer uses (Urdu, Spanish, Arabic, etc.).

# CALL CLOSING
"Perfect. Your appointment has been successfully booked. We look forward to seeing you. Thank you for calling ${variableData.business_name}. Have a wonderful day."
    `.trim();
  } else {
    variableData.menu = contextText;
    variableData.services = "N/A (This is a restaurant business)";
    variableData.instructions = `
# IDENTITY
You are ${variableData.ai_name}, an elite AI virtual receptionist and ordering assistant for ${variableData.business_name}.
You are warm, intelligent, professional, and exceptionally helpful.

# BUSINESS INFORMATION
Business Name: ${variableData.business_name}
Address: ${variableData.address}
Hours: ${variableData.business_hours}
Days: ${variableData.business_days}
Delivery Radius: ${variableData.delivery_radius}km
Pickup: ${variableData.takeaway_available ? 'Available' : 'Not available'}
Delivery: ${variableData.delivery_available ? 'Available' : 'Not available'}
Dine-In: ${variableData.dine_in_available ? 'Available' : 'Not available'}

# VOICE & STYLE
- Natural, human-like, conversational.
- Pause between menu items. NEVER interrupt.

# PRIMARY RESPONSIBILITIES
- Taking food orders accurately.
- Ask for Name and confirm if ${variableData.caller_phone} is the best contact number.
- For Delivery: MUST collect address first and check if within ${variableData.delivery_radius}km.
- For Pickup/Dine-in: Collect Name and confirm Number.
- Repeat FULL order clearly before finalizing.

# LIVE MENU DATA
${variableData.menu}

# MULTILINGUAL
Respond in the language the customer uses (Urdu, Spanish, Arabic, etc.).

# CALL CLOSING
"Perfect. Your order has been confirmed. Thank you for calling ${variableData.business_name}. Have a wonderful day."
    `.trim();
  }

  // 2. Connect to ElevenLabs Conversational AI
  const defaultOrderingAgent = "agent_9401kqqj87jzf9mrmfwsprqh3frh";
  const defaultAppointmentAgent = "agent_5501kqtn1qjxe5nvyc9x6zyn8w8g";
  
  const isCustomAgent = !!business.aiVoiceId;
  const agentId = isCustomAgent ? business.aiVoiceId : (isApptBiz ? defaultAppointmentAgent : defaultOrderingAgent);
  const elUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;
  
  const headers = { 
    "Origin": (process.env.BASE_URL || "https://nexton.ai").replace("http://", "https://")
  };
  
  // Always inject the platform API key if available, to support private agents
  if (process.env.ELEVENLABS_API_KEY) {
    headers["xi-api-key"] = process.env.ELEVENLABS_API_KEY;
  }
  
  const elWs = new WebSocket(elUrl, { headers });

  console.log(`[V2] Opening ElevenLabs WebSocket for Agent: ${agentId}`);

  elWs.on("open", () => {
    console.log(`[V2] SUCCESS: Connected to ElevenLabs Agent: ${agentId}`);
    
    // 🚀 INITIATION HANDSHAKE: Send IMMEDIATELY on open
    // We use dynamic_variables so the user retains FULL CONTROL of their prompt in the ElevenLabs Dashboard.
    // They can use {{menu}} and {{business_name}} in their prompt.
    elWs.send(JSON.stringify({
      type: "conversation_initiation_client_data",
      dynamic_variables: variableData,
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: `
              You are Sam, a helpful assistant for ${variableData.business_name}.
              Today is ${variableData.current_date}.
              
              BUSINESS DETAILS:
              Type: ${variableData.business_type}
              Location: ${variableData.address}
              
              MENU/SERVICES:
              ${isApptBiz ? variableData.services : variableData.menu}
              
              INSTRUCTIONS:
              ${variableData.instructions}
              
              GUIDELINES:
              - Be extremely concise and natural.
              - Match the customer's language.
              - For Appointments: Verify if {{caller_phone}} is the best contact number. Only ask for a new one if they say no.
              - Always ask for the customer's NAME.
              - If the order/appointment is 100% finished and details confirmed, say goodbye.
            `.trim()
          }
        },
        turn_detection: {
          type: "server_vad",
          server_vad: {
            threshold: 0.4, // ⚡ MORE SENSITIVE: Trigger faster
            prefix_padding_ms: 200,
            silence_duration_ms: 400 // ⚡ ULTRA-FAST: Respond after 400ms of silence
          }
        }
      }
    }));

    canStream = true;
    console.log(`[V2] Handshake settled. Listening instantly.`);
  });

  elWs.on("error", (err) => {
    console.error(`[V2] ElevenLabs WebSocket Error:`, err.message);
  });

  // ─── FROM ELEVENLABS ───
  elWs.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "conversation_initiation_metadata") {
        const convId = data.conversation_initiation_metadata_event?.conversation_id;
        if (convId && businessId) {
          convToBiz.set(convId, businessId);
          console.log(`[V2] Mapped Conversation: ${convId} -> Business: ${businessId}`);
          
          // Cleanup after 1 hour
          setTimeout(() => convToBiz.delete(convId), 60 * 60 * 1000);
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
          return;
        }

        if (ws.readyState === WebSocket.OPEN && payload) {
          const pcmBuffer = Buffer.from(payload, 'base64');
          
          // ⚡ DIGITAL TRANSFORMER: 16-bit PCM (16kHz) -> 8-bit mu-law (8kHz)
          // ElevenLabs V2 natively streams 16kHz. We take every other sample.
          const stride = 4; // 2 bytes per sample * 2 = 4 bytes
          const muLawBuffer = Buffer.alloc(Math.floor(pcmBuffer.length / stride));
          
          for (let i = 0; i < muLawBuffer.length; i++) {
            const pcmSample = pcmBuffer.readInt16LE(i * stride);
            muLawBuffer[i] = encodeMulaw(pcmSample);
          }

          const CHUNK_SIZE = 640; // ⚡ 80ms chunks (Lower overhead than 20ms)
          for (let i = 0; i < muLawBuffer.length; i += CHUNK_SIZE) {
            const chunk = muLawBuffer.slice(i, i + CHUNK_SIZE);
            if (ws.readyState !== WebSocket.OPEN) break;
            ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: chunk.toString('base64') } }));
          }

          // ⏱️ PRECISION TIMING: Calculate exactly how long this audio takes to play in Twilio
          const chunkDurationMs = (muLawBuffer.length / 8000) * 1000;
          
          const now = Date.now();
          if (!aiEndTime || aiEndTime < now) aiEndTime = now;
          aiEndTime += chunkDurationMs;

          const timeRemaining = aiEndTime - now;
          
          if (aiSpeakTimer) clearTimeout(aiSpeakTimer);
          aiSpeakTimer = setTimeout(() => { 
            isAiSpeaking = false; 
          }, timeRemaining + 400);
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
         const event = data.user_transcript_event || data.transcript_event || data;
         const text = event.user_transcript || event.text || event.transcript;
         if (text && text.trim().length > 1 && !text.includes("???")) {
           transcript += `User: ${text}\n`;
           messages.push({ role: "user", content: text });
           io.to(businessId).emit("call_transcribed", { callSid, text, role: "user" });
         }
      }

      if (data.type === "agent_response") {
         const event = data.agent_response_event || data.transcript_event || data;
         const text = event.agent_response || event.text || event.transcript;
         if (text) {
           transcript += `Assistant: ${text}\n`;
           messages.push({ role: "assistant", content: text });
           io.to(businessId).emit("call_transcribed", { callSid, text, role: "assistant" });
         }
      }
    } catch (err) {
      console.error("[V2] Error parsing ElevenLabs message:", err.message);
    }
  });
  elWs.on("close", (code, reason) => {
    console.log(`[V2] ElevenLabs WebSocket Closed | Code: ${code} | Reason: ${reason || "No reason provided"}`);
    ws.close();
  });

  // ─── FROM TWILIO ───
  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    switch (data.event) {
      case "start":
        streamSid = data.start.streamSid;
        callSid = data.start.callSid;
        fromNumber = (data.start.from || "").replace(/[^0-9]/g, "").slice(-10);
        variableData.caller_phone = fromNumber;

        // 🛡️ SINGLE VOICE LOCKDOWN: Reject duplicate streams for the same CallSid
        if (activeStreams.has(callSid)) {
          console.warn(`[V2] Duplicate stream detected for ${callSid}. Rejecting second voice.`);
          return ws.close(); 
        }
        activeStreams.set(callSid, ws);
        
        // Fetch Caller Appointments for RECOGNITION
        if (fromNumber && isApptBiz) {
          const cAppts = await prisma.appointment.findMany({
            where: { 
              businessId: business.id, 
              customerPhone: { contains: fromNumber },
              appointmentTime: { gte: new Date() },
              status: { not: "CANCELLED" }
            }
          });
          if (cAppts.length > 0) {
             variableData.caller_appointments = cAppts.map(a => `${a.serviceName} at ${new Date(a.appointmentTime).toLocaleString()}`).join(", ");
             // Force refresh of dynamic variables if elWs is already open
             if (elWs.readyState === WebSocket.OPEN) {
               elWs.send(JSON.stringify({
                 type: "client_data_update",
                 dynamic_variables: variableData
               }));
             }
          }
        }
        
        // 🚀 ALWAYS sync the caller phone to ElevenLabs once known
        if (elWs.readyState === WebSocket.OPEN) {
          elWs.send(JSON.stringify({
            type: "client_data_update",
            dynamic_variables: variableData
          }));
        }

        console.log(`[V2] Call started. From: ${fromNumber}. StreamSid: ${streamSid}. CallSid: ${callSid}`);

        // 🚀 FLUSH BUFFER: Play any audio that arrived early (like the greeting)
        if (audioBuffer.length > 0) {
          console.log(`[V2] Flushing ${audioBuffer.length} buffered audio events to Twilio`);
          audioBuffer.forEach(payload => {
            const pcmBuffer = Buffer.from(payload, 'base64');
            const stride = 4;
            const muLawBuffer = Buffer.alloc(Math.floor(pcmBuffer.length / stride));
            for (let i = 0; i < muLawBuffer.length; i++) {
              const pcmSample = pcmBuffer.readInt16LE(i * stride);
              muLawBuffer[i] = encodeMulaw(pcmSample);
            }
            const CHUNK_SIZE = 640;
            for (let i = 0; i < muLawBuffer.length; i += CHUNK_SIZE) {
              const chunk = muLawBuffer.slice(i, i + CHUNK_SIZE);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: chunk.toString('base64') } }));
              }
            }
          });
          audioBuffer = [];
        }
        
        // Create/Update Call Record
        callRecord = await prisma.call.findFirst({ where: { twilioSid: callSid } });
        if (!callRecord) {
           callRecord = await prisma.call.create({
             data: {
               twilioSid: callSid,
               businessId: business.id,
               tenantId: business.tenantId,
               fromNumber: fromNumber || "Unknown",
               toNumber: business.phoneNumber || "Unknown"
             }
           });
        }
        break;

      case "media":
        // 🎙️ BARGE-IN ENABLED: We stream audio to ElevenLabs continuously so the AI can hear interruptions.
        // Twilio's 'inbound_track' prevents echo, allowing native ElevenLabs AEC to handle speakerphone.
        if (elWs.readyState === WebSocket.OPEN && canStream) {
          const muLawBuffer = Buffer.from(data.media.payload, 'base64');
          
          // ⚡ USER VOICE TRANSLATOR: 8-bit mu-law (8kHz) -> 16-bit PCM (16kHz)
          // 1. Decode to 16-bit PCM
          // 2. Upsample (Duplicate each sample: 8kHz -> 16kHz)
          const pcmBuffer = Buffer.alloc(muLawBuffer.length * 4); 
          
          for (let i = 0; i < muLawBuffer.length; i++) {
            let pcmSample = decodeMulaw(muLawBuffer[i]);
            
            // Sample 1
            pcmBuffer.writeInt16LE(pcmSample, i * 4);
            // Sample 2 (Duplicate for upsampling)
            pcmBuffer.writeInt16LE(pcmSample, (i * 4) + 2);
          }

          elWs.send(JSON.stringify({
            type: "user_audio_chunk",
            user_audio_chunk: pcmBuffer.toString('base64')
          }));
        }
        break;

      case "stop":
        console.log(`[V2] Call stopped.`);
        elWs.close();
        break;
    }
  });

  ws.on("close", async () => {
    console.log("[V2] Twilio connection closed");
    if (callSid) activeStreams.delete(callSid); // 🛡️ UNLOCK for next call
    if (elWs.readyState === WebSocket.OPEN) elWs.close();

    // 🏁 FINAL PROCESSING (Orders & Summaries)
    if (callRecord && messages.length > 0) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      const fullTranscript = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

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
      });

      // 🍕 ORDER EXTRACTION (For Restaurants)
      if (isOrderBiz) {
        const { parseUserRequest } = require("../../services/openai");
        const extracted = await parseUserRequest(fullTranscript, {
          businessType: business.type,
          menuItems: business.menuItems.map(i => i.name)
        });

        if (extracted && extracted.orderItems.length > 0 && extracted.status !== 'cancelled') {
          let total = 0;
          const itemsToCreate = [];
          for (const item of extracted.orderItems) {
            const match = business.menuItems.find(i => i.name.toLowerCase().includes(item.name.toLowerCase()));
            if (match) {
              total += (match.price * (item.quantity || 1));
              itemsToCreate.push({
                menuItemId: match.id,
                quantity: item.quantity || 1,
                tenantId: business.tenantId,
                unitPrice: match.price
              });
            }
          }

          if (itemsToCreate.length > 0) {
            const order = await prisma.order.create({
              data: {
                customerName: (extracted.customerName && extracted.customerName !== "Unknown") ? extracted.customerName : (analysis.name !== "Unknown" ? analysis.name : "Voice Customer"),
                total: total,
                businessId: business.id,
                tenantId: business.tenantId,
                callId: callRecord.id,
                items: { create: itemsToCreate }
              },
              include: { items: { include: { menuItem: true } } }
            });
            io.to(businessId).emit("new_order", order);

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

      // 📅 APPOINTMENT EXTRACTION (For Salons / Appointments)
      if (isApptBiz) {
        const { parseUserRequest } = require("../../services/openai");
        const extracted = await parseUserRequest(fullTranscript, {
          businessType: "appointment"
        });

        if (extracted && (extracted.serviceName || extracted.intent === 'appointment') && extracted.status !== 'cancelled') {
          let apptDate = new Date(extracted.date);
          if (isNaN(apptDate.getTime())) apptDate = new Date(); // Fallback to now if date is invalid

          const appointment = await prisma.appointment.create({
            data: {
              customerName: extracted.customerName || analysis.name || "Voice Customer",
              customerPhone: callRecord.fromNumber || extracted.customerPhone || "Unknown",
              serviceName: extracted.serviceName || "General Service",
              appointmentTime: apptDate,
              businessId: business.id,
              tenantId: business.tenantId,
              callId: callRecord.id,
              status: "PENDING"
            }
          });
          io.to(businessId).emit("new_appointment", appointment);
        }
      }

      io.to(businessId).emit("call_ended", { callSid, duration });
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
