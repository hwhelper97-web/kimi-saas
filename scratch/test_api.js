const axios = require('axios');

async function test() {
  try {
    // Note: This needs a valid token. I'll use a mock if possible or just check the logic.
    // Since I'm on the same machine, I'll just check if the port is open and then I'll use a direct controller call in a script.
    console.log("Simulating controller call...");
    const { listCategories } = require('../src/modules/menu/menu.controller');
    
    // Mock req/res
    const req = {
      query: { businessId: 'abb4f23e-03cd-41c7-b1eb-56e98d969877' },
      user: { role: 'SUPERADMIN' }
    };
    const res = {
      status: function(s) { this.statusCode = s; return this; },
      json: function(j) { console.log("Response:", j); return this; }
    };
    
    await listCategories(req, res);
  } catch (err) {
    console.error("Test error:", err);
  }
}

test();
