"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, ClipboardCheck, Wallet, ShieldCheck, Star,
  Activity, Zap, TrendingUp, Shield, ExternalLink, ArrowRight,
  LogOut, DollarSign,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/components/providers/WalletProvider";
import { useWalletManager } from "@/hooks/useWalletManager";
import RadialOrbitalTimeline from "@/components/ui/radial-orbital-timeline";

// ── API Configuration ───────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ── Bee Timeline Base Template ──────────────────────────────────────

const BASE_BEE_TIMELINE = [
  {
    id: 1,
    title: "Facilitator",
    date: "Always Active",
    content: "Receives NGO campaigns via Telegram, extracts structured data, and routes to evaluation. Handles campaign intake and evidence submission.",
    category: "Intake",
    icon: MessageSquare,
    color: "#a78bfa",
    relatedIds: [2],
    status: "completed",
    energy: 100,
  },
  {
    id: 2,
    title: "Evaluator",
    date: "On Submission",
    content: "Scores campaigns on description quality, sector clarity, and funding reasonability. Generates 3 milestones for approved campaigns.",
    category: "Scoring",
    icon: ClipboardCheck,
    color: "#f97316",
    relatedIds: [1, 3],
    status: "completed",
    energy: 90,
  },
  {
    id: 3,
    title: "Treasury",
    date: "On Approval",
    content: "Allocates funds from the pool, creates XRPL escrow contracts with crypto-conditions. Auto-releases M1 seed funding to NGOs.",
    category: "Finance",
    icon: Wallet,
    color: "#eab308",
    relatedIds: [2, 4],
    status: "in-progress",
    energy: 65,
  },
  {
    id: 4,
    title: "Verifier",
    date: "On Evidence",
    content: "Reviews submitted evidence (photos, documents) for each milestone. Approves or rejects with actionable feedback.",
    category: "Review",
    icon: ShieldCheck,
    color: "#34d399",
    relatedIds: [3, 5],
    status: "pending",
    energy: 30,
  },
  {
    id: 5,
    title: "Reviewer",
    date: "On Completion",
    content: "Calculates trust scores (speed + quality + utilization). Publishes scores via Oracle and issues credentials on-chain.",
    category: "Scoring",
    icon: Star,
    color: "#fb7185",
    relatedIds: [4, 1],
    status: "pending",
    energy: 10,
  },
];

// ── Data ────────────────────────────────────────────────────────────

const BEE_COLORS = {
  facilitator: { text: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200", dot: "bg-violet-500" },
  evaluator: { text: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
  treasury: { text: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", dot: "bg-yellow-500" },
  verifier: { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
  reviewer: { text: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-500" },
};

const BEE_ICONS = {
  facilitator: MessageSquare,
  evaluator: ClipboardCheck,
  treasury: Wallet,
  verifier: ShieldCheck,
  reviewer: Star,
};

// ── Helpers ─────────────────────────────────────────────────────────

function mapEventToStatus(type) {
  const map = {
    spawn: { status: 'pending', energy: 50 },
    work: { status: 'in-progress', energy: 80 },
    complete: { status: 'completed', energy: 100 },
    error: { status: 'error', energy: 20 },
  };
  return map[type] || { status: 'pending', energy: 10 };
}

function formatEvent(e) {
  return {
    agent: e.agent,
    msg: e.message,
    time: new Date(e.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
}

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

function EventRow({ evt }) {
  const Icon = BEE_ICONS[evt.agent];
  const colors = BEE_COLORS[evt.agent];

  if (!colors) return null;

  return (
    <motion.div
      variants={slideIn}
      className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-secondary/50 transition-colors"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${colors.border} ${colors.bg}`}>
        {Icon && <Icon size={13} className={colors.text} strokeWidth={2.5} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-[0.1em] ${colors.text}`}>{evt.agent}</span>
          <span className="text-xs text-foreground/30 font-medium">{evt.time}</span>
        </div>
        <p className="text-sm text-foreground/60 leading-relaxed font-medium">{evt.msg}</p>
      </div>
    </motion.div>
  );
}

function CampaignCard({ campaign }) {
  const milestones = campaign.milestones.map(m => ({
    n: m.number,
    title: m.title,
    status: m.status,
    tx: campaign.escrows.find(e => e.milestone_number === m.number)?.tx_hash || null,
  }));

  const completed = milestones.filter((m) => m.status === "completed").length;
  const total = milestones.length || 3;
  const pct = (completed / total) * 100;
  const score = campaign.trust_score?.score ?? null;

  return (
    <motion.div variants={fadeUp}>
      <Card className="p-5 bg-card border-border hover:border-foreground/15 transition-all duration-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="text-base font-bold text-foreground tracking-tight">{campaign.title}</h4>
            <p className="text-sm text-foreground/40 mt-1 font-medium">
              {campaign.ngo_name} &middot; {campaign.sector} &middot; {campaign.country}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {score && (
              <div className="flex items-center gap-1.5">
                <Shield size={14} className="text-emerald-500" />
                <span className="mono text-sm font-bold text-emerald-600">{score}</span>
              </div>
            )}
            <Badge
              variant="outline"
              className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${
                campaign.status === "completed"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                  : "border-amber-200 bg-amber-50 text-amber-600"
              }`}
            >
              {campaign.status.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          {milestones.map((m, idx) => (
            <div key={m.n} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold border ${
                  m.status === "completed"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : m.status === "active"
                    ? "border-amber-200 bg-amber-50 text-amber-600"
                    : "border-border bg-secondary text-foreground/25"
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
              {idx < milestones.length - 1 && <ArrowRight size={12} className="text-foreground/15" />}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-amber-500"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="mono text-xs text-foreground/40 font-semibold">{campaign.funding_goal} XRP</span>
        </div>
      </Card>
    </motion.div>
  );
}

function StatCard({ label, value, unit, icon: Icon, colorClass }) {
  return (
    <Card className="p-4 bg-card border-border">
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

function SkeletonCard() {
  return (
    <Card className="p-5 bg-card border-border">
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-secondary rounded w-3/4" />
        <div className="h-3 bg-secondary rounded w-1/2" />
        <div className="h-6 bg-secondary rounded w-full" />
        <div className="h-1.5 bg-secondary rounded w-full" />
      </div>
    </Card>
  );
}

// ── Dashboard Page ──────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { isConnected, accountInfo, walletManager } = useWallet();
  useWalletManager();

  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ pool_balance: '0', rlusd_balance: '0', total_allocated: '0', campaign_count: 0, avg_trust_score: 0 });
  const [events, setEvents] = useState([]);
  const [beeStatus, setBeeStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Compute dynamic bee timeline from base template + live status
  const beeTimeline = BASE_BEE_TIMELINE.map(bee => ({
    ...bee,
    status: beeStatus[bee.title.toLowerCase()]?.status || bee.status,
    energy: beeStatus[bee.title.toLowerCase()]?.energy || bee.energy,
  }));

  // Redirect to landing if not connected
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isConnected && !accountInfo) {
        // Give wallet manager time to auto-reconnect
        // Don't redirect immediately
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isConnected, accountInfo, router]);

  // Fetch initial data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [campaignsRes, statsRes, eventsRes] = await Promise.all([
          fetch(`${API_URL}/api/campaigns`),
          fetch(`${API_URL}/api/stats`),
          fetch(`${API_URL}/api/events`),
        ]);
        if (campaignsRes.ok) setCampaigns(await campaignsRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (eventsRes.ok) {
          const evts = await eventsRes.json();
          setEvents(evts.map(formatEvent));
        }
        setApiError(false);
      } catch {
        setApiError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // WebSocket subscription with auto-reconnect
  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      try {
        ws = new WebSocket(`${API_URL.replace('http', 'ws')}`);
        ws.onopen = () => { setWsConnected(true); setApiError(false); };
        ws.onclose = () => { setWsConnected(false); reconnectTimer = setTimeout(connect, 3000); };
        ws.onerror = () => {};
        ws.onmessage = (msg) => {
          try {
            const d = JSON.parse(msg.data);

            // Handle history message (sent on connect)
            if (d.type === 'history' && d.events) {
              setEvents(d.events.map(formatEvent));
              // Update bee status from history
              const statusMap = {};
              for (const e of d.events) {
                if (!statusMap[e.agent]) {
                  statusMap[e.agent] = mapEventToStatus(e.type);
                }
              }
              setBeeStatus(statusMap);
              return;
            }

            if (d.type === 'pong') return;

            // Regular AgentEvent
            setEvents(prev => [
              formatEvent({ agent: d.agent, message: d.message, timestamp: d.timestamp || Date.now() }),
              ...prev.slice(0, 49),
            ]);

            // Update bee status
            setBeeStatus(prev => ({ ...prev, [d.agent]: mapEventToStatus(d.type) }));

            // Refetch campaigns and stats on complete/error events (data changed)
            if (d.type === 'complete' || d.type === 'error') {
              fetch(`${API_URL}/api/campaigns`).then(r => r.ok ? r.json() : null).then(data => { if (data) setCampaigns(data); });
              fetch(`${API_URL}/api/stats`).then(r => r.ok ? r.json() : null).then(data => { if (data) setStats(data); });
            }
          } catch {}
        };
      } catch {}
    }

    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, []);

  const handleDisconnect = async () => {
    if (walletManager) {
      try {
        await walletManager.disconnect();
      } catch {}
    }
    router.push("/");
  };

  const walletAddress = accountInfo?.address
    ? `${accountInfo.address.slice(0, 6)}...${accountInfo.address.slice(-4)}`
    : "Not connected";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="border-b border-border/50 bg-card/30">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between px-6 lg:px-8 h-16">
          <div className="flex items-center gap-3">
            <img src="/bumblebee.png" alt="BumbleBee" width={48} height={48} className="rounded-xl" />
            <div>
              <h1 className="text-base font-extrabold text-foreground tracking-tight">BumbleBee</h1>
              <p className="text-[11px] text-foreground/40 tracking-[0.2em] uppercase font-bold">Impact Monitor</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-sm text-foreground/50 font-semibold">{wsConnected ? "Live" : "Offline"}</span>
            </div>

            <Badge
              variant="outline"
              className="rounded-full border-border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-foreground/50"
            >
              XRPL Testnet
            </Badge>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="mono text-sm text-foreground/60 font-semibold">{walletAddress}</span>
            </div>

            <button
              onClick={handleDisconnect}
              className="p-2 rounded-lg hover:bg-secondary text-foreground/40 hover:text-foreground/70 transition-colors"
              title="Disconnect wallet"
            >
              <LogOut size={16} />
            </button>
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
          className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6"
        >
          <motion.div variants={fadeUp}>
            <StatCard label="Pool Balance" value={stats.pool_balance} unit="XRP" icon={Wallet} colorClass="text-yellow-600" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="RLUSD" value={`$${stats.rlusd_balance || '0'}`} unit="USD" icon={DollarSign} colorClass="text-blue-600" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Allocated" value={stats.total_allocated} unit="XRP" icon={Zap} colorClass="text-orange-600" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Campaigns" value={stats.campaign_count} unit="active" icon={TrendingUp} colorClass="text-emerald-600" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Trust Avg" value={stats.avg_trust_score} unit="/100" icon={Shield} colorClass="text-rose-600" />
          </motion.div>
        </motion.div>

        {/* ── Bee Operations + Activity ────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">

          {/* Bee Operations - THE HERO with Orbital Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-8"
          >
            <Card className="p-6 bg-card border-border overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <Activity size={18} className="text-amber-500" />
                  <h2 className="text-base font-extrabold text-foreground tracking-tight">Bee Operations</h2>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600"
                >
                  <span className="relative flex h-2 w-2 mr-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  Running
                </Badge>
              </div>

              <RadialOrbitalTimeline timelineData={beeTimeline} centerLabel="🐝" />
            </Card>
          </motion.div>

          {/* Monitoring Panel */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-4 flex flex-col gap-4"
          >
            {/* Connection Status */}
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-foreground/40 font-bold uppercase tracking-[0.15em]">Status</span>
                <Badge
                  variant="outline"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${
                    wsConnected
                      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                      : "border-amber-200 bg-amber-50 text-amber-600"
                  }`}
                >
                  {wsConnected ? "LIVE" : "IDLE"}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground/50 font-medium">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-amber-400"}`} />
                {wsConnected ? "Connected to agent swarm" : "Waiting for Telegram activity..."}
              </div>
            </Card>

            {/* Agent Status */}
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-foreground/40 font-bold uppercase tracking-[0.15em]">Agents</span>
                <span className="text-xs text-foreground/30 font-semibold">
                  {wsConnected ? "5" : "0"}/5 spawned
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { name: "Facilitator", color: BEE_COLORS.facilitator, icon: MessageSquare },
                  { name: "Evaluator", color: BEE_COLORS.evaluator, icon: ClipboardCheck },
                  { name: "Treasury", color: BEE_COLORS.treasury, icon: Wallet },
                  { name: "Verifier", color: BEE_COLORS.verifier, icon: ShieldCheck },
                  { name: "Reviewer", color: BEE_COLORS.reviewer, icon: Star },
                ].map((bee) => {
                  const lastEvt = events.find((e) => e.agent === bee.name.toLowerCase());
                  const isActive = lastEvt !== undefined;
                  return (
                    <div
                      key={bee.name}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                        isActive
                          ? `${bee.color.border} ${bee.color.bg}`
                          : "border-border bg-secondary/50"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          isActive
                            ? `${bee.color.border} ${bee.color.bg}`
                            : "border-border bg-card"
                        }`}
                      >
                        <bee.icon
                          size={16}
                          className={isActive ? bee.color.text : "text-foreground/25"}
                          strokeWidth={2.5}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-bold ${
                          isActive ? "text-foreground/80" : "text-foreground/40"
                        }`}>
                          {bee.name}
                        </span>
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isActive ? bee.color.dot : "bg-foreground/10"
                      }`} />
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Activity Log */}
            <Card className="p-4 bg-card border-border flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-500" : "bg-amber-400"}`} />
                  <span className="text-xs text-foreground/40 font-bold uppercase tracking-[0.15em]">Activity Log</span>
                </div>
                <span className="text-xs text-foreground/30 font-semibold">{events.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-0.5" style={{ maxHeight: "300px" }}>
                <motion.div variants={stagger} initial="hidden" animate="visible">
                  {events.length === 0 && !loading && (
                    <p className="text-sm text-foreground/30 text-center py-4 font-medium">No events yet</p>
                  )}
                  {events.map((evt, i) => (
                    <EventRow key={`${evt.agent}-${evt.time}-${i}`} evt={evt} />
                  ))}
                </motion.div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* ── Live Campaigns ──────────────────────────── */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <div className="flex items-center gap-2.5 mb-4">
            <TrendingUp size={18} className="text-amber-500" />
            <h2 className="text-base font-extrabold text-foreground tracking-tight">Live Campaigns</h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : apiError && campaigns.length === 0 ? (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-foreground/40 font-semibold text-sm">Agents offline — connect the bridge server to see live campaigns.</p>
            </Card>
          ) : campaigns.length === 0 ? (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-foreground/40 font-semibold text-sm">No campaigns yet — submit one via Telegram.</p>
            </Card>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </motion.div>
          )}
        </motion.div>

        {/* ── Footer ─────────────────────────────────── */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border/30">
          <span className="text-sm text-foreground/30 font-semibold">BumbleBee v2 &middot; EPFL Social Impact</span>
          <div className="flex items-center gap-3">
            {[
              { label: "Escrow", cls: "border-amber-200 bg-amber-50 text-amber-600" },
              { label: "RLUSD", cls: "border-blue-200 bg-blue-50 text-blue-600" },
              { label: "MCP", cls: "border-purple-200 bg-purple-50 text-purple-600" },
              { label: "DID", cls: "border-emerald-200 bg-emerald-50 text-emerald-600" },
            ].map((tag) => (
              <Badge
                key={tag.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${tag.cls}`}
              >
                {tag.label}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
