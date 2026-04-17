const twilio = require("twilio");
const { OpenAI } = require("openai");
const prisma = require("../config/prisma");
const { twilio: twilioConfig } = require("../config/env");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);

function buildVoicePrompt({ businessType, history }) {
  const system =
    businessType === "APPOINTMENT"
      ? "You are a phone agent for booking appointments. Ask date/time, validate availability, then confirm booking."
      : "You are a phone agent for food orders. Collect item names, quantities, pickup or delivery, then confirm total.";

  return [
    { role: "system", content: system },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];
}

async function generateReply(state) {
  const messages = buildVoicePrompt(state);
  const response = await openai.chat.completions.create({ model: "gpt-4o-mini", messages, temperature: 0.2 });
  return response.choices[0]?.message?.content || "Sorry, can you repeat that?";
}

async function logCall(data) {
  return prisma.callLog.upsert({
    where: { twilioCallSid: data.twilioCallSid },
    update: data,
    create: data,
  });
}

async function createOutboundCall({ to, webhookUrl }) {
  return twilioClient.calls.create({ to, from: twilioConfig.phoneNumber, url: webhookUrl });
}

module.exports = { generateReply, logCall, createOutboundCall };
