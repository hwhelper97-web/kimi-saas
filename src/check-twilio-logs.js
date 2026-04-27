require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function checkLogs() {
  const logs = await client.monitor.v1.alerts.list({ limit: 10 });
  console.log('--- TWILIO DEBUGGER LOGS ---');
  logs.forEach(log => {
    console.log(`Date: ${log.dateCreated} | Code: ${log.errorCode} | URL: ${log.requestUrl}`);
    console.log(`Description: ${log.alertText}`);
    console.log('---');
  });
}
checkLogs().catch(console.error).finally(() => process.exit(0));
