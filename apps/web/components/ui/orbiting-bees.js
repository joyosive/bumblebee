"use client";
import React, { useEffect, useState, memo } from "react";
import { MessageSquare, ClipboardCheck, Wallet, ShieldCheck, Star } from "lucide-react";

// ── Bee Configurations ──────────────────────────────────────────────
const BEES = [
  {
    id: "facilitator",
    label: "Facilitator",
    role: "Campaign Intake",
    icon: MessageSquare,
    color: "#a78bfa",
    borderClass: "border-violet-400/40",
    bgClass: "bg-violet-400/10",
    textClass: "text-violet-400",
    orbitRadius: 130,
    size: 48,
    speed: 0.7,
    phaseShift: 0,
  },
  {
    id: "evaluator",
    label: "Evaluator",
    role: "Due Diligence",
    icon: ClipboardCheck,
    color: "#f97316",
    borderClass: "border-orange-400/40",
    bgClass: "bg-orange-400/10",
    textClass: "text-orange-400",
    orbitRadius: 130,
    size: 48,
    speed: 0.7,
    phaseShift: (2 * Math.PI) / 5,
  },
  {
    id: "treasury",
    label: "Treasury",
    role: "Escrow & Funds",
    icon: Wallet,
    color: "#eab308",
    borderClass: "border-yellow-400/40",
    bgClass: "bg-yellow-400/10",
    textClass: "text-yellow-400",
    orbitRadius: 130,
    size: 48,
    speed: 0.7,
    phaseShift: (4 * Math.PI) / 5,
  },
  {
    id: "verifier",
    label: "Verifier",
    role: "Evidence Review",
    icon: ShieldCheck,
    color: "#34d399",
    borderClass: "border-emerald-400/40",
    bgClass: "bg-emerald-400/10",
    textClass: "text-emerald-400",
    orbitRadius: 130,
    size: 48,
    speed: 0.7,
    phaseShift: (6 * Math.PI) / 5,
  },
  {
    id: "reviewer",
    label: "Reviewer",
    role: "Trust Scoring",
    icon: Star,
    color: "#fb7185",
    borderClass: "border-rose-400/40",
    bgClass: "bg-rose-400/10",
    textClass: "text-rose-400",
    orbitRadius: 130,
    size: 48,
    speed: 0.7,
    phaseShift: (8 * Math.PI) / 5,
  },
];

// ── Orbiting Bee Node ───────────────────────────────────────────────
const OrbitingBee = memo(function OrbitingBee({ bee, angle, isActive }) {
  const [isHovered, setIsHovered] = useState(false);
  const { orbitRadius, size, color } = bee;
  const Icon = bee.icon;

  const x = Math.cos(angle) * orbitRadius;
  const y = Math.sin(angle) * orbitRadius;

  const highlighted = isHovered || isActive;

  return (
    <div
      className="absolute top-1/2 left-1/2 transition-all duration-500 ease-out"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        transform: `translate(calc(${x}px - 50%), calc(${y}px - 50%))`,
        zIndex: highlighted ? 20 : 10,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`
          relative w-full h-full rounded-xl flex items-center justify-center
          transition-all duration-300 cursor-pointer border
          ${highlighted ? bee.borderClass : "border-border/30"}
          ${highlighted ? bee.bgClass : "bg-card"}
        `}
        style={{
          transform: highlighted ? "scale(1.12)" : "scale(1)",
          boxShadow: highlighted ? `0 0 20px ${color}25` : "none",
        }}
      >
        <Icon
          size={20}
          className={`transition-colors duration-300 ${highlighted ? bee.textClass : "text-foreground/25"}`}
          strokeWidth={2}
        />
        {highlighted && (
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-card border border-border rounded-lg text-center whitespace-nowrap pointer-events-none shadow-lg">
            <div className="text-[13px] font-bold" style={{ color }}>{bee.label}</div>
            <div className="text-[11px] text-foreground/50 font-medium">{bee.role}</div>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Orbit Ring ──────────────────────────────────────────────────────
const OrbitRing = memo(function OrbitRing({ radius }) {
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none border border-border/20"
      style={{ width: `${radius * 2}px`, height: `${radius * 2}px` }}
    />
  );
});

// ── Main Component ──────────────────────────────────────────────────
export default function OrbitingBees({ activeBee, size = 340 }) {
  const [time, setTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;

    let frameId;
    let last = performance.now();

    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => t + dt);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPaused]);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: `${size}px`, height: `${size}px` }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Orbit rings */}
      <OrbitRing radius={130} />
      <OrbitRing radius={80} />
      <OrbitRing radius={35} />

      {/* Sweeper arm */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ animation: "orbit 14s linear infinite" }}
      >
        <div
          className="absolute top-0 left-1/2 w-px h-1/2 origin-bottom"
          style={{
            background: "linear-gradient(to top, transparent 20%, hsl(40 95% 55% / 0.2) 60%, transparent 100%)",
          }}
        />
      </div>

      {/* Center beacon */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[5]">
        <div
          className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center"
          style={{ animation: "beacon 3s ease-in-out infinite" }}
        >
          <span className="text-2xl">🐝</span>
        </div>
      </div>

      {/* Orbiting bees */}
      {BEES.map((bee) => {
        const angle = time * bee.speed + bee.phaseShift;
        return (
          <OrbitingBee
            key={bee.id}
            bee={bee}
            angle={angle}
            isActive={activeBee === bee.id}
          />
        );
      })}
    </div>
  );
}

export { BEES };
