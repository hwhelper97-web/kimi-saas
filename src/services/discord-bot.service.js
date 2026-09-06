const superadminAgentService = require("./superadmin-agent.service");
const menuParserService = require("./menu-parser.service");
const sttService = require("./stt.service");
const ttsService = require("./tts.service");
const fs = require("fs");
const path = require("path");
const https = require("https");
const WebSocket = require("ws");
const os = require("os");

/**
 * 🤖 DISCORD BOT CLIENT & SECURITY GUARD FOR SUPERADMIN (VOICE & TEXT ENABLED)
 * Handles Discord WebSocket Gateway connection, DMs, Channels, Interactive Buttons,
 * Voice Note Transcriptions (STT), Spoken Voice Responses (TTS), and Voice Attachments.
 */
class DiscordBotService {
  constructor() {
    this.token = process.env.DISCORD_BOT_TOKEN || "";
    this.applicationId = process.env.DISCORD_APPLICATION_ID || "";
    this.allowedUserIds = (process.env.SUPERADMIN_DISCORD_USER_IDS || "")
      .split(",")
      .map(id => id.trim())
      .filter(Boolean);
    
    this.voiceResponseEnabled = process.env.DISCORD_ENABLE_VOICE_RESPONSES !== "false"; // Default true
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
    this.isConnected = false;
  }

  isAuthorized(userId) {
    if (!userId) return false;
    if (this.allowedUserIds.length === 0) {
      return true;
    }
    return this.allowedUserIds.includes(String(userId).trim());
  }

  /**
   * Start Discord Bot Gateway Connection
   */
  start() {
    if (!this.token || this.token === "your_local_discord_bot_token") {
      console.log("[DiscordBot] ℹ️ Local Discord Bot Token not configured in .env.discord-agent.local. Bot gateway standby.");
      return;
    }

    console.log("[DiscordBot] 🔌 Connecting to Discord Gateway...");
    this.connectGateway();
  }

  connectGateway() {
    try {
      this.ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");

      this.ws.on("open", () => {
        console.log("[DiscordBot] Connected to Discord Gateway WebSocket.");
      });

      this.ws.on("message", async (data) => {
        try {
          const payload = JSON.parse(data.toString());
          const { op, d, t, s } = payload;
          if (s) this.sequence = s;

          // OP 10: Hello -> Send Identify & Heartbeat
          if (op === 10) {
            const interval = d.heartbeat_interval;
            this.startHeartbeat(interval);
            this.sendIdentify();
          }

          // OP 0: Dispatch Event
          if (op === 0) {
            if (t === "READY") {
              this.isConnected = true;
              console.log(`[DiscordBot] 🤖 Logged in as ${d.user.username}#${d.user.discriminator} (ID: ${d.user.id}) [Voice Mode: ${this.voiceResponseEnabled ? "ENABLED 🎙️" : "DISABLED 📝"}]`);
            } else if (t === "MESSAGE_CREATE") {
              await this.handleIncomingMessage(d);
            } else if (t === "INTERACTION_CREATE") {
              await this.handleInteraction(d);
            }
          }
        } catch (err) {
          console.error("[DiscordBot] Error parsing gateway message:", err.message);
        }
      });

      this.ws.on("close", (code, reason) => {
        console.warn(`[DiscordBot] Gateway connection closed (${code}): ${reason}`);
        this.isConnected = false;
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        setTimeout(() => this.connectGateway(), 5000);
      });

      this.ws.on("error", (err) => {
        console.error("[DiscordBot] Gateway WebSocket error:", err.message);
      });
    } catch (err) {
      console.error("[DiscordBot] Failed to initiate Gateway connection:", err.message);
    }
  }

  startHeartbeat(interval) {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
      }
    }, interval);
  }

  sendIdentify() {
    const payload = {
      op: 2,
      d: {
        token: this.token,
        intents: 33281, // GUILD_MESSAGES | DIRECT_MESSAGES | MESSAGE_CONTENT
        properties: {
          os: "windows",
          browser: "NaxtonSuperadminAgent",
          device: "NaxtonSuperadminAgent"
        }
      }
    };
    this.ws.send(JSON.stringify(payload));
  }

  /**
   * Helper to download file from URL to local temporary path
   */
  async downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          return this.downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve(destPath)));
      }).on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Handle incoming text messages, voice notes, and DMs
   */
  async handleIncomingMessage(msg) {
    if (msg.author.bot) return;

    // Security Check: Authorized User Allowlist
    if (!this.isAuthorized(msg.author.id)) {
      console.warn(`[DiscordBot] Unauthorized access attempt by user ${msg.author.username} (${msg.author.id})`);
      return await this.sendChannelMessage(msg.channel_id, "🚫 **Access Denied**: You are not authorized to use the Superadmin AI.");
    }

    const content = (msg.content || "").trim();
    const attachments = msg.attachments || [];

    // Check voice toggle command
    if (content.toLowerCase() === "!voice on") {
      this.voiceResponseEnabled = true;
      return await this.sendChannelMessage(msg.channel_id, "🎙️ **Voice Responses Enabled**: The bot will now attach spoken MP3 voice notes to responses.");
    }
    if (content.toLowerCase() === "!voice off") {
      this.voiceResponseEnabled = false;
      return await this.sendChannelMessage(msg.channel_id, "📝 **Voice Responses Disabled**: The bot will respond in text mode only.");
    }

    let attachmentText = "";
    let isVoiceInput = false;

    if (attachments.length > 0) {
      const att = attachments[0];
      console.log(`[DiscordBot] Attachment received: ${att.filename} (${att.content_type})`);
      const contentType = (att.content_type || "").toLowerCase();
      const ext = path.extname(att.filename || "").toLowerCase();

      // Check if attachment is Audio / Voice Note
      if (contentType.includes("audio") || contentType.includes("video/ogg") || [".ogg", ".mp3", ".wav", ".m4a", ".aac"].includes(ext)) {
        isVoiceInput = true;
        try {
          const tempPath = path.join(os.tmpdir(), `discord_voice_${Date.now()}${ext || ".ogg"}`);
          await this.downloadFile(att.url, tempPath);
          console.log(`[DiscordBot] Voice note downloaded to ${tempPath}. Transcribing...`);
          
          const sttRes = await sttService.transcribeAudioFile(tempPath);
          if (sttRes.success && sttRes.text) {
            attachmentText = `[Voice Note Transcribed]: "${sttRes.text}"`;
            console.log(`[DiscordBot] Transcribed Voice Note: "${sttRes.text}"`);
          } else {
            attachmentText = `[Voice Note attached, but transcription failed]`;
          }

          // Clean up temp file
          fs.unlink(tempPath, () => {});
        } catch (err) {
          console.error("[DiscordBot] Failed to download or transcribe voice note:", err.message);
        }
      } 
      // Check if attachment is Menu PDF or Image
      else if (contentType.includes("pdf") || contentType.includes("image")) {
        const parseRes = await menuParserService.parseMenuFile({
          filePath: att.url,
          mimeType: att.content_type
        });
        if (parseRes.success) {
          attachmentText = `[Parsed Menu Attachment ${att.filename}: ${parseRes.summary.totalItems} items detected in ${parseRes.summary.totalCategories} categories]`;
        }
      }
    }

    // Pass to AI Agent Core
    const combinedText = `${content} ${attachmentText}`.trim();
    if (!combinedText) return;

    const response = await superadminAgentService.processCommand({
      sessionId: `discord_${msg.channel_id}_${msg.author.id}`,
      userId: msg.author.id,
      userName: msg.author.username,
      text: combinedText
    });

    // Generate Spoken Voice Response (TTS) if voice response enabled or if user sent a voice note
    let audioBuffer = null;
    if (this.voiceResponseEnabled || isVoiceInput) {
      audioBuffer = await ttsService.generateSpeechBuffer(response.response);
    }

    await this.sendChannelMessage(msg.channel_id, response.response, response.buttons, audioBuffer);
  }

  /**
   * Handle Discord Interaction (Buttons & Slash Commands)
   */
  async handleInteraction(interaction) {
    const userId = interaction.member?.user?.id || interaction.user?.id;
    if (!this.isAuthorized(userId)) {
      return await this.respondInteraction(interaction.id, interaction.token, {
        content: "🚫 **Access Denied**: You are not authorized to use the Superadmin AI.",
        flags: 64
      });
    }

    // Button Click Interactions
    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id;
      const channelId = interaction.channel_id;

      if (customId === "agent_confirm_action") {
        const res = await superadminAgentService.executePendingAction(`discord_${channelId}_${userId}`, userId);
        let audioBuffer = null;
        if (this.voiceResponseEnabled) {
          audioBuffer = await ttsService.generateSpeechBuffer(res.response);
        }
        
        await this.respondInteraction(interaction.id, interaction.token, {
          content: res.response
        });

        if (audioBuffer) {
          await this.sendChannelMessage(channelId, "🎙️ **Voice Action Execution Summary:**", null, audioBuffer);
        }
      } else if (customId === "agent_cancel_action") {
        superadminAgentService.clearSession(`discord_${channelId}_${userId}`);
        return await this.respondInteraction(interaction.id, interaction.token, {
          content: "❌ **Action Canceled**: Operation aborted by Superadmin."
        });
      }
    }
  }

  /**
   * Send text message, embed, and optional MP3 voice recording attachment to Discord channel via REST API
   */
  async sendChannelMessage(channelId, content, buttons = null, audioBuffer = null) {
    if (!this.token) return;

    const payload = {
      content,
      allowed_mentions: { parse: [] }
    };

    if (buttons && Array.isArray(buttons)) {
      payload.components = [
        {
          type: 1, // ActionRow
          components: buttons.map(b => ({
            type: 2, // Button
            label: b.label,
            custom_id: b.customId,
            style: b.style === "DANGER" ? 4 : (b.style === "PRIMARY" ? 1 : 2)
          }))
        }
      ];
    }

    // If audio buffer is provided, construct multipart/form-data request
    if (audioBuffer && Buffer.isBuffer(audioBuffer) && audioBuffer.length > 0) {
      return this.sendMultipartMessage(channelId, payload, audioBuffer, "voice_response.mp3");
    }

    // Standard JSON payload
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const req = https.request(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${this.token}`,
          "Content-Type": "application/json"
        }
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve(body));
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Send multipart/form-data Discord REST payload with MP3 audio attachment
   */
  async sendMultipartMessage(channelId, payloadJson, fileBuffer, fileName = "audio.mp3") {
    const boundary = "----DiscordBotBoundary" + Date.now().toString(16);
    
    let headerJson = `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payloadJson)}\r\n`;
    let headerFile = `--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${fileName}"\r\nContent-Type: audio/mpeg\r\n\r\n`;
    let footer = `\r\n--${boundary}--\r\n`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(headerJson, "utf8"),
      Buffer.from(headerFile, "utf8"),
      fileBuffer,
      Buffer.from(footer, "utf8")
    ]);

    return new Promise((resolve, reject) => {
      const req = https.request(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${this.token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": bodyBuffer.length
        }
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve(body));
      });
      req.on("error", reject);
      req.write(bodyBuffer);
      req.end();
    });
  }

  async respondInteraction(interactionId, interactionToken, responseData) {
    const data = JSON.stringify({ type: 4, data: responseData });
    return new Promise((resolve, reject) => {
      const req = https.request(`https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve(body));
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = new DiscordBotService();
