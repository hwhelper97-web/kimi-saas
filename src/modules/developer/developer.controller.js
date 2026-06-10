const prisma = require("../../config/prisma");
const { ROLES } = require("../../constants/roles");
const axios = require('axios');
const OpenAI = require('openai');

exports.getDashboard = async (req, res) => {
  try {
    // For now, render the main developer dashboard view
    // We'll pass some initial data
    const activeIncidents = await prisma.incident.count({
      where: { status: { not: "resolved" } }
    });

    const technicalTickets = await prisma.ticket.count({
      where: { 
        status: { in: ["open", "investigating", "fixing", "testing"] },
        priority: { in: ["high", "urgent", "critical"] }
      }
    });

    let systemMetrics = await prisma.systemMetric.findMany({
      orderBy: { timestamp: "desc" },
      take: 20
    });

    if (systemMetrics.length === 0) {
      // Mock some metrics for the UI
      systemMetrics = Array.from({ length: 20 }).map((_, i) => ({
        id: `mock-${i}`,
        name: "api_latency",
        value: 100 + Math.random() * 50,
        timestamp: new Date(Date.now() - i * 60000)
      }));
    }

    res.render("developer-dashboard", {
      user: req.user,
      stats: {
        activeIncidents,
        technicalTickets,
        systemHealth: "99.9%",
        aiLatency: "450ms"
      },
      systemMetrics
    });
  } catch (error) {
    console.error("Developer Dashboard Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    // Mock analytics for technical operations
    const analytics = {
      uptime: [99.9, 99.8, 99.9, 100, 99.9, 99.9, 99.9],
      aiLatency: [420, 450, 480, 410, 430, 460, 440],
      errorRate: [0.1, 0.2, 0.15, 0.05, 0.1, 0.3, 0.1],
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    };

    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTickets = async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        OR: [
          { status: "escalated" },
          { priority: "critical" },
          { priority: "urgent" }
        ]
      },
      include: {
        tenant: true,
        assignedTo: true,
        createdBy: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getIncidents = async (req, res) => {
  try {
    const incidents = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: incidents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createIncident = async (req, res) => {
  try {
    const { title, description, severity, affectedServices } = req.body;
    const incident = await prisma.incident.create({
      data: {
        title,
        description,
        severity,
        affectedServices,
        status: "investigating",
        timeline: []
      }
    });
    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes } = req.body;
    
    const updateData = { status };
    if (status === "resolved") {
      updateData.resolvedAt = new Date();
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: updateData
    });
    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    
    // In a real app, we'd fetch from a logging service or a DB table
    // For this demo, we'll return some audit logs and integration logs
    const logs = await prisma.auditLog.findMany({
      take: parseInt(limit),
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getSystemMetrics = async (req, res) => {
  try {
    const metrics = await prisma.systemMetric.findMany({
      take: 100,
      orderBy: { timestamp: "desc" }
    });
    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTasks = async (req, res) => {
  try {
    const tasks = await prisma.internalTask.findMany({
      where: { assignedToId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAiMetrics = async (req, res) => {
  try {
    const tokens = await prisma.call.aggregate({
      _sum: { tokensUsed: true },
      _avg: { aiConfidence: true, duration: true }
    });

    res.json({ 
      success: true, 
      data: {
        totalTokens: tokens._sum.tokensUsed || 0,
        avgConfidence: (tokens._avg.aiConfidence || 0.95).toFixed(2),
        avgDuration: (tokens._avg.duration || 0).toFixed(1),
        tokenBurnRate: "12.4k/hr",
        providerStatus: {
          openai: { status: "operational", latency: "340ms", uptime: "99.98%" },
          elevenlabs: { status: "operational", latency: "850ms", uptime: "99.95%" },
          deepgram: { status: "operational", latency: "210ms", uptime: "99.99%" }
        }
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
exports.getDeployments = async (req, res) => {
  try {
    // Mock deployment history for now
    const deployments = [
      { version: "v2.4.1", status: "success", env: "production", deployedAt: new Date(), author: "Dev-Bot" },
      { version: "v2.4.0", status: "success", env: "production", deployedAt: new Date(Date.now() - 86400000), author: "Admin" },
      { version: "v2.3.9", status: "failed", env: "production", deployedAt: new Date(Date.now() - 172800000), author: "Dev-Bot" }
    ];
    res.json({ success: true, data: deployments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getQueues = async (req, res) => {
  try {
    // Mock queue status
    const queues = {
      voice_processing: { pending: 5, active: 2, failed: 0 },
      transcript_extraction: { pending: 12, active: 4, failed: 1 },
      webhook_delivery: { pending: 0, active: 0, failed: 0 }
    };
    res.json({ success: true, data: queues });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDebugTools = async (req, res) => {
  try {
    // Fetch recent calls for debugging transcripts/voice
    const calls = await prisma.call.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { business: true }
    });
    res.json({ success: true, data: calls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getInternalNotes = async (req, res) => {
  try {
    // Fetch internal ticket messages across all tickets
    const notes = await prisma.ticketMessage.findMany({
      where: { isInternal: true },
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { 
        ticket: {
          select: { subject: true, id: true }
        }
      }
    });
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAiSettings = async (req, res) => {
  try {
    let settings = await prisma.globalAiSettings.findUnique({
      where: { id: "global" }
    });

    if (!settings) {
      settings = await prisma.globalAiSettings.create({
        data: { id: "global" }
      });
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateAiSettings = async (req, res) => {
  try {
    const settings = await prisma.globalAiSettings.upsert({
      where: { id: "global" },
      update: req.body,
      create: { id: "global", ...req.body }
    });
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.testVoicePreview = async (req, res) => {
  try {
    const { text, voiceId, stability, similarity } = req.body;
    console.log(`[AI_LAB] Voice Preview Request: ${voiceId} (S:${stability}, Sm:${similarity})`);
    
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      data: {
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability, similarity_boost: similarity }
      },
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    response.data.pipe(res);
  } catch (error) {
    console.error("[AI_LAB] Voice Preview Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.testAiChat = async (req, res) => {
  try {
    const { message } = req.body;
    console.log(`[AI_LAB] Chat Sandbox Request: "${message.substring(0, 20)}..."`);
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Switching to a more widely available model
      messages: [{ role: "user", content: message }]
    });
    res.json({ success: true, data: completion.choices[0].message.content });
  } catch (error) {
    console.error("[AI_LAB] Chat Sandbox Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAiSessionToken = async (req, res) => {
  try {
    const settings = await prisma.globalAiSettings.findUnique({ where: { id: "global" } });
    const agentId = (settings?.apptVoiceId && settings.apptVoiceId.startsWith("agent_")) 
      ? settings.apptVoiceId 
      : "agent_5501kqtn1qjxe5nvyc9x6zyn8w8g";

    const tokenRes = await axios({
      method: 'get',
      url: `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });

    res.json({ success: true, signedUrl: tokenRes.data.signed_url, agentId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
