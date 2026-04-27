const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const fs = require('fs');
const path = require('path');

/**
 * getOpenAIVoice — Generates high-quality speech using OpenAI TTS
 */
async function getOpenAIVoice(text, options = {}) {
  try {
    // Load defaults from platform config
    let config = { voice: "nova", speed: 1.0, openaiKey: process.env.OPENAI_API_KEY };
    const configPath = path.join(__dirname, "../config/platform.json");
    if (fs.existsSync(configPath)) {
      try {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (savedConfig.voice) config.voice = savedConfig.voice;
        if (savedConfig.speed) config.speed = savedConfig.speed;
        if (savedConfig.openaiKey) config.openaiKey = savedConfig.openaiKey;
      } catch (e) {}
    }

    if (!config.openaiKey) return null;

    // Use specific openai instance with the potentially new key
    const currentOpenai = new OpenAI({ apiKey: config.openaiKey });

    const mp3 = await currentOpenai.audio.speech.create({
      model: "tts-1",
      voice: options.voice || config.voice || "nova", 
      speed: options.speed || config.speed || 1.0,
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer;
  } catch (error) {
    console.error("[OpenAI-TTS] Error:", error.message);
    return null;
  }
}

module.exports = { getOpenAIVoice };
