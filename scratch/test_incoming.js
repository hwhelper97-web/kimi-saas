const axios = require('axios');

async function testIncoming() {
  try {
    const response = await axios.post('http://localhost:5000/api/call/incoming', {
      To: '+14782888237',
      From: '+15551234567',
      CallSid: 'CA' + Math.random().toString(36).substring(7)
    });
    console.log('Status:', response.status);
    console.log('Body:', response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testIncoming();
