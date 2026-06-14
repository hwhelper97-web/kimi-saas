import Link from "next/link";

export default function PublicLandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-[#071329] to-slate-950 flex flex-col justify-between px-6 py-8 md:px-12 relative overflow-hidden">
      {/* Decorative Grid Mesh & Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.02)_0%,transparent_70%)] pointer-events-none" />
      
      {/* Header */}
      <header className="flex justify-between items-center w-full max-w-7xl mx-auto z-10">
        <div className="flex flex-col">
          <span className="font-orbitron font-extrabold text-lg tracking-[3px] text-cyan-400 glow-text-cyan">NAXTON</span>
          <span className="text-[8px] font-bold tracking-[2px] text-cyan-500 uppercase">Technologies</span>
        </div>
        <Link href="/admin" className="px-5 py-2 text-xs font-semibold font-orbitron tracking-widest text-cyan-400 bg-cyan-950/20 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 hover:border-cyan-400 transition-all duration-300">
          MONITOR
        </Link>
      </header>

      {/* Hero Body */}
      <div className="flex-grow flex flex-col items-center justify-center text-center max-w-4xl mx-auto z-10 py-16">
        <span className="px-3 py-1 text-[10px] font-bold font-orbitron tracking-[3px] text-cyan-400 bg-cyan-950/40 border border-cyan-500/25 rounded-full mb-6 uppercase">
          AI & Enterprise SaaS Platforms
        </span>
        <h1 className="text-4xl md:text-7xl font-extrabold font-orbitron tracking-tight text-white mb-6 leading-tight">
          Engineering the <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400">
            Next Generation
          </span>
        </h1>
        <p className="text-sm md:text-lg text-slate-400 max-w-2xl mb-10 leading-relaxed">
          Building hyper-scalable AI agent platforms, real-time voice bridges, and custom enterprise SaaS solutions for global markets.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-md">
          <Link href="/app" className="px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold font-orbitron text-xs tracking-widest rounded-lg shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20 transition-all duration-300">
            ACCESS SAAS PLATFORM
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center z-10 border-t border-white/5 pt-8 text-[10px] font-medium text-slate-500 tracking-wider">
        <span>&copy; {new Date().getFullYear()} NAXTON TECHNOLOGIES. ALL RIGHTS RESERVED.</span>
        <div className="flex gap-6 mt-4 md:mt-0">
          <Link href="/privacy" className="hover:text-cyan-400 transition-colors">PRIVACY POLICY</Link>
          <Link href="/terms" className="hover:text-cyan-400 transition-colors">TERMS OF SERVICE</Link>
        </div>
      </footer>
    </main>
  );
}
