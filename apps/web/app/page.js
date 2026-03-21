"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, ClipboardCheck, Wallet, ShieldCheck, Star,
  Activity, Zap, TrendingUp, Shield, ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OrbitingBees, { BEES } from "@/components/ui/orbiting-bees";

// ── Data ────────────────────────────────────────────────────────────

const BEE_ICONS = {
  facilitator: MessageSquare,
  evaluator: ClipboardCheck,
  treasury: Wallet,
  verifier: ShieldCheck,
  reviewer: Star,
};

const BEE_COLOR_MAP = {
  facilitator: { border: "border-violet-400/40", bg: "bg-violet-400/10", text: "text-violet-400", dot: "bg-violet-400" },
  evaluator: { border: "border-orange-400/40", bg: "bg-orange-400/10", text: "text-orange-400", dot: "bg-orange-400" },
  treasury: { border: "border-yellow-400/40", bg: "bg-yellow-400/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  verifier: { border: "border-emerald-400/40", bg: "bg-emerald-400/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  reviewer: { border: "border-rose-400/40", bg: "bg-rose-400/10", text: "text-rose-400", dot: "bg-rose-400" },
};

const DEMO_EVENTS = [
  { agent: "facilitator", msg: "Campaign received: Clean Ocean Initiative", time: "4:40 PM" },
  { agent: "evaluator", msg: "Approved — score 90/100, 3 milestones generated", time: "4:40 PM" },
  { agent: "treasury", msg: "3 escrows created on XRPL, M1 auto-released: 1.65 XRP", time: "4:40 PM" },
  { agent: "verifier", msg: "M2 evidence reviewed and approved", time: "4:42 PM" },
  { agent: "treasury", msg: "M2 escrow released: 1.65 XRP to NGO wallet", time: "4:42 PM" },
  { agent: "reviewer", msg: "Trust score: 85/100 — published via Oracle on-chain", time: "4:50 PM" },
  { agent: "facilitator", msg: "Campaign received: School Supplies Ethiopia", time: "3:46 PM" },
  { agent: "treasury", msg: "Funded: 3 XRP from pool, M1 auto-released", time: "3:46 PM" },
];

const DEMO_CAMPAIGNS = [
  {
    title: "School Supplies Ethiopia",
    ngo: "Luminos Fund",
    sector: "Education",
    country: "Ethiopia",
    goal: 3,
    status: "completed",
    score: 85,
    milestones: [
      { n: 1, title: "Procure materials", status: "completed", tx: "13239C284A75" },
      { n: 2, title: "Deliver program", status: "completed", tx: "5D44F35A4770" },
      { n: 3, title: "Report outcomes", status: "completed", tx: "C2622EA26517" },
    ],
  },
  {
    title: "Clean Ocean Initiative",
    ngo: "Defit",
    sector: "Environment",
    country: "US",
    goal: 5,
    status: "in_progress",
    score: null,
    milestones: [
      { n: 1, title: "Phase 1 setup", status: "completed", tx: "F2CFD9C17C8F" },
      { n: 2, title: "Phase 2 execution", status: "active", tx: null },
      { n: 3, title: "Phase 3 reporting", status: "pending", tx: null },
    ],
  },
];

// ── Animations ──────────────────────────────────────────────────────

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const slideIn = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
};

// ── Components ──────────────────────────────────────────────────────

function BeeStatusRow({ bee, isActive, latestEvent }) {
  const Icon = BEE_ICONS[bee.id];
  const colors = BEE_COLOR_MAP[bee.id];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
        isActive
          ? `${colors.border} ${colors.bg}`
          : "border-border/30 bg-transparent hover:bg-card"
      }`}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
          isActive ? `${colors.border} ${colors.bg}` : "border-border/40 bg-card"
        }`}
      >
        <Icon
          size={16}
          className={isActive ? colors.text : "text-foreground/30"}
          strokeWidth={2.5}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tracking-tight ${isActive ? colors.text : "text-foreground/50"}`}>
            {bee.label}
          </span>
          {isActive && (
            <Badge
              variant="outline"
              className={`rounded-full ${colors.border} ${colors.bg} px-2 py-0 text-[10px] font-bold uppercase tracking-[0.15em] ${colors.text}`}
            >
              Active
            </Badge>
          )}
        </div>
        <p className="text-xs text-foreground/40 truncate font-medium mt-0.5">
          {latestEvent || bee.role}
        </p>
      </div>
      {isActive && (
        <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
      )}
    </div>
  );
}

function EventRow({ evt }) {
  const Icon = BEE_ICONS[evt.agent];
  const colors = BEE_COLOR_MAP[evt.agent];

  return (
    <motion.div
      variants={slideIn}
      className="flex items-start gap-3 py-3 px-3 rounded-lg hover:bg-card/50 transition-colors"
    >
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${colors.border} ${colors.bg}`}
      >
        {Icon && <Icon size={13} className={colors.text} strokeWidth={2.5} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-[0.1em] ${colors.text}`}>
            {evt.agent}
          </span>
          <span className="text-xs text-foreground/30 font-medium">{evt.time}</span>
        </div>
        <p className="text-sm text-foreground/60 leading-relaxed font-medium">{evt.msg}</p>
      </div>
    </motion.div>
  );
}

function CampaignCard({ campaign }) {
  const completed = campaign.milestones.filter((m) => m.status === "completed").length;
  const pct = (completed / 3) * 100;

  return (
    <motion.div variants={fadeUp}>
      <Card className="p-5 bg-card/60 border-border/40 hover:border-border/60 transition-all duration-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="text-base font-bold text-foreground tracking-tight">{campaign.title}</h4>
            <p className="text-sm text-foreground/40 mt-1 font-medium">
              {campaign.ngo} &middot; {campaign.sector} &middot; {campaign.country}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {campaign.score && (
              <div className="flex items-center gap-1.5">
                <Shield size={14} className="text-emerald-400" />
                <span className="mono text-sm font-bold text-emerald-400">{campaign.score}</span>
              </div>
            )}
            <Badge
              variant="outline"
              className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${
                campaign.status === "completed"
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-400"
              }`}
            >
              {campaign.status.replace("_", " ")}
            </Badge>
          </div>
        </div>

        {/* Milestones */}
        <div className="flex items-center gap-3 mb-4">
          {campaign.milestones.map((m, idx) => (
            <div key={m.n} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold border ${
                  m.status === "completed"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                    : m.status === "active"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                    : "border-border/30 bg-card text-foreground/20"
                }`}
              >
                {m.status === "completed" ? "✓" : m.n}
              </div>
              {m.tx && (
                <a
                  href={`https://testnet.xrpl.org/transactions/${m.tx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[11px] text-foreground/30 hover:text-foreground/60 transition-colors flex items-center gap-1 font-medium"
                >
                  {m.tx.slice(0, 6)}
                  <ExternalLink size={10} />
                </a>
              )}
              {idx < 2 && <ArrowRight size={12} className="text-foreground/15" />}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-amber-400"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="mono text-xs text-foreground/40 font-semibold">{campaign.goal} XRP</span>
        </div>
      </Card>
    </motion.div>
  );
}

function StatCard({ label, value, unit, icon: Icon, colorClass }) {
  return (
    <Card className="p-4 bg-card/60 border-border/40">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={colorClass} />
        <span className="text-xs text-foreground/40 uppercase tracking-[0.15em] font-bold">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-extrabold tracking-tight ${colorClass}`}>{value}</span>
        <span className="text-sm text-foreground/30 font-semibold">{unit}</span>
      </div>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [activeBee, setActiveBee] = useState(null);
  const [events, setEvents] = useState(DEMO_EVENTS);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      setActiveBee(BEES[i % BEES.length].id);
      i++;
    }, 2800);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket("ws://localhost:3001");
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (msg) => {
        try {
          const d = JSON.parse(msg.data);
          setEvents((prev) => [
            {
              agent: d.agent,
              msg: d.message,
              time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            },
            ...prev.slice(0, 24),
          ]);
          if (d.agent) setActiveBee(d.agent);
        } catch {}
      };
    } catch {}
    return () => ws?.close();
  }, []);

  const latestByBee = {};
  events.forEach((evt) => {
    if (!latestByBee[evt.agent]) latestByBee[evt.agent] = evt.msg;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="border-b border-border/50 bg-card/30">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between px-6 lg:px-8 h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
              <span className="text-lg">🐝</span>
            </div>
            <div>
              <h1 className="text-base font-extrabold text-foreground tracking-tight">BumbleBee</h1>
              <p className="text-[11px] text-foreground/40 tracking-[0.2em] uppercase font-bold">Impact Monitor</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="text-sm text-foreground/50 font-semibold">{wsConnected ? "Live" : "Demo"}</span>
            </div>

            <Badge
              variant="outline"
              className="rounded-full border-border/50 bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-foreground/50"
            >
              XRPL Testnet
            </Badge>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/50">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="mono text-sm text-foreground/60 font-semibold">rK4x...7mQ2</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────── */}
      <div className="max-w-[1440px] mx-auto px-6 lg:px-8 py-6">

        {/* ── Stats Row ────────────────────────────────── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
        >
          <motion.div variants={fadeUp}>
            <StatCard label="Pool Balance" value="195.9" unit="XRP" icon={Wallet} colorClass="text-yellow-400" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Allocated" value="8.0" unit="XRP" icon={Zap} colorClass="text-orange-400" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Campaigns" value="2" unit="active" icon={TrendingUp} colorClass="text-emerald-400" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Trust Avg" value="85" unit="/100" icon={Shield} colorClass="text-rose-400" />
          </motion.div>
        </motion.div>

        {/* ── Bee Operations + Activity ────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">

          {/* Bee Operations — THE HERO */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="lg:col-span-7"
          >
            <motion.div variants={fadeUp}>
              <Card className="p-6 bg-card/60 border-border/40 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2.5">
                    <Activity size={18} className="text-amber-400" />
                    <h2 className="text-base font-extrabold text-foreground tracking-tight">Bee Operations</h2>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400"
                  >
                    <span className="relative flex h-2 w-2 mr-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    Running
                  </Badge>
                </div>

                {/* Orbit + Status side by side */}
                <div className="flex items-center gap-8">
                  <div className="shrink-0">
                    <OrbitingBees activeBee={activeBee} size={340} />
                  </div>

                  <div className="flex-1 space-y-2 min-w-0">
                    {BEES.map((bee) => (
                      <BeeStatusRow
                        key={bee.id}
                        bee={bee}
                        isActive={activeBee === bee.id}
                        latestEvent={latestByBee[bee.id]}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.div>

          {/* Activity Feed */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="lg:col-span-5"
          >
            <motion.div variants={fadeUp}>
              <Card className="p-6 bg-card/60 border-border/40 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Zap size={18} className="text-amber-400" />
                    <h2 className="text-base font-extrabold text-foreground tracking-tight">Live Activity</h2>
                  </div>
                  <span className="text-xs text-foreground/40 font-bold uppercase tracking-[0.15em]">
                    {events.length} events
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-0.5" style={{ maxHeight: "520px" }}>
                  <motion.div variants={stagger} initial="hidden" animate="visible">
                    <AnimatePresence>
                      {events.map((evt, i) => (
                        <EventRow key={`${evt.agent}-${evt.time}-${i}`} evt={evt} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        </div>

        {/* ── Live Campaigns ──────────────────────────── */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <div className="flex items-center gap-2.5 mb-4">
            <TrendingUp size={18} className="text-amber-400" />
            <h2 className="text-base font-extrabold text-foreground tracking-tight">Live Campaigns</h2>
            <span className="text-xs text-foreground/30 font-bold uppercase tracking-[0.15em] ml-auto">
              {DEMO_CAMPAIGNS.length} total
            </span>
          </div>
          <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEMO_CAMPAIGNS.map((c, i) => (
              <CampaignCard key={i} campaign={c} />
            ))}
          </motion.div>
        </motion.div>

        {/* ── Footer ─────────────────────────────────── */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border/30">
          <span className="text-xs text-foreground/25 font-semibold">BumbleBee v2 &middot; EPFL Social Impact</span>
          <div className="flex items-center gap-4 text-xs text-foreground/25 font-semibold">
            <span>5 DIDs</span>
            <span>MCP</span>
            <span>XRPL</span>
          </div>
        </div>
      </div>
    </div>
  );
}
