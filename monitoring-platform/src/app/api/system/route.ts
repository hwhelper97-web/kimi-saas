import { NextResponse } from "next/server";
import os from "os";
import prisma from "@/lib/db";

export async function GET() {
  try {
    // 1. Calculate CPU Usage (average load)
    const cpus = os.cpus();
    const loadAverage = os.loadavg();
    const cpuUsage = loadAverage[0] * 10; // Normalized estimate percentage

    // 2. Calculate Memory Usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercentage = (usedMem / totalMem) * 100;

    // 3. Measure Database Latency
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;

    const systemTelemetry = {
      cpu: {
        usage: parseFloat(cpuUsage.toFixed(2)),
        cores: cpus.length,
        loadAverage
      },
      memory: {
        totalGb: parseFloat((totalMem / 1024 / 1024 / 1024).toFixed(2)),
        usedGb: parseFloat((usedMem / 1024 / 1024 / 1024).toFixed(2)),
        percentage: parseFloat(memPercentage.toFixed(2))
      },
      network: {
        rxBytes: 10424590, // mock metrics representative of network streams
        txBytes: 42095034
      },
      database: {
        latencyMs: dbLatency,
        status: dbLatency < 500 ? "healthy" : "degraded"
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(systemTelemetry);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
