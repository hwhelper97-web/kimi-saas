"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";

const data = [
  { time: "14:00", cpu: 12, memory: 40, latency: 15 },
  { time: "14:05", cpu: 18, memory: 42, latency: 25 },
  { time: "14:10", cpu: 15, memory: 40, latency: 18 },
  { time: "14:15", cpu: 28, memory: 45, latency: 32 },
  { time: "14:20", cpu: 22, memory: 44, latency: 20 },
  { time: "14:25", cpu: 14, memory: 41, latency: 22 },
  { time: "14:30", cpu: 19, memory: 40, latency: 28 }
];

export default function RealTimeChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
        <XAxis 
          dataKey="time" 
          stroke="#475569" 
          fontSize={10} 
          tickLine={false} 
        />
        <YAxis 
          stroke="#475569" 
          fontSize={10} 
          tickLine={false} 
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#090d16",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            color: "#f1f5f9"
          }}
          labelStyle={{ color: "#94a3b8", fontSize: "10px", fontWeight: "bold" }}
        />
        <Area 
          type="monotone" 
          dataKey="cpu" 
          stroke="#22d3ee" 
          fillOpacity={1} 
          fill="url(#colorCpu)" 
          strokeWidth={1.5}
          name="CPU Load (%)"
        />
        <Area 
          type="monotone" 
          dataKey="latency" 
          stroke="#2563eb" 
          fillOpacity={1} 
          fill="url(#colorLatency)" 
          strokeWidth={1.5}
          name="DB Latency (ms)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
