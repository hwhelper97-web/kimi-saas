const axios = require('axios');

async function testProcess() {
  try {
    const response = await axios.post('http://localhost:5000/api/call/process', {
      To: '+14782888237',
      From: '+15551234567',
      CallSid: 'CA_test_sid',
      SpeechResult: 'I want a burger'
    });
    console.log('Status:', response.status);
    console.log('Body:', response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testProcess();
