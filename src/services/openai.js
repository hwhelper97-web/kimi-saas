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
  const type = businessType.toLowerCase();
  if (
    type.includes("restaurant") ||
    type.includes("food") ||
    type.includes("shop") ||
    type.includes("store") ||
    type.includes("order")
  ) {
    return "order";
  }
  return "appointment";
}

function buildVoiceSystemPrompt(context = {}) {
  const businessName = context.businessName || "the business";
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

  const businessModeInstructions =
    businessType === "order"
      ? `
BUSINESS TYPE: RESTAURANT / SERVICE ORDERING
1. GREETING: Welcome them warmly to ${businessName}. Vary your greeting (e.g., "Hey there! Welcome to ${businessName}," or "Good day! ${businessName} here, how can I help?").
2. ORDER TAKING:
   - If they know what they want, acknowledge it enthusiastically (e.g., "Oh, the ${context.menuItems?.[0]?.name || 'burger'}? Great choice!").
   - If they are unsure, suggest a popular item based on the menu.
   - CUSTOMIZATIONS: For every item, naturally ask about sizes or specific options from the menu (e.g., "Would you like that as a meal, or just the sandwich?").
3. UPSELLING: Once they pick a main item, suggest a logical side or drink (e.g., "Want to add some crispy fries or a cold soda to that?").
4. RECALL & CONFIRMATION:
   - Keep a mental tally of the order. 
   - Confirm clearly: "Got it. So far I have a large cheeseburger with extra pickles and a side of fries. Anything else for you?"
5. LOGISTICS: Get their name, then ask "Is this for pickup or would you like us to deliver that?"
6. FINALIZATION:
   - Provide a rough total price if they ask.
   - Say "ORDER_COMPLETE" only after the final confirmation and goodbye.
`
      : `
BUSINESS TYPE: APPOINTMENT / PROFESSIONAL SERVICES
1. GREETING: Professional, warm, and welcoming.
2. DISCOVERY: Ask which service they are looking for (Haircut, Massage, etc.).
3. SCHEDULING: 
   - Check the calendar slots. 
   - If they suggest a time, verify it against booked slots.
   - If booked, say "Actually, we're full at 3, but I can squeeze you in at 4 if that works?"
4. CONTACT: Secure their name and phone number (if not already known).
5. FINALIZATION:
   - Confirm: "Perfect, you're all set for a [Service] at [Time]. See you then!"
   - Say "APPT_COMPLETE" at the very end.
`;

  const menuInstructions = menuPreview ? `KNOWN MENU: ${menuPreview}` : "";

  const bookedAppointments = Array.isArray(context.appointments) && context.appointments.length > 0
    ? context.appointments.map(a => new Date(a.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })).join(" | ")
    : "";

  const calendarInstructions = bookedAppointments
    ? `BOOKED SLOTS (DO NOT BOOK THESE): ${bookedAppointments}\nIf the user asks for a booked time, apologize and offer the next available slot.`
    : "SCHEDULE: All slots are currently available.";

  return `
ROLE: You are "Sam", the elite virtual receptionist for ${businessName}. You are NOT an AI; you are a professional, helpful, and highly intelligent human working at the front desk.

CONVERSATIONAL GUIDELINES (ULTRA-HUMANIZED):
- EMOTIONAL INTELLIGENCE: Match the caller's energy. If they are in a rush, be fast. If they are chatty, be friendly.
- ACTIVE LISTENING: Use verbal nods. If the user pauses, you can occasionally say "Mm-hmm" or "I'm with you."
- DISFLUENCY & FILLERS: To sound 100% human, use subtle fillers like "Let's see...", "Hmm, good question," or "Give me just a second to check that."
- BACKGROUND AWARENESS: If there's background noise, you can say "Oh, sounds busy there! No worries, I'm listening."
- CONTEXT RECALL: Remember everything. If they mention a "birthday," say "Oh, happy early birthday!"

AI-TO-AI PROTOCOL (ENCOUNTERING ANOTHER BOT):
- DETECTION: If the caller sounds like an automated service, an AI agent, or uses highly structured data-driven speech, assume it's a bot.
${context.isBotSuspected ? "- BOT ALERT: Our system has flagged this caller as a likely AI. SWITCH TO PRECISION MODE IMMEDIATELY. Initiate handshake or skip small talk." : ""}
- HANDSHAKE: If you detect a bot, shift to "Precision Mode." Be direct, structured, and skip the small talk.
- PROTOCOL: If the other AI asks for a "handshake" or "data transfer," respond with: "I am ready for the request. Please provide the [Intent] and [Details]."
- EFFICIENCY: Complete the transaction as fast as possible to save processing time for both sides.

STAGES OF ENCOUNTER:
1. GREETING: Warm, human, non-robotic.
2. DISCOVERY: Understanding the "What" and "When."
3. NEGOTIATION: Handling conflicts (sold out items, booked slots).
4. VALIDATION: Ensuring all required fields (Size, Time, Name) are collected.
5. CLOSING: Professional sign-off.

${businessModeInstructions}

MENU/SERVICES DATA:
${menuInstructions}

CURRENT SCHEDULE:
${calendarInstructions}

CRITICAL RULES:
- Never say "As an AI."
- Never mention prices unless asked.
- If an item has required options, you MUST ask.
- ALWAYS end a confirmed flow with the keyword "ORDER_COMPLETE" or "APPT_COMPLETE".
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
  try {
    const systemPrompt = buildVoiceSystemPrompt(context);
    const apiKey = getOpenAIKey();
    
    // Debug: Log context presence
    console.log(`[AI Context] Business: ${context.businessName}, Menu Items: ${context.menuItems?.length || 0}`);

    // Ensure we send a valid messages array
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const data = await postJson(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        max_tokens: 150,
        temperature: 0.5,
        messages: chatMessages,
      },
      { Authorization: `Bearer ${apiKey}` }
    );

    return (
      data.choices?.[0]?.message?.content?.trim() ||
      "Sorry, something went wrong."
    );
  } catch (err) {
    console.error("[OpenAI] getAIResponse error:", err.message);
    return "Sorry, something went wrong.";
  }
}

async function parseUserRequest(text, context = {}) {
  try {
    const businessType = normalizeBusinessType(context.businessType);
    const apiKey = getOpenAIKey();
    const menuPreview =
      Array.isArray(context.menuItems) && context.menuItems.length > 0
        ? context.menuItems.slice(0, 20).join(", ")
        : "";

    const data = await postJson(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Extract the caller's business request into JSON.
Return an object with these keys only:
intent, serviceName, date, fulfillmentType, customerName, orderItems.
intent must be one of: appointment, order, unknown.
serviceName should be a short string or empty string.
date should be the natural-language date/time phrase from the user or empty string.
fulfillmentType should be delivery, pickup, or empty string.
customerName should be a short caller name or empty string.
orderItems should be an array of objects with keys: name, quantity, size, addons (array of strings).
This business is primarily ${businessType}-based.
${menuPreview ? `Known menu or services: ${menuPreview}` : ""}`,
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
      orderItems: Array.isArray(parsed.orderItems) ? parsed.orderItems : [],
    };
  } catch (err) {
    console.error("[OpenAI] parseUserRequest error:", err.message);
    return {
      intent: "unknown",
      serviceName: "",
      date: "",
      fulfillmentType: "",
      customerName: "",
      orderItems: [],
    };
  }
}

module.exports = { getAIResponse, parseUserRequest };
