const { getOpenAIKey } = require("./openai-utils");

class AICopilotService {
  /**
   * SUGGEST REPLY
   * Analyzes conversation history and suggests a high-quality response.
   */
  async suggestReply(messages, context = {}) {
    try {
      const apiKey = this._getApiKey();
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an expert SaaS support copilot for Naxton AI.
Your goal is to suggest a professional, helpful, and concise reply to a customer inquiry.
Guidelines:
- Tone: Empathetic, expert, and efficient.
- Use the provided context (Tenant Plan, Knowledge Articles).
- Keep it under 50 words.
- If it's a technical issue, suggest troubleshooting steps.
- If it's a billing issue, suggest checking the billing dashboard.`
            },
            ...messages.map(m => ({ 
              role: m.senderType === 'AGENT' ? 'assistant' : 'user', 
              content: m.body || m.content 
            }))
          ],
          temperature: 0.7,
        }),
      });

      const data = await res.json();
      return data.choices[0].message.content.trim();
    } catch (e) {
      console.error("[AI Copilot] Suggest Reply Error:", e);
      return "How can I help you further with this issue?";
    }
  }

  /**
   * ANALYZE TICKET
   * Extracts sentiment, urgency, and category.
   */
  async analyzeTicket(ticketData) {
    try {
      const apiKey = this._getApiKey();
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Analyze this support ticket and return JSON:
{
  "sentiment": "HAPPY | NEUTRAL | FRUSTRATED | ANGRY",
  "urgency": "LOW | MEDIUM | HIGH | CRITICAL",
  "category": "TECHNICAL | BILLING | FEATURE_REQUEST | ACCOUNT",
  "summary": "1-sentence summary",
  "recommended_action": "What should the agent do first?"
}`
            },
            { role: "user", content: `Subject: ${ticketData.subject}\nDescription: ${ticketData.description}` }
          ]
        })
      });

      const data = await res.json();
      return JSON.parse(data.choices[0].message.content);
    } catch (e) {
      return { sentiment: "NEUTRAL", urgency: "MEDIUM", summary: "Analysis failed" };
    }
  }

  _getApiKey() {
    return getOpenAIKey();
  }
}

module.exports = new AICopilotService();
