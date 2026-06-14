"use client";

import React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

const errors = [
  {
    id: 1,
    service: "OpenAI API",
    message: "Rate limit exceeded (429) during batch prompt generation",
    severity: "critical",
    status: "active",
    time: "10 mins ago"
  },
  {
    id: 2,
    service: "Twilio Service",
    message: "Failed call webhook connection timeout (10000ms limit reached)",
    severity: "warning",
    status: "active",
    time: "32 mins ago"
  },
  {
    id: 3,
    service: "PostgreSQL DB",
    message: "Supabase connection pool exhausted (32 poolers blocked)",
    severity: "critical",
    status: "resolved",
    time: "2 hrs ago"
  },
  {
    id: 4,
    service: "Railway Deployment",
    message: "Build failed: Out of memory during package bundling stage",
    severity: "critical",
    status: "resolved",
    time: "4 hrs ago"
  }
];

export default function ErrorList() {
  const getSeverityStyle = (sev: string) => {
    return sev === "critical" 
      ? "text-rose-400 bg-rose-500/10 border-rose-500/20" 
      : "text-amber-400 bg-amber-500/10 border-amber-500/20";
  };

  return (
    <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1">
      {errors.map((err) => {
        const isResolved = err.status === "resolved";
        return (
          <div 
            key={err.id} 
            className={`p-3 bg-slate-950/40 border rounded-lg flex gap-3 items-start hover:border-slate-800 transition-colors ${
              isResolved ? "border-white/5 opacity-60" : "border-rose-500/15"
            }`}
          >
            {isResolved ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : err.severity === "critical" ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-grow">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold font-orbitron text-slate-300">
                  {err.service}
                </span>
                <span className="text-[9px] text-slate-500 font-semibold font-orbitron">
                  {err.time.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">{err.message}</p>
              
              <div className="flex gap-2 items-center mt-2">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${getSeverityStyle(err.severity)}`}>
                  {err.severity.toUpperCase()}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                  isResolved ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                }`}>
                  {err.status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
