require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function checkDetails() {
  const messages = await client.messages.list({ limit: 5 });
  for (const m of messages) {
    const details = await client.messages(m.sid).fetch();
    console.log(`SID: ${m.sid} | To: ${m.to} | Status: ${m.status} | ErrorCode: ${details.errorCode}`);
    console.log(`ErrorMsg: ${details.errorMessage}`);
    console.log('---');
  }
}
checkDetails().catch(console.error).finally(() => process.exit(0));
