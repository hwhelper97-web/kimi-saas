const { getElevenLabsAudio } = require('./src/services/elevenlabs');
require('dotenv').config();

async function test() {
  console.log("Testing ElevenLabs with key:", process.env.ELEVENLABS_API_KEY ? "FOUND" : "MISSING");
  const buffer = await getElevenLabsAudio("Hello! This is a test from Antigravity.");
  if (buffer) {
    console.log("SUCCESS! Received audio buffer of length:", buffer.length);
  } else {
    console.log("FAILED! See console for errors.");
  }
}

test();
