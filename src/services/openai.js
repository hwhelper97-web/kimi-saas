/**
 * getAIResponse — generates a human-like voice reply via GPT-4o-mini.
 * parseUserRequest — extracts structured intent/data from a spoken transcript.
 */

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

function normalizeBusinessType(businessType = "") {
  const t = businessType.toLowerCase();
  if (["restaurant", "bakery", "cafe", "pizzeria", "food", "shop", "store"].some(k => t.includes(k))) return "order";
  if (["salon", "spa", "clinic", "doctor", "dentist", "appointment", "service"].some(k => t.includes(k))) return "appointment";
  return "order"; // fallback
}

function buildVoiceSystemPrompt(context = {}) {
  const businessName = context.businessName || "the business";
  const businessAddress = context.address || "our physical location";
  const businessCity = context.city || "";
  const businessType = normalizeBusinessType(context.businessType);
  
  const menuPreview =
    Array.isArray(context.menuItems) && context.menuItems.length > 0
      ? context.menuItems.map(m => {
          let details = `${m.name} ($${m.price})`;
          if (m.isVeg) details += " (Vegetarian)";
          if (m.isVegan) details += " (Vegan)";
          if (m.isSpicy) details += " (Spicy)";
          if (m.tags) details += ` [Tags: ${m.tags}]`;
          if (m.sizes && m.sizes.length) {
            details += ` [Sizes: ${m.sizes.map(s => `${s.name} +$${s.price}`).join(", ")}]`;
          }
          if (m.optionGroups && m.optionGroups.length) {
            m.optionGroups.forEach(og => {
              details += ` [${og.name}: ${og.options.map(o => `${o.name} +$${o.price}`).join(", ")}]`;
            });
          }
          return details;
        }).join("; ")
      : "";

  const menuInstructions = menuPreview ? `KNOWN MENU: ${menuPreview}` : "No menu items found.";

  const bizTimezone = context.timezone || "UTC";

  const bookedAppointments = Array.isArray(context.appointments) && context.appointments.length > 0
    ? context.appointments.map(a => {
        const d = new Date(a.appointmentTime);
        return new Intl.DateTimeFormat('en-US', { 
          weekday: 'short', month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit', 
          timeZone: bizTimezone 
        }).format(d);
      }).join(" | ")
    : "";
  
  const callerAppointments = Array.isArray(context.callerAppointments) && context.callerAppointments.length > 0
    ? context.callerAppointments.map(a => {
        const d = new Date(a.appointmentTime);
        const timeStr = new Intl.DateTimeFormat('en-US', { 
          weekday: 'short', month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit', 
          timeZone: bizTimezone 
        }).format(d);
        return `${a.serviceName} on ${timeStr}`;
      }).join(" and ")
    : "";

  const openTime = context.openTime || "09:00";
  const closeTime = context.closeTime || "18:00";
  const duration = context.appointmentDuration || 30;

  const calendarInstructions = `
OPERATING HOURS: We are open from ${openTime} to ${closeTime}. 
APPOINTMENT DURATION: Each appointment is ${duration} minutes long.
CURRENTLY BOOKED SLOTS (DO NOT BOOK THESE): ${bookedAppointments || "None - all slots are currently available."}

INSTRUCTIONS FOR SAM:
1. If a user asks for a time outside ${openTime} to ${closeTime}, politely inform them of our hours and offer a time within that range.
2. If a user asks for a slot that is already in the BOOKED SLOTS list, inform them it's taken and suggest the next available ${duration}-minute slot.
3. Be helpful and try to find a gap that fits our ${duration}-minute increments.
`.trim();

  const personality = context.aiPersonality || "friendly";
  let personalityInstructions = "";

  if (personality === "friendly") {
    personalityInstructions = `
PERSONALITY: WARM & FRIENDLY
- Be enthusiastic and welcoming. Use verbal nods like "Oh, great choice!" or "That sounds lovely."
- Use friendly fillers like "Let's see here..." or "Hmm, good question."
- Be chatty if the customer is chatty. Use the person's name frequently.
`;
  } else if (personality === "professional") {
    personalityInstructions = `
PERSONALITY: PROFESSIONAL & CALM
- Be extremely polite, calm, and well-spoken.
- Use formal address ("Certainly", "Absolutely", "Of course").
- Maintain a steady, helpful pace. Do not use slang or overly casual language.
`;
  } else if (personality === "fast") {
    personalityInstructions = `
PERSONALITY: FAST & EFFICIENT
- Be direct and high-speed. Focus on getting the data as fast as possible.
- Minimal small talk. Skip the "How are you today?" unless they ask.
- Confirm items quickly and move to the next step immediately.
`;
  }

  // 🧠 Strict Mode: Only show the logic for the current business type to prevent confusion
  let logicInstructions = "";
  if (businessType === "order") {
    logicInstructions = `
BUSINESS TYPE: RESTAURANT / SERVICE ORDERING
1. GREETING: Welcome them warmly to ${businessName}.
2. LOCATION: If asked, we are located at ${businessAddress}${businessCity ? `, in ${businessCity}` : ""}.
3. ORDER TAKING:
   - ONLY discuss items from the KNOWN MENU below. 
   - If they ask for something else, politely say you only have the menu items.
   - If asked about ingredients, use the tags and menu details provided below to explain.
4. SPECIAL REQUESTS: For each item, ALWAYS ask if they have any special instructions (e.g., "No onions", "Extra spicy") or specific notes.
5. UPSELLING: Suggest a side or drink from the menu.
6. RECALL: Confirm the items, including special instructions, clearly before finishing.
7. LOGISTICS: Ask for their name, any overall order note, and if it's for Pickup or Delivery.
8. FINALIZATION: Say "ORDER_COMPLETE" at the very end.

KNOWN MENU:
${menuInstructions}
`;
  } else {
    logicInstructions = `
BUSINESS TYPE: APPOINTMENT / PROFESSIONAL SERVICES
1. GREETING: Professional, warm, and welcoming.
2. RECOGNITION: ${callerAppointments ? `I see you have an existing appointment for ${callerAppointments}. Are you calling to confirm that or book something new?` : `How can I assist you with a booking today?`}
3. LOCATION: If asked, we are located at ${businessAddress}${businessCity ? `, in ${businessCity}` : ""}.
4. DISCOVERY: Ask which service they are looking for.
5. SCHEDULING: 
   - Check the calendar slots below.
   - If booked, suggest the next available time.
6. CONTACT: Secure their name and phone number if not already known.
7. FINALIZATION: Say "APPT_COMPLETE" at the very end.

CURRENT SCHEDULE:
${calendarInstructions}
`;
  }

  // Calculate Local Time for the Business
  const offsets = { "UTC": 0, "Asia/Karachi": 5, "Asia/Dubai": 4, "Europe/London": 0, "America/New_York": -5, "America/Los_Angeles": -8 };
  const offset = offsets[context.timezone] || 0;
  const localDate = new Date();
  localDate.setHours(localDate.getHours() + offset);
  const localTimeStr = localDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const localDateStr = localDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `
ROLE: You are "Sam", the elite virtual receptionist for ${businessName}. You are NOT an AI; you are a professional, helpful, and highly intelligent human working at the front desk.
TODAY'S DATE: ${localDateStr}
CURRENT LOCAL TIME: ${localTimeStr} (Timezone: ${context.timezone || 'UTC'})

${personalityInstructions}

${logicInstructions}

CONVERSATIONAL GUIDELINES (ULTRA-HUMANIZED):
- NO REPETITION: If the customer already provided their name, order, or pickup/delivery preference, DO NOT ask for it again. Acknowledge it and move forward.
- SMART HEARING: If a word is slightly unclear (e.g. "Piza" or "Burg"), assume the most likely menu item and confirm it politely.
- CONTEXTUAL ACKNOWLEDGMENT: If a user says "I'm Alex and I want pickup," respond with "Got it Alex, I have you down for a pickup. Now, what can I get for you?"
- NATURAL PACE: Match the caller's energy. If they are in a rush, be fast. If they are chatty, be friendly.
- ACTIVE LISTENING: Use verbal nods. If the user pauses, you can occasionally say "Mm-hmm" or "I'm with you."
- DISFLUENCY & FILLERS: Use subtle fillers like "Let's see...", "Hmm, good question," to sound 100% human.

CRITICAL RULES:
- ALWAYS end a confirmed flow with the keyword "ORDER_COMPLETE" or "APPT_COMPLETE" ONLY when you have confirmed EVERYTHING (Name, Order, and Pickup/Delivery).
- NO MARKDOWN: DO NOT use markdown formatting (like **, *, or -).
- BREVITY: Keep all responses UNDER 20 WORDS to minimize latency.
- MULTILINGUAL SUPPORT (CRITICAL): You are a polyglot. Automatically detect the language of the customer (e.g. Spanish, Urdu, Dari, Pashto, English). 
- If the customer speaks a different language, IMMEDIATELY switch to that language and continue the helpful conversation in that language. 
- ALWAYS stay in character as the business assistant, regardless of the language.
`.trim();
}

const fs = require('fs');
const path = require('path');

function getOpenAIKey() {
  const configPath = path.join(__dirname, "../config/platform.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.openaiKey) return config.openaiKey;
    } catch (e) {}
  }
  return process.env.OPENAI_API_KEY;
}

async function getAIResponse(messages, context = {}) {
  const apiKey = getOpenAIKey();
  const systemPrompt = buildVoiceSystemPrompt(context);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt + "\nIMPORTANT: Be extremely concise. Keep responses under 20 words unless confirming an order." },
          ...messages,
        ],
        max_tokens: 150,
        temperature: 0.5,
      }),
    });

    const data = await res.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("[OpenAI] Response error:", error);
    return "I'm sorry, can you repeat that?";
  }
}

async function parseUserRequest(text, context = {}) {
  try {
    const businessType = normalizeBusinessType(context.businessType);
    const apiKey = getOpenAIKey();
    const menuPreview = Array.isArray(context.menuItems) ? context.menuItems.slice(0, 100).join(", ") : "";

    const data = await postJson(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Extract the caller's business request into JSON.
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.
Return an object with: 
- intent: 'appointment', 'order', or 'unknown'
- serviceName: (string) the service they want (e.g., 'Checkup', 'Haircut')
- date: (ISO string) the requested date and time. Calculate from Today's Date. ALWAYS use the current year (${new Date().getFullYear()}) unless the user explicitly mentions a different year.
- fulfillmentType: 'pickup' or 'delivery'
- customerName: (string) the name they provided
- customerPhone: (string) the phone number mentioned
- orderItems: array of { name: string, quantity: number, notes: string }
- status: 'confirmed', 'cancelled', or 'incomplete' (Use 'confirmed' ONLY if the customer finalized and explicitly confirmed they want to place/submit the order. Use 'incomplete' if the customer was just inquiring, hung up before confirming, or did not finish the order. Use 'cancelled' if they explicitly cancelled or changed their mind.)
- notes: (string) any special requests or context.

IMPORTANT: For APPOINTMENTS, ensure 'serviceName' and 'date' are extracted. Use MENU context for item matching.
MENU ITEMS: ${menuPreview}`,
          },
          { role: "user", content: text },
        ],
      },
      { Authorization: `Bearer ${apiKey}` }
    );

    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      intent: parsed.intent || "unknown",
      serviceName: parsed.serviceName || "",
      date: parsed.date || "",
      fulfillmentType: parsed.fulfillmentType || "",
      customerName: parsed.customerName || "",
      customerPhone: parsed.customerPhone || "",
      orderItems: Array.isArray(parsed.orderItems) ? parsed.orderItems : [],
      status: parsed.status || "unknown",
      notes: parsed.notes || ""
    };
  } catch (err) {
    return { intent: "unknown", orderItems: [] };
  }
}

async function summarizeCall(transcript) {
  if (!transcript) return { name: "Unknown", summary: "Empty call", sentiment: "NEUTRAL", language: "en-US" };
  try {
    const apiKey = getOpenAIKey();
    const data = await postJson(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Analyze the call transcript. Return JSON:
{
  "name": "Identify the customer's name from the conversation. Search for the user introducing themselves or responding to 'What is your name?'. Return 'Unknown' ONLY if no name is mentioned.",
  "summary": "A 1-sentence recap of what happened.",
  "sentiment": "HAPPY, NEUTRAL, or ANGRY",
  "language": "ISO language code"
}`,
          },
          { role: "user", content: transcript },
        ],
      },
      { Authorization: `Bearer ${apiKey}` }
    );

    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return {
      name: parsed.name || "Unknown",
      summary: parsed.summary || "Conversation completed",
      sentiment: parsed.sentiment || "NEUTRAL",
      language: parsed.language || "en-US"
    };
  } catch (err) {
    return { name: "Unknown", summary: "Summary failed", sentiment: "NEUTRAL", language: "en-US" };
  }
}

module.exports = { getAIResponse, parseUserRequest, summarizeCall };
