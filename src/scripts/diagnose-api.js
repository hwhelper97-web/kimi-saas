const fs = require('fs');

async function testAnalytics() {
  try {
    // Node 18+ has native fetch
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'root@naxton.ai', password: 'password123' })
    });
    const loginData = await loginRes.json();
    if (!loginData.success) {
      fs.writeFileSync('f:/kimi-saas-clean/analytics_test_log.json', JSON.stringify({ error: "Login failed", data: loginData }, null, 2));
      return;
    }
    const token = loginData.token;

    const res = await fetch('http://localhost:5000/api/superadmin/analytics', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    fs.writeFileSync('f:/kimi-saas-clean/analytics_test_log.json', JSON.stringify(data, null, 2));
  } catch (e) {
    fs.writeFileSync('f:/kimi-saas-clean/analytics_test_log.json', JSON.stringify({ error: e.message, stack: e.stack }, null, 2));
  }
}

testAnalytics();
