import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  const status = {
    website: "online",
    database: "offline",
    openai: "offline",
    twilio: "offline",
    railway: "offline",
    timestamp: new Date().toISOString()
  };

  // 1. Check Database
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;
    status.database = latency < 500 ? "online" : "warning";
  } catch (e) {
    status.database = "offline";
  }

  // 2. Check OpenAI
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    status.openai = res.status === 200 ? "online" : "warning";
  } catch (e) {
    status.openai = "offline";
  }

  // 3. Check Twilio
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    status.twilio = res.status === 200 ? "online" : "warning";
  } catch (e) {
    status.twilio = "offline";
  }

  // 4. Check Railway
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("https://backboard.railway.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RAILWAY_API_TOKEN}`
      },
      body: JSON.stringify({ query: "{ me { id } }" }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    status.railway = res.status === 200 ? "online" : "warning";
  } catch (e) {
    status.railway = "offline";
  }

  return NextResponse.json(status);
}
