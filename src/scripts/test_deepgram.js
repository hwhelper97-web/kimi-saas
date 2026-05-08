const { getDeepgramAuraAudio } = require("../services/deepgram-tts");
require('dotenv').config();

async function testDeepgram() {
  console.log("⚡ Starting Deepgram Aura Voice Test...");
  
  try {
    const text = "Hello! I am the new high-speed AI voice from Deepgram Aura. I respond almost instantly!";
    const startTime = Date.now();
    const audioBuffer = await getDeepgramAuraAudio(text);
    const duration = Date.now() - startTime;

    if (audioBuffer && audioBuffer.length > 500) {
      console.log("✅ SUCCESS! Deepgram Aura returned audio.");
      console.log("Latency:", duration, "ms");
      console.log("Audio Buffer Size:", audioBuffer.length, "bytes");
    } else {
      console.log("❌ FAILED! Deepgram returned an empty buffer. Check your API Key.");
    }
  } catch (error) {
    console.error("💥 Deepgram Test Failed:", error.message);
  }
}

testDeepgram();
