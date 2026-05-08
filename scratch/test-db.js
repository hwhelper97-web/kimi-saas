const { Client } = require('pg');
require('dotenv').config();

async function test() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  try {
    console.log("Connecting to:", process.env.DATABASE_URL.replace(/:[^@]+@/, ":****@"));
    await client.connect();
    console.log("Connected successfully!");
    const res = await client.query('SELECT NOW()');
    console.log("Time from DB:", res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("Connection failed:", err.message);
    process.exit(1);
  }
}

test();
