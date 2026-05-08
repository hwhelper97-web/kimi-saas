const { getElevenLabsAudio } = require("../services/elevenlabs");
require('dotenv').config();

async function testVoice() {
  console.log("🎙️ Starting ElevenLabs Voice Test...");
  console.log("Using Voice ID:", process.env.ELEVENLABS_VOICE_ID);

  try {
    const text = "Hello! I am your new premium AI voice from ElevenLabs. How can I help you today?";
    const audioBuffer = await getElevenLabsAudio(text);

    if (audioBuffer && audioBuffer.length > 500) {
      console.log("✅ SUCCESS! ElevenLabs returned a valid audio buffer.");
      console.log("Audio Buffer Size:", audioBuffer.length, "bytes");
    } else {
      console.log("❌ FAILED! ElevenLabs returned an empty or invalid buffer.");
      if (!audioBuffer) console.log("Reason: Buffer was null. Check API Key and Voice ID.");
    }
  } catch (error) {
    console.error("💥 Voice Test Failed:", error.message);
  }
}

testVoice();
