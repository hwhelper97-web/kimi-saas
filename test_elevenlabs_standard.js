const { getElevenLabsAudio } = require('./src/services/elevenlabs');
require('dotenv').config();

async function test() {
  const joannaVoiceId = '21m00Tcm4TlvDq8ikWAM';
  process.env.ELEVENLABS_VOICE_ID = joannaVoiceId;
  
  console.log("Testing ElevenLabs with standard voice:", joannaVoiceId);
  const buffer = await getElevenLabsAudio("Hello! This is a test using a standard voice.");
  if (buffer) {
    console.log("SUCCESS! Standard voice works.");
  } else {
    console.log("FAILED! Even standard voice failed.");
  }
}

test();
