const fs = require('fs');
const path = require('path');

function getOpenAIKey() {
  const configPath = path.join(__dirname, "../config/platform.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.openaiKey) return config.openaiKey;
    } catch (e) {}
  }
  return process.env.OPENAI_API_KEY;
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

module.exports = { getOpenAIKey, postJson };
