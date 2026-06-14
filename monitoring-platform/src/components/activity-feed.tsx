"use client";

import React from "react";
import { LogIn, GitBranch, Database, ShieldAlert, PhoneCall } from "lucide-react";

const activities = [
  {
    id: 1,
    action: "USER_LOGIN",
    detail: "Founder logged in from Chrome (iOS, Seattle)",
    actor: "owner@naxtontechnologies.com",
    time: "2 mins ago",
    icon: LogIn,
    color: "text-cyan-400 bg-cyan-500/10"
  },
  {
    id: 2,
    action: "DEPLOYMENT_SUCCESS",
    detail: "Railway build #235 deployed to production successfully",
    actor: "DevOps Pipeline",
    time: "15 mins ago",
    icon: GitBranch,
    color: "text-emerald-400 bg-emerald-500/10"
  },
  {
    id: 3,
    action: "DB_BACKUP_COMPLETED",
    detail: "PostgreSQL daily snapshots backup completed successfully",
    actor: "Backup Job",
    time: "1 hr ago",
    icon: Database,
    color: "text-blue-400 bg-blue-500/10"
  },
  {
    id: 4,
    action: "AI_SESSION_INITIATED",
    detail: "ElevenLabs voice bridge session established for Call SID: CA48e3...",
    actor: "Twilio Router",
    time: "2 hrs ago",
    icon: PhoneCall,
    color: "text-purple-400 bg-purple-500/10"
  },
  {
    id: 5,
    action: "API_LATENCY_WARN",
    detail: "OpenAI prompt latency exceeded 500ms benchmark limit",
    actor: "Telemetry Monitor",
    time: "3 hrs ago",
    icon: ShieldAlert,
    color: "text-amber-400 bg-amber-500/10"
  }
];

export default function ActivityFeed() {
  return (
    <div className="flex flex-col gap-4 max-h-[340px] overflow-y-auto pr-1">
      {activities.map((act) => {
        const Icon = act.icon;
        return (
          <div key={act.id} className="flex gap-4 items-start p-3 bg-slate-950/40 border border-white/5 rounded-lg hover:border-white/10 transition-colors">
            <div className={`p-2 rounded-lg shrink-0 ${act.color}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-grow flex flex-col justify-between md:flex-row md:items-center">
              <div>
                <span className="text-[9px] font-bold font-orbitron tracking-wider text-cyan-500 block">
                  {act.action}
                </span>
                <p className="text-xs text-slate-300 mt-0.5">{act.detail}</p>
                <span className="text-[10px] text-slate-500 block mt-1">{act.actor}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold md:shrink-0 mt-2 md:mt-0 font-orbitron uppercase">
                {act.time}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
