/**
 * getElevenLabsAudio — Returns a buffer of the audio (Standard)
 */
async function getElevenLabsAudio(text, customVoiceId = null, outputFormat = 'ulaw_8000') {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = customVoiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; 

  if (!apiKey) return null;

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.6, similarity_boost: 0.75 }
      })
    });

    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("[ElevenLabs] Request failed:", error.message);
    return null;
  }
}

/**
 * streamElevenLabsAudio — Returns a Fetch response stream (High Speed)
 */
async function streamElevenLabsAudio(text, customVoiceId = null, outputFormat = 'ulaw_8000') {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = customVoiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; 

  if (!apiKey) return null;

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.6, similarity_boost: 0.75 }
      })
    });

    return response.ok ? response : null;
  } catch (error) {
    console.error("[ElevenLabs] Stream request failed:", error.message);
    return null;
  }
}

module.exports = { getElevenLabsAudio, streamElevenLabsAudio };
