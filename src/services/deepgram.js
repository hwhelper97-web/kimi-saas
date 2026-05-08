const WebSocket = require("ws");

function createDeepgram() {
  const ws = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=nova-2-phonecall&encoding=mulaw&sample_rate=8000&endpointing=500&smart_format=true&detect_language=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  return ws;
}

module.exports = { createDeepgram };