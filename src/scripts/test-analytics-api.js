const fetch = require('node-fetch');

async function testAnalytics() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@nextech.com', password: 'adminpassword123' }) // Assuming these creds from earlier context
  });
  const loginData = await loginRes.json();
  if (!loginData.success) {
    console.log("Login failed", loginData);
    return;
  }
  const token = loginData.token;

  const res = await fetch('http://localhost:5000/api/superadmin/analytics', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testAnalytics().catch(console.error);
