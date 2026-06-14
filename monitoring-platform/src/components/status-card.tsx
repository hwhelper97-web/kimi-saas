"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  title: string;
  status: string; // online, warning, offline
  icon: LucideIcon;
  latency: string;
  healthPct: number;
}

export default function StatusCard({ title, status, icon: Icon, latency, healthPct }: StatusCardProps) {
  const getStatusColor = () => {
    switch (status) {
      case "online":
        return {
          text: "text-emerald-400",
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
          dot: "bg-emerald-400",
          shadow: "shadow-emerald-500/20"
        };
      case "warning":
        return {
          text: "text-amber-400",
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
          dot: "bg-amber-400",
          shadow: "shadow-amber-500/20"
        };
      default:
        return {
          text: "text-rose-400",
          bg: "bg-rose-500/10",
          border: "border-rose-500/20",
          dot: "bg-rose-400",
          shadow: "shadow-rose-500/20"
        };
    }
  };

  const colors = getStatusColor();

  return (
    <div className={`p-4 rounded-xl glass-panel flex flex-col justify-between h-32 transition-all duration-300 relative overflow-hidden`}>
      {/* Top Section: Icon & Pulse Indicator */}
      <div className="flex justify-between items-start">
        <div className={`p-2 rounded-lg bg-white/5 border border-white/5`}>
          <Icon className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]`} />
          <span className={`text-[9px] font-bold font-orbitron tracking-wider ${colors.text} uppercase`}>
            {status}
          </span>
        </div>
      </div>

      {/* Middle Section: Title & Latency */}
      <div className="mt-4">
        <span className="text-[9px] font-bold tracking-widest text-slate-500 font-orbitron block">
          {title}
        </span>
        <div className="flex justify-between items-end mt-1">
          <span className="text-sm font-semibold text-slate-200">
            {latency}
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            Health: {healthPct}%
          </span>
        </div>
      </div>
    </div>
  );
}
