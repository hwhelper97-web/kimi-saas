const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

/**
 * 🎤 STT SERVICE (SPEECH-TO-TEXT)
 * Transcribes audio files (voice notes, ogg, mp3, wav, m4a) into text using OpenAI Whisper / Deepgram.
 */
class STTService {
  constructor() {
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  }

  /**
   * Transcribe an audio file path to text
   * @param {string} filePath - Absolute path to local audio file
   * @returns {Promise<{ success: boolean, text: string, error?: string }>}
   */
  async transcribeAudioFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return { success: false, text: "", error: "File not found" };
    }

    // 1. Try OpenAI Whisper API
    if (this.openai) {
      try {
        console.log(`[STTService] Transcribing audio with OpenAI Whisper: ${path.basename(filePath)}`);
        const fileStream = fs.createReadStream(filePath);
        const transcription = await this.openai.audio.transcriptions.create({
          file: fileStream,
          model: "whisper-1"
        });

        if (transcription && transcription.text) {
          console.log(`[STTService] Whisper Result: "${transcription.text}"`);
          return { success: true, text: transcription.text.trim() };
        }
      } catch (err) {
        console.error("[STTService] OpenAI Whisper error:", err.message);
      }
    }

    // 2. Deepgram Fallback
    if (process.env.DEEPGRAM_API_KEY) {
      try {
        console.log(`[STTService] Trying Deepgram STT fallback: ${path.basename(filePath)}`);
        const { createClient } = require("@deepgram/sdk");
        const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
        const audioBuffer = fs.readFileSync(filePath);

        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
          audioBuffer,
          { model: "nova-2", smart_format: true }
        );

        if (!error && result?.results?.channels[0]?.alternatives[0]?.transcript) {
          const text = result.results.channels[0].alternatives[0].transcript.trim();
          console.log(`[STTService] Deepgram Result: "${text}"`);
          return { success: true, text };
        }
      } catch (err) {
        console.error("[STTService] Deepgram error:", err.message);
      }
    }

    return { success: false, text: "", error: "STT transcription failed with all providers" };
  }
}

module.exports = new STTService();
