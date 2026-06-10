const aiService = require("../../services/ai-copilot.service");
const prisma = require("../../config/prisma");

exports.getSuggestion = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Get last 10 messages for context
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    const suggestion = await aiService.suggestReply(messages.reverse());
    return res.json({ success: true, suggestion });
  } catch (error) {
    return res.status(500).json({ error: "AI Suggestion failed" });
  }
};

exports.analyzeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const analysis = await aiService.analyzeTicket(ticket);
    return res.json({ success: true, analysis });
  } catch (error) {
    return res.status(500).json({ error: "AI Analysis failed" });
  }
};
