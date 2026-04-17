const { VoiceResponse } = require("twilio").twiml;
const { generateReply, logCall } = require("../services/voice.service");

const memory = new Map();

async function inboundWebhook(req, res) {
  const { CallSid, From, To, businessId, businessType = "ORDER" } = req.body;
  await logCall({ twilioCallSid: CallSid, phoneFrom: From, phoneTo: To, channel: "INBOUND", businessId });

  memory.set(CallSid, { businessType, history: [] });

  const twiml = new VoiceResponse();
  twiml.say("Welcome to our AI assistant. Please tell me how I can help you today.");
  twiml.gather({ input: "speech", action: "/api/voice/gather", method: "POST", speechTimeout: "auto" });
  res.type("text/xml").send(twiml.toString());
}

async function gatherWebhook(req, res) {
  const { CallSid, SpeechResult } = req.body;
  const state = memory.get(CallSid) || { businessType: "ORDER", history: [] };
  state.history.push({ role: "user", content: SpeechResult || "" });

  const reply = await generateReply(state);
  state.history.push({ role: "assistant", content: reply });
  memory.set(CallSid, state);

  const twiml = new VoiceResponse();
  twiml.say(reply);
  twiml.gather({ input: "speech", action: "/api/voice/gather", method: "POST", speechTimeout: "auto" });
  res.type("text/xml").send(twiml.toString());
}

module.exports = { inboundWebhook, gatherWebhook };
