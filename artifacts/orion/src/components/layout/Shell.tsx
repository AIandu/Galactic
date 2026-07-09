import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";

// Creation timestamp — fixed at authorship date (UTC)
const CREATED_DATE = "09 JUL 2026";
const CREATED_TIME = "00:00:00Z";

// System designation
const SYSTEM_NAME  = "O.S.N.";
const SYSTEM_FULL  = "Orbital Surveillance Network";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navLinks = [
    { href: "/", label: "RADAR" },
    { href: "/conjunctions", label: "CONJUNCTIONS" },
    { href: "/catalog", label: "CATALOG" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden selection:bg-primary/30">
      <header className="h-16 border-b border-primary/30 bg-card/90 backdrop-blur-md flex items-center justify-between px-6 shrink-0 relative z-50">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group cursor-pointer">
            <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(0,240,255,1)] group-hover:scale-110 transition-transform" />
            <div className="flex flex-col leading-none">
              <h1 className="font-sans font-bold text-2xl tracking-[0.2em] text-primary drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]">
                {SYSTEM_NAME}
              </h1>
              <span className="text-[8px] tracking-[0.18em] text-primary/50 uppercase font-mono mt-0.5">
                {SYSTEM_FULL}
              </span>
            </div>
          </Link>
          <nav className="flex gap-2">
            {navLinks.map((link) => {
              const active = location === link.href;
              return (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  className={`px-5 py-2 text-xs font-bold tracking-[0.15em] transition-all duration-200 uppercase ${
                    active 
                      ? "bg-primary/10 text-primary border border-primary/50 shadow-[inset_0_0_15px_rgba(0,240,255,0.1)]" 
                      : "text-muted-foreground hover:text-primary hover:bg-primary/5 border border-transparent"
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-6 font-mono text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">Status</span>
            <span className="text-xs text-green-400 tracking-widest font-bold drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]">NOMINAL</span>
          </div>
          <div className="px-4 py-1.5 border border-primary/30 bg-primary/5 text-primary tracking-widest shadow-[inset_0_0_10px_rgba(0,240,255,0.05)]">
            UTC {time.toISOString().substring(11, 19)}
          </div>
        </div>
      </header>
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {children}
      </main>

      {/* Creator credit — bottom of every page */}
      <footer className="h-7 shrink-0 border-t border-primary/15 bg-black/60 backdrop-blur-sm flex items-center justify-center gap-0 pointer-events-none select-none z-50">
        <span className="font-mono text-[9px] tracking-[0.25em] text-primary/40 uppercase">
          Created by&nbsp;
        </span>
        <span className="font-mono text-[9px] tracking-[0.25em] text-primary/75 uppercase font-bold">
          Loretta Chapman
        </span>
        <span className="font-mono text-[9px] tracking-[0.25em] text-primary/30 uppercase">
          &nbsp;·&nbsp;{CREATED_DATE}&nbsp;·&nbsp;{CREATED_TIME}
        </span>
      </footer>
    </div>
  );
}