const prisma = require("../../config/prisma");
const { getOpenAIVoice } = require("../../services/openai-tts");
const service = require("./call.service");
const { parseUserRequest } = require("../../services/openai");
const routingService = require("../../services/routing.service");

// ─── Per-call session store (CallSid-keyed) ───────────────────────────────────
// Each entry is automatically deleted when the call completes or the TTL fires.
const callSessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function touchSession(sessionKey, session) {
  if (session._ttlTimer) clearTimeout(session._ttlTimer);
  session._ttlTimer = setTimeout(() => {
    callSessions.delete(sessionKey);
    console.log(`Session expired and removed: ${sessionKey}`);
  }, SESSION_TTL_MS);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const isOrderBusiness = (businessType = "") =>
  normalizeBusinessType(businessType) === "order";

const getSessionKey = (req) => {
  const b = req.body || {};
  return (
    b.CallSid ||
    b.callSid ||
    [b.From, b.To].filter(Boolean).join(":") ||
    `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
};

const getOrCreateSession = (req) => {
  const sessionKey = getSessionKey(req);
  
  if (!callSessions.has(sessionKey)) {
    callSessions.set(sessionKey, {
      messages: [],
      startTime: Date.now(),
      step: ""
    });
  }

  let session = callSessions.get(sessionKey);
  touchSession(sessionKey, session);

  return { sessionKey, session };
};

const dateService = require("../../services/date.service");
const buildDateTime = dateService.buildDateTime;

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

  const timeMatch = text.match(/(\d{1,2})(am|pm)/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const period = timeMatch[2];
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

const getBusinessContext = async (session, toNumber) => {
  if (
    session.businessId &&
    session.tenantId &&
    session.businessType &&
    session.businessName
  ) {
    return session;
  }

  if (!toNumber) return session;

    const searchNumber = toNumber.replace(/[^0-9]/g, "").slice(-10);
    const business = await prisma.business.findFirst({
    where: { phoneNumber: { contains: searchNumber } },
    include: { 
      menuItems: {
        include: {
          sizes: true,
          optionGroups: {
            include: { options: true }
          },
          category: true
        }
      },
      appointments: {
        where: { appointmentTime: { gte: new Date() } },
        orderBy: { appointmentTime: "asc" }
      }
    },
  });

  if (!business) return session;

  session.businessId = business.id;
  session.tenantId = business.tenantId;
  session.businessType = business.type;
  session.businessName = business.name;
  session.menuItems = business.menuItems || [];
  session.appointments = business.appointments || [];

  return session;
};

/**
 * Builds a standard TwiML <Gather> response with a <Say> prompt.
 * Extracted to eliminate the 6+ duplicated TwiML blocks.
 */
const buildTwimlGather = (sayText, voice = "Polly.Joanna-Neural") => {
  let speechTimeout = "0.8"; // Default
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "../../config/platform.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.responseDelay) speechTimeout = config.responseDelay.toString();
    } catch (e) {}
  }

  return `
<Response>
  <Say voice="${voice}">${sayText}</Say>
  <Gather
    input="speech"
    action="/api/call/process"
    method="POST"
    timeout="4"
    speechTimeout="${speechTimeout}"
    bargeIn="true"
    enhanced="true"
    speechModel="numbers_and_commands"
  />
  <Say>I'm sorry, I didn't hear anything. Let me try again.</Say>
  <Redirect>/api/call/process</Redirect>
</Response>
`.trim();
};

/**
 * Cleans a spoken name by removing common speech prefixes.
 * Uses word-boundary-aware replacement to avoid mangling names like "Curtis".
 */
const cleanSpokenName = (text = "") => {
  return text
    .toLowerCase()
    .replace(/\bmy name is\b/g, "")
    .replace(/\bi am\b/g, "")
    .replace(/\bit'?s\b/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

// ─── INCOMING CALL ─────────────────────────────────────────────────────────────

exports.incoming = async (req, res) => {
  res.type("text/xml");
  const { sessionKey, session } = getOrCreateSession(req);

  try {
    const body = req.body || {};
    const toNumber = body.To || "";
    const fromNumber = (body.From || "").replace(/[^0-9]/g, "").slice(-10);

    // 🚀 1. ROUTING ENGINE: Check if call should go to AI or be Forwarded
    const route = await routingService.getCallRoute(toNumber);
    const business = route.business;
    const config = route.config;

    if (route.action === 'EXPIRED_DEMO') {
      console.log(`[ROUTING] Call blocked: Demo session expired for ${business?.name}`);
      return res.send(`
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you for calling. This interactive AI receptionist demo has expired or reached its maximum call limit. Please visit Naxton Technologies to activate AI receptionists for your business.</Say>
  <Hangup/>
</Response>
      `.trim());
    }

    // 💳 1.5. BILLING CHECK: Ensure tenant is within limits
    const billingService = require("../../services/billing.service");
    const billingStatus = await billingService.canMakeCall(config?.tenantId || business?.tenantId);
    if (!billingStatus.allowed && !req.body.isTest) {
      console.log(`[BILLING] Call blocked for tenant ${config?.tenantId || business?.tenantId}: ${billingStatus.message}`);
      return res.send(`
<Response>
  <Say voice="Polly.Joanna-Neural">We're sorry, this service is currently unavailable. Please try again later.</Say>
  <Hangup/>
</Response>
      `.trim());
    }

    console.log(`[ROUTING] Incoming call to ${toNumber} -> Action: ${route.action}, Business: ${business?.name || 'Unknown'}`);

    // 📊 2. TRACK ANALYTICS (Async)
    if (config) {
      (async () => {
        try {
          const today = new Date();
          today.setHours(0,0,0,0);
          await prisma.callAnalytics.upsert({
            where: { tenantId_date: { tenantId: config.tenantId, date: today } },
            create: { tenantId: config.tenantId, incomingCalls: 1 },
            update: { incomingCalls: { increment: 1 } }
          });
        } catch (e) { console.error("[ANALYTICS] Failed to update incoming:", e.message); }
      })();
    }

    // 📞 3. ACTION: FORWARDING (Business Hours / AI Toggle)
    if (route.action === 'FORWARD' && route.destination) {
      console.log(`[ROUTING] Forwarding call for ${business?.name} to ${route.destination}`);
      
      // Update Analytics for Transferred
      if (config) {
        prisma.callAnalytics.update({
          where: { tenantId_date: { tenantId: config.tenantId, date: new Date(new Date().setHours(0,0,0,0)) } },
          data: { transferredCalls: { increment: 1 } }
        }).catch(() => {});
      }

      return res.send(`
<Response>
  <Say voice="Polly.Joanna-Neural">Please wait while we connect your call to the ${business?.name || 'business'}.</Say>
  <Dial>${route.destination}</Dial>
</Response>
      `.trim());
    }

    // 🤖 4. ACTION: AI (Handle Streaming)
    if (body.CallSid) {
      const { startRecording } = require("../../services/twilio");
      // Only record if explicitly enabled in config (default true)
      if (config?.recordingEnabled !== false) {
        startRecording(req.body.CallSid).catch(() => {});
      }
    }

    if (!business) {
      console.warn(`[ROUTING] No business context for ${toNumber}. Using generic greeting.`);
      return res.send(`
<Response>
  <Gather input="speech" action="/api/call/process" method="POST" timeout="8" bargeIn="true">
    <Say voice="Polly.Joanna-Neural">Hello! Thanks for calling Naxton. How can I help you today?</Say>
  </Gather>
</Response>`);
    }

    // 💾 Preserve config in session for later use (e.g. transfer number)
    session.phoneNumberId = config?.id;
    session.transferNumber = config?.transferNumber;

    // 🚀 START REALTIME STREAM
    const host = req.headers.host || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
    const protocol = (isLocal && !host.includes("ngrok")) ? "ws" : "wss";
    const callerPhone = req.body.From || "Unknown";
    const streamUrl = `${protocol}://${host}/v2/stream/${business.id}?caller=${encodeURIComponent(callerPhone)}`;
    
    console.log(`[CALL_INCOMING] business: ${business.name}, stream: ${streamUrl}`);

    // 🚀 Notify Live Demo Dashboard immediately via Socket.io
    const io = req.app.get("io");
    if (io && business.id) {
      const startData = {
        from: callerPhone,
        businessId: business.id,
        businessName: business.name,
        timestamp: new Date().toISOString()
      };
      io.to(business.id).emit("call_started", startData);
      io.to("superadmin").emit("call_started", startData);
    }
    
    res.send(`
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track" />
  </Connect>
</Response>
    `.trim());

    // ─── BACKGROUND CONTEXT PREP ───
    (async () => {
      try {
        session.businessId = business.id;
        session.tenantId = business.tenantId;
        session.businessType = business.type;
        session.businessName = business.name;
      } catch (err) {
        console.error("[BACKGROUND] Error fetching full context:", err.message);
      }
    })();

  } catch (error) {
    console.error("[CALL FATAL ERROR] Incoming handler failed:", error);
    return res.send(`<Response><Say voice="Polly.Joanna-Neural">Sorry, we're having a technical issue. Please try again later.</Say><Hangup/></Response>`);
  }
};

// ─── PROCESS (conversation loop) ──────────────────────────────────────────────

exports.process = async (req, res) => {
  res.type("text/xml");
  const { sessionKey, session } = getOrCreateSession(req);
  const userSpeech = (req.body.SpeechResult || "").toLowerCase().trim();
  console.log(`[CALL DEBUG] Processing speech: "${userSpeech}" for session: ${sessionKey}`);

  // Initialize messages if empty
  if (!session.messages) {
    session.messages = [];
  }

  // Handle silence or empty transcript
  if (!userSpeech) {
    return res.send(
      buildTwimlGather("Sorry, I didn't quite catch that. Could you say it again?")
    );
  }

  console.log(`[CALL] User (${sessionKey}): "${userSpeech}"`);

  // Add user message
  session.messages.push({ role: "user", content: userSpeech });

  // 🤖 BOT DETECTION LOGIC
  const botPhrases = ["automated system", "data transfer", "handshake protocol", "api request", "connecting to agent"];
  const isBotPhrasing = botPhrases.some(phrase => userSpeech.includes(phrase));
  
  // Calculate response time (rough estimate)
  const lastMsgTime = session.lastMsgTime || Date.now();
  const responseTime = Date.now() - lastMsgTime;
  session.lastMsgTime = Date.now();

  // If response is under 500ms and has more than 5 words, it's likely a bot or a very fast script
  const isRapidResponse = responseTime < 500 && userSpeech.split(" ").length > 5;
  
  if (isBotPhrasing || isRapidResponse) {
    session.isBotSuspected = true;
    console.log(`[BOT DETECTED] session: ${sessionKey}, Reason: ${isBotPhrasing ? "phrasing" : "rapid response"}`);
  }

  try {
    // Ensure we always have business context (fallback lookup by To number)
    await getBusinessContext(session, req.body.To);

    if (!session.businessId || !session.tenantId) {
      return res.send(`
<Response>
  <Say>Sorry, I couldn't find the business for this call. Please try again later.</Say>
  <Hangup/>
</Response>
      `.trim());
    }

    const io = req.app.get("io");

    // Call OpenAI with full history
    let aiResponse = await require("../../services/openai").getAIResponse(session.messages, session);
    
    // Add AI response to history
    session.messages.push({ role: "assistant", content: aiResponse });

    console.log(`[CALL] AI → "${aiResponse}"`);

    // Check if conversation completed
    if (aiResponse.includes("ORDER_COMPLETE") || aiResponse.includes("APPT_COMPLETE")) {
      const isOrder = aiResponse.includes("ORDER_COMPLETE");
      
      // Clean up the output string
      aiResponse = aiResponse.replace("ORDER_COMPLETE", "").replace("APPT_COMPLETE", "").trim();

      // Extract details in the background using parseUserRequest on the whole transcript
      const transcript = session.messages.map(m => `${m.role}: ${m.content}`).join("\\n");
      const extraction = await parseUserRequest(transcript, session);

      if (isOrder) {
        let orderTotal = 0;
        const orderItemsToCreate = [];

        // Fetch all menu items for this business to match prices
        const menuItems = await prisma.menuItem.findMany({
          where: { businessId: session.businessId },
          include: { 
            sizes: true, 
            optionGroups: {
              include: { options: true }
            }
          }
        });

        if (Array.isArray(extraction.orderItems)) {
          for (const item of extraction.orderItems) {
            const itemNameLower = (item.name || "").toLowerCase();
            
            // Find matching menu item with smarter fuzzy matching
            const matchedItem = menuItems.find(m => {
              const mNameLower = m.name.toLowerCase();
              return mNameLower.includes(itemNameLower) || 
                     itemNameLower.includes(mNameLower) ||
                     mNameLower.split(" ").some(word => word.length > 3 && itemNameLower.includes(word));
            });

            if (matchedItem) {
              let itemPrice = matchedItem.price || 5.00; // Default price if menu price is null
              let details = "";

              // Check for size price
              if (item.size) {
                const matchedSize = matchedItem.sizes.find(s => s.name.toLowerCase().includes(item.size.toLowerCase()));
                if (matchedSize) {
                  itemPrice += matchedSize.price;
                  details += `Size: ${matchedSize.name} `;
                }
              }

              // Check for option groups prices (addons, toppings, etc)
              if (Array.isArray(item.addons)) {
                for (const addonName of item.addons) {
                  // Search across all option groups
                  for (const group of matchedItem.optionGroups) {
                    const matchedOption = group.options.find(o => o.name.toLowerCase().includes(addonName.toLowerCase()));
                    if (matchedOption) {
                      itemPrice += matchedOption.price;
                      details += `+ ${matchedOption.name} `;
                      break; // Found in this group
                    }
                  }
                }
              }

              const qty = item.quantity || 1;
              orderTotal += (itemPrice * qty);

              orderItemsToCreate.push({
                menuItemId: matchedItem.id,
                quantity: qty,
                selectedAddons: details || (item.size ? `Size: ${item.size}` : item.name),
                tenantId: session.tenantId,
              });
            } else if (itemNameLower.trim()) {
              // Safety fallback: if no match, still add the item with a generic price so total isn't zero
              const fallbackPrice = 10.00;
              orderTotal += fallbackPrice;
              // We'll use the first menu item as a placeholder ID if needed
              if (menuItems.length > 0) {
                orderItemsToCreate.push({
                  menuItemId: menuItems[0].id,
                  quantity: item.quantity || 1,
                  selectedAddons: `(Unmatched) ${item.name}`,
                  tenantId: session.tenantId,
                });
              }
            }
          }
        }

        const createdOrder = await prisma.order.create({
          data: {
            customerName: extraction.customerName || "Voice Customer",
            customerPhone: extraction.customerPhone || req.body.From || "Unknown",
            total: orderTotal,
            tenantId: session.tenantId,
            businessId: session.businessId,
            callId: session.callId,
            items: {
              create: orderItemsToCreate
            }
          },
        });

        if (io && session.businessId) {
          io.to(session.businessId).emit("new_order", {
            id: createdOrder.id,
            name: extraction.customerName || "Voice Customer",
            total: orderTotal,
            summary: orderItemsToCreate.length > 0 ? `${orderItemsToCreate.length} items` : "Voice Order",
          });
        }
      } else {
        const appointmentDate = buildDateTime(extraction.date || "", "");
        await prisma.appointment.create({
          data: {
            customerName: extraction.customerName || "Voice Customer",
            customerPhone: extraction.customerPhone || req.body.From || "Unknown",
            serviceName: extraction.serviceName || "General service",
            appointmentTime: appointmentDate,
            tenantId: session.tenantId,
            businessId: session.businessId,
            status: "CONFIRMED",
            source: "AI"
          },
        });

        if (io && session.businessId) {
          io.to(session.businessId).emit("new_appointment", {
            name: extraction.customerName || "Voice Customer",
            service: extraction.serviceName || "General service",
            appointmentTime: appointmentDate,
          });
        }
      }

      // Update Call record with name and summary
      if (session.callId) {
        let callSummary = isOrder ? "Order placed: " : "Appointment booked: ";
        if (isOrder) {
          callSummary += orderItemsToCreate.map(i => `${i.quantity}x ${i.selectedAddons}`).join(", ");
        } else {
          callSummary += extraction.serviceName || "General service";
        }

        const callDuration = session.startTime ? Math.floor((Date.now() - session.startTime) / 1000) : 0;

        await prisma.call.update({
          where: { id: session.callId },
          data: {
            customerName: extraction.customerName || "Voice Customer",
            summary: callSummary,
            duration: callDuration
          }
        });
      }

      callSessions.delete(sessionKey);

      // Clean final goodbye TwiML
      return res.send(`
<Response>
  <Say voice="Polly.Joanna-Neural">${aiResponse}</Say>
  <Hangup/>
</Response>
      `.trim());
    }

    // Normal conversation turn
    return res.send(buildTwimlGather(aiResponse));
  } catch (error) {
    console.error(`[CALL] Process error (session=${sessionKey}):`, error.message);

    return res.send(`
<Response>
  <Say>Something went wrong on our end. Please hold on just a moment.</Say>
  <Gather
    input="speech"
    action="/api/call/process"
    method="POST"
    timeout="8"
    speechTimeout="2.0"
    bargeIn="true"
  />
  <Redirect>/api/call/process</Redirect>
</Response>
    `.trim());
  }
};



// ─── STREAM VOICE (OpenAI TTS) ────────────────────────────────────────────────
exports.streamVoice = async (req, res) => {
  try {
    const { text } = req.query;
    if (!text) return res.status(400).send("Text required");

    console.log(`[VOICE DEBUG] Requesting OpenAI TTS for: "${text.substring(0, 30)}..."`);
    
    // OpenAI TTS is generally very fast, but let's keep a timeout for stability
    const audioPromise = getOpenAIVoice(text);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("OpenAI TTS Timeout")), 2000)
    );

    const audioBuffer = await Promise.race([audioPromise, timeoutPromise]).catch(err => {
      console.warn(`[VOICE FALLBACK] ${err.message}`);
      return null;
    });
    
    if (!audioBuffer || audioBuffer.length < 100) {
      console.warn("[VOICE WARNING] Sending Polly Fallback TwiML");
      res.type("text/xml");
      return res.send(`<Response><Say voice="Polly.Joanna-Neural">${text}</Say></Response>`);
    }

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "X-Audio-Source": "OpenAI-TTS"
    });
    res.send(audioBuffer);
  } catch (error) {
    console.error("[VOICE ERROR] Stream handler failed:", error);
    res.type("text/xml");
    return res.send(`<Response><Say voice="Polly.Joanna-Neural">${req.query.text}</Say></Response>`);
  }
};

// ─── TEST AI ENDPOINT ─────────────────────────────────────────────────────────

exports.testAI = async (req, res) => {
  try {
    const { text, businessId } = req.body;

    if (!text || !businessId) {
      return res.status(400).json({ error: "text and businessId are required" });
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId, tenantId: req.tenantId },
    });

    if (!business) {
      return res.status(403).json({ error: "Invalid business" });
    }

    const aiResult = await parseUserRequest(text, { businessType: business.type });

    // Keyword fallback when GPT returns "unknown"
    if (aiResult.intent === "unknown") {
      const lower = text.toLowerCase();
      if (lower.includes("haircut") || lower.includes("appointment") || lower.includes("booking")) {
        aiResult.intent = "appointment";
        aiResult.serviceName = aiResult.serviceName || "haircut";
      } else if (lower.includes("pizza") || lower.includes("burger") || lower.includes("order")) {
        aiResult.intent = "order";
      }
    }

    console.log("[TEST AI] Result:", aiResult);

    if (aiResult.intent === "appointment") {
      await prisma.appointment.create({
        data: {
          customerName: "AI Caller",
          serviceName: aiResult.serviceName || "General Service",
          date: parseDate(aiResult.date),
          businessId,
          tenantId: req.tenantId,
          status: "CONFIRMED",
          source: "AI"
        },
      });
    }

    if (aiResult.intent === "order") {
      await prisma.order.create({
        data: {
          customerName: "AI Caller",
          total: 0,
          businessId,
          tenantId: req.tenantId,
        },
      });
    }

    const message =
      aiResult.intent === "appointment"
        ? `Your appointment for ${aiResult.serviceName || "service"} has been booked.`
        : aiResult.intent === "order"
        ? "Your order has been placed."
        : "Sorry, I didn't understand that request.";

    return res.json({ success: true, aiResult, message });
  } catch (error) {
    console.error("[TEST AI] Error:", error);
    return res.status(500).json({ error: "AI processing failed" });
  }
};

// ─── CALL HISTORY ─────────────────────────────────────────────────────────────

exports.getCallHistory = async (req, res) => {
  try {
    const { businessId } = req.query;
    const isSuperAdmin = req.user.role === "SUPERADMIN";

    const calls = await prisma.call.findMany({
      where: {
        ...(isSuperAdmin ? {} : { tenantId: req.tenantId }),
        ...(businessId ? { businessId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { business: true },
    });

    // 🔗 Link orders to show status
    const callIds = calls.map(c => c.id);
    const orders = await prisma.order.findMany({
      where: { callId: { in: callIds } },
      select: { callId: true, status: true, customerPhone: true }
    });

    const data = calls.map(c => {
      const order = orders.find(o => o.callId === c.id);
      return {
        ...c,
        orderStatus: order ? order.status : null,
        // Use order phone if available, fallback to call's fromNumber
        customerPhone: (order && order.customerPhone && order.customerPhone !== 'Unknown') ? order.customerPhone : c.fromNumber
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[CALL] History error:", err);
    return res.status(500).json({ success: false, error: "Failed to load call history" });
  }
};

// ─── CALL DETAILS ─────────────────────────────────────────────────────────────

exports.getCallDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const isSuperAdmin = req.user.role === "SUPERADMIN";
    const call = await prisma.call.findFirst({
      where: { 
        id, 
        ...(isSuperAdmin ? {} : { tenantId: req.tenantId })
      },
      include: { business: true },
    });

    if (!call) {
      return res.status(404).json({ success: false, error: "Call not found" });
    }

    return res.json({ success: true, data: call });
  } catch (err) {
    console.error("[CALL] Details error:", err);
    return res.status(500).json({ success: false, error: "Failed to load call details" });
  }
};



exports.status = (req, res) => res.sendStatus(200);
exports.recordingCallback = (req, res) => res.sendStatus(200);
exports.proxyRecording = (req, res) => res.sendStatus(200);

exports.streamVoice = (req, res) => res.sendStatus(200);

exports.testVoice = (req, res) => res.sendStatus(200);

/* ===============================
   PROVISIONING: SEARCH NUMBERS
   =============================== */
exports.searchNumbers = async (req, res) => {
  try {
    const { areaCode, countryCode } = req.query;
    const twilioService = require("../../services/twilio");
    const numbers = await twilioService.searchAvailableNumbers(areaCode || "212", countryCode || "US");
    return res.json({ success: true, data: numbers });
  } catch (error) {
    console.error("[Call] searchNumbers error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ===============================
   PROVISIONING: PURCHASE NUMBER
   =============================== */
exports.purchaseNumber = async (req, res) => {
  try {
    const { phoneNumber, businessId } = req.body;
    if (!phoneNumber || !businessId) {
      return res.status(400).json({ success: false, error: "Phone number and Business ID are required" });
    }

    const twilioService = require("../../services/twilio");
    const result = await twilioService.purchaseAndConfigureNumber(phoneNumber, businessId);
    
    return res.json({ success: true, data: result, message: "Number successfully provisioned and linked to business." });
  } catch (error) {
    console.error("[Call] purchaseNumber error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.transfer = async (req, res) => {
  try {
    const { id } = req.params; // callSid or internal id
    const { to } = req.body;
    
    if (!id || !to) {
      return res.status(400).json({ error: "Call ID and destination are required" });
    }

    const twilioService = require("../../services/twilio");
    await twilioService.transferCall(id, to);
    
    return res.json({ success: true, message: "Call transfer initiated" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
