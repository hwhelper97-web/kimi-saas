const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { getElevenLabsAudio } = require("./elevenlabs");

/**
 * 🔊 TTS SERVICE (TEXT-TO-SPEECH)
 * Generates natural spoken audio MP3 buffers from AI response text using ElevenLabs or OpenAI TTS.
 */
class TTSService {
  constructor() {
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  }

  /**
   * Clean markdown and technical formatting for natural spoken speech
   * @param {string} text 
   * @returns {string}
   */
  cleanTextForSpeech(text) {
    if (!text) return "";
    return text
      .replace(/[*#`_~>]/g, "") // Strip Markdown headers, bold, code ticks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Strip Markdown links keeping text
      .replace(/<[^>]+>/g, "") // Strip HTML tags
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "") // Strip Emojis
      .replace(/\n+/g, ". ") // Convert newlines to sentence breaks
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();
  }

  /**
   * Generate an MP3 audio buffer for given text
   * @param {string} rawText 
   * @returns {Promise<Buffer|null>}
   */
  async generateSpeechBuffer(rawText) {
    const speechText = this.cleanTextForSpeech(rawText);
    if (!speechText) return null;

    // Truncate to first 500 characters for snappy voice response if long output
    const truncatedText = speechText.length > 500 ? speechText.substring(0, 497) + "..." : speechText;

    // 1. Try ElevenLabs TTS
    if (process.env.ELEVENLABS_API_KEY) {
      try {
        console.log(`[TTSService] Generating spoken response via ElevenLabs: "${truncatedText.substring(0, 40)}..."`);
        const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
        const buffer = await getElevenLabsAudio(truncatedText, voiceId, "mp3_44100");
        if (buffer && buffer.length > 0) {
          return buffer;
        }
      } catch (err) {
        console.error("[TTSService] ElevenLabs error:", err.message);
      }
    }

    // 2. OpenAI TTS Fallback
    if (this.openai) {
      try {
        console.log(`[TTSService] Generating spoken response via OpenAI TTS: "${truncatedText.substring(0, 40)}..."`);
        const mp3 = await this.openai.audio.speech.create({
          model: "tts-1",
          voice: "alloy",
          input: truncatedText,
          response_format: "mp3"
        });
        const arrayBuffer = await mp3.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err) {
        console.error("[TTSService] OpenAI TTS error:", err.message);
      }
    }

    return null;
  }
}

module.exports = new TTSService();
