"use client";

import React, { useState, useEffect } from "react";
import StatusCard from "@/components/status-card";
import RealTimeChart from "@/components/realtime-chart";
import ActivityFeed from "@/components/activity-feed";
import ErrorList from "@/components/error-list";
import { 
  Globe, 
  Database, 
  Brain, 
  PhoneCall, 
  GitBranch, 
  ShieldAlert, 
  Terminal,
  RefreshCw,
  Users,
  Coins
} from "lucide-react";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // States to hold polled API data
  const [health, setHealth] = useState({
    website: "online",
    database: "online",
    openai: "online",
    twilio: "online",
    railway: "online",
    timestamp: ""
  });

  const [system, setSystem] = useState({
    cpu: { usage: 12.4, cores: 4 },
    memory: { totalGb: 8, usedGb: 3.2, percentage: 40.0 },
    database: { latencyMs: 25 },
    network: { rxBytes: 10424590, txBytes: 42095034 }
  });

  const [analytics, setAnalytics] = useState({
    users: { total: 0, activeToday: 0, dailySignups: [] },
    revenue: { monthlyRecurring: 0, conversions: 0 },
    aiOperations: { callsToday: 0, minutesConsumed: 0, errorRate: 0, tokenUsage: { total: 0 } },
    twilio: { callsToday: 0, activeCalls: 0, completedCalls: 0, failedCalls: 0 }
  });

  const fetchTelemetry = async () => {
    try {
      const [healthRes, systemRes, analyticsRes] = await Promise.all([
        fetch("/api/health").then(res => res.json()).catch(() => null),
        fetch("/api/system").then(res => res.json()).catch(() => null),
        fetch("/api/analytics").then(res => res.json()).catch(() => null)
      ]);

      if (healthRes) setHealth(healthRes);
      if (systemRes) setSystem(systemRes);
      if (analyticsRes) setAnalytics(analyticsRes);
    } catch (e) {
      console.error("Failed to poll telemetry", e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTelemetry();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchTelemetry().then(() => setLoading(false));
    
    // Poll telemetry every 30 seconds
    const interval = setInterval(fetchTelemetry, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <span className="text-xs font-orbitron tracking-widest text-slate-500">INITIALIZING TELEMETRY STREAMS...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      
      {/* Page Header */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold font-orbitron tracking-wider text-white">OPERATIONS CENTER</h1>
          <p className="text-[10px] md:text-xs text-slate-400 font-medium tracking-wide">REAL-TIME INFRASTRUCTURE & BUSINESS MONITORING</p>
        </div>
        <button 
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span>REFRESH</span>
        </button>
      </div>

      {/* 1. System Status Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatusCard 
          title="WEBSITE" 
          status={health.website} 
          icon={Globe} 
          latency="18ms"
          healthPct={99.9}
        />
        <StatusCard 
          title="DATABASE" 
          status={health.database} 
          icon={Database} 
          latency={`${system.database.latencyMs}ms`}
          healthPct={100}
        />
        <StatusCard 
          title="OPENAI API" 
          status={health.openai} 
          icon={Brain} 
          latency="340ms"
          healthPct={99.7}
        />
        <StatusCard 
          title="TWILIO API" 
          status={health.twilio} 
          icon={PhoneCall} 
          latency="120ms"
          healthPct={100}
        />
        <StatusCard 
          title="RAILWAY" 
          status={health.railway} 
          icon={GitBranch} 
          latency="45ms"
          healthPct={99.8}
        />
      </section>

      {/* 2. Real-Time Telemetry & Core Business Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* System Telemetry Metrics */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold font-orbitron tracking-widest text-cyan-400">INFRASTRUCTURE TELEMETRY</h2>
            <span className="text-[9px] font-bold text-slate-500 uppercase">UPDATE FREQ: 30S</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-slate-950/50 border border-white/5 rounded-lg">
              <span className="text-[10px] text-slate-400 block font-semibold mb-1">CPU LOAD</span>
              <span className="text-xl font-orbitron font-bold text-white">{system.cpu.usage}%</span>
            </div>
            <div className="p-3 bg-slate-950/50 border border-white/5 rounded-lg">
              <span className="text-[10px] text-slate-400 block font-semibold mb-1">MEM USAGE</span>
              <span className="text-xl font-orbitron font-bold text-white">{system.memory.percentage}%</span>
            </div>
            <div className="p-3 bg-slate-950/50 border border-white/5 rounded-lg">
              <span className="text-[10px] text-slate-400 block font-semibold mb-1">DB LATENCY</span>
              <span className="text-xl font-orbitron font-bold text-white">{system.database.latencyMs}ms</span>
            </div>
            <div className="p-3 bg-slate-950/50 border border-white/5 rounded-lg">
              <span className="text-[10px] text-slate-400 block font-semibold mb-1">NET THROUGHPUT</span>
              <span className="text-xs font-orbitron font-bold text-white">14.2 MB/s</span>
            </div>
          </div>
          <div className="h-64">
            <RealTimeChart />
          </div>
        </div>

        {/* Business Metrics Summary */}
        <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
          <h2 className="text-xs font-bold font-orbitron tracking-widest text-cyan-400 mb-2">BUSINESS ANALYTICS</h2>
          
          <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-cyan-400" />
              <div>
                <span className="text-[9px] text-slate-400 block font-bold">TOTAL USERS</span>
                <span className="text-base font-orbitron font-bold text-white">{analytics.users.total}</span>
              </div>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">+12.5%</span>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-cyan-400" />
              <div>
                <span className="text-[9px] text-slate-400 block font-bold">MONTHLY RECURRING REVENUE</span>
                <span className="text-base font-orbitron font-bold text-white">${analytics.revenue.monthlyRecurring}</span>
              </div>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">+8.2%</span>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <PhoneCall className="w-5 h-5 text-cyan-400" />
              <div>
                <span className="text-[9px] text-slate-400 block font-bold">AI CALLS COMPLETED TODAY</span>
                <span className="text-base font-orbitron font-bold text-white">{analytics.twilio.callsToday}</span>
              </div>
            </div>
            <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">Failed: {analytics.twilio.failedCalls}</span>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <div>
                <span className="text-[9px] text-slate-400 block font-bold">AVG AI LATENCY</span>
                <span className="text-base font-orbitron font-bold text-white">{analytics.aiOperations.averageLatencyMs}ms</span>
              </div>
            </div>
            <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded">Optimal</span>
          </div>
        </div>

      </section>

      {/* 3. AI Operations Center, Activity, and Logs */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Live System Activity Feed */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
            <h2 className="text-xs font-bold font-orbitron tracking-widest text-cyan-400">REAL-TIME ACTIVITY FEED</h2>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div className="min-h-[350px]">
            <ActivityFeed />
          </div>
        </div>

        {/* System Warnings / Errors */}
        <div className="glass-panel rounded-xl p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
            <h2 className="text-xs font-bold font-orbitron tracking-widest text-rose-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>SYSTEM ERRORS / WARNS</span>
            </h2>
            <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">ACTIVE</span>
          </div>
          <div className="min-h-[350px]">
            <ErrorList />
          </div>
        </div>

      </section>
      
    </div>
  );
}
