const WebSocket = require("ws");

function createDeepgram() {
  const ws = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  return ws;
}

module.exports = { createDeepgram };