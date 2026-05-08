require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function checkMessages() {
  console.log('--- RECENT MESSAGES ---');
  const messages = await client.messages.list({ limit: 10 });
  messages.forEach(m => {
    console.log(`To: ${m.to} | Status: ${m.status} | SID: ${m.sid}`);
    if (m.errorMessage) console.log(`Error: ${m.errorMessage} (Code: ${m.errorCode})`);
    console.log(`Body: ${m.body}`);
    console.log('---');
  });
}
checkMessages().catch(console.error).finally(() => process.exit(0));
