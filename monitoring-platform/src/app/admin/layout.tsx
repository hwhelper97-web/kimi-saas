"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Activity, 
  BarChart3, 
  Cpu, 
  BrainCircuit, 
  FileCode, 
  Settings, 
  Menu, 
  X, 
  Bell, 
  Search, 
  User 
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { name: "Monitoring", href: "/admin/monitoring", icon: Activity },
    { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { name: "AI Services", href: "/admin/ai-services", icon: BrainCircuit },
    { name: "Infrastructure", href: "/admin/infrastructure", icon: Cpu },
    { name: "Logs", href: "/admin/logs", icon: FileCode },
    { name: "Settings", href: "/admin/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col font-sans text-slate-200">
      
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 glass-panel border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        
        {/* Left Section: Mobile Menu Trigger + Logo */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="xl:hidden p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <Menu className="w-5 h-5 text-slate-300" />
          </button>
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="font-orbitron font-extrabold text-sm tracking-[3px] text-cyan-400 glow-text-cyan">NAXTON</span>
              <span className="text-[7px] font-bold tracking-[2.5px] text-cyan-500 uppercase">Monitor</span>
            </div>
          </Link>
        </div>

        {/* Center Section: Search Bar */}
        <div className="hidden md:flex items-center gap-2 max-w-md w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/5 focus-within:border-cyan-500/50 transition-colors">
          <Search className="w-4 h-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search system resources, logs, deployments..." 
            className="w-full bg-transparent border-none outline-none text-xs text-slate-300 placeholder-slate-500"
          />
        </div>

        {/* Right Section: Notifications + Profile */}
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
            <Bell className="w-4 h-4 text-slate-300" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/35 flex items-center justify-center text-cyan-400 font-bold font-orbitron text-xs">
            N
          </div>
        </div>
      </header>

      <div className="flex-grow flex">
        
        {/* Desktop Sidebar */}
        <aside className="hidden xl:flex flex-col w-64 border-r border-white/5 bg-slate-950/40 p-4 shrink-0">
          <nav className="flex flex-col gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold tracking-wider transition-all duration-200 ${
                    isActive 
                      ? "bg-gradient-to-r from-cyan-950/50 to-blue-950/20 border border-cyan-500/20 text-cyan-400"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                  <span>{item.name.toUpperCase()}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex xl:hidden">
            {/* Backdrop */}
            <div 
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            {/* Drawer */}
            <div className="fixed top-0 bottom-0 left-0 w-72 max-w-full bg-[#020617] border-r border-white/10 p-6 flex flex-col z-50 shadow-2xl animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col">
                  <span className="font-orbitron font-extrabold text-sm tracking-[3px] text-cyan-400">NAXTON</span>
                  <span className="text-[7px] font-bold tracking-[2px] text-cyan-500 uppercase">Monitor</span>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                        isActive 
                          ? "bg-cyan-950/30 border border-cyan-500/30 text-cyan-400"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name.toUpperCase()}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Main Work Area */}
        <main className="flex-grow p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
