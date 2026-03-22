"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RadialOrbitalTimeline({ timelineData, centerLabel }) {
  const [expandedItems, setExpandedItems] = useState({});
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [pulseEffect, setPulseEffect] = useState({});
  const [activeNodeId, setActiveNodeId] = useState(null);
  const containerRef = useRef(null);
  const orbitRef = useRef(null);
  const nodeRefs = useRef({});

  const handleContainerClick = (e) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedItems({});
      setActiveNodeId(null);
      setPulseEffect({});
      setAutoRotate(true);
    }
  };

  const getRelatedItems = (itemId) => {
    const currentItem = timelineData.find((item) => item.id === itemId);
    return currentItem ? currentItem.relatedIds : [];
  };

  const toggleItem = (id) => {
    setExpandedItems((prev) => {
      const newState = {};
      newState[id] = !prev[id];

      if (!prev[id]) {
        setActiveNodeId(id);
        setAutoRotate(false);

        const relatedItems = getRelatedItems(id);
        const newPulse = {};
        relatedItems.forEach((relId) => { newPulse[relId] = true; });
        setPulseEffect(newPulse);

        const nodeIndex = timelineData.findIndex((item) => item.id === id);
        const targetAngle = (nodeIndex / timelineData.length) * 360;
        setRotationAngle(270 - targetAngle);
      } else {
        setActiveNodeId(null);
        setAutoRotate(true);
        setPulseEffect({});
      }

      return newState;
    });
  };

  useEffect(() => {
    let timer;
    if (autoRotate) {
      timer = setInterval(() => {
        setRotationAngle((prev) => Number(((prev + 0.3) % 360).toFixed(3)));
      }, 50);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [autoRotate]);

  const calculatePosition = (index, total) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radius = 210;
    const radian = (angle * Math.PI) / 180;
    const x = radius * Math.cos(radian);
    const y = radius * Math.sin(radian);
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(0.5, Math.min(1, 0.5 + 0.5 * ((1 + Math.sin(radian)) / 2)));
    return { x, y, angle, zIndex, opacity };
  };

  const isRelatedToActive = (itemId) => {
    if (!activeNodeId) return false;
    return getRelatedItems(activeNodeId).includes(itemId);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
        return { label: "COMPLETE", className: "border-emerald-400/40 bg-emerald-50 text-emerald-600" };
      case "in-progress":
        return { label: "ACTIVE", className: "border-amber-400/40 bg-amber-50 text-amber-600" };
      case "error":
        return { label: "ERROR", className: "border-red-400/40 bg-red-50 text-red-600" };
      default:
        return { label: "IDLE", className: "border-border bg-secondary text-foreground/50" };
    }
  };

  const getNodeStyle = (item) => {
    const isHot = item.energy >= 90; // just completed — bright glow
    switch (item.status) {
      case "completed":
        return isHot
          ? { borderColor: "#10b981", boxShadow: `0 0 20px #10b98160, 0 0 40px ${item.color}30`, bg: `${item.color}40` }
          : { borderColor: `${item.color}60`, boxShadow: `0 0 8px ${item.color}20`, bg: `${item.color}20` };
      case "in-progress":
        return { borderColor: item.color, boxShadow: `0 0 24px ${item.color}60, 0 0 48px ${item.color}25`, bg: `${item.color}45` };
      case "error":
        return { borderColor: "#ef4444", boxShadow: "0 0 16px rgba(239,68,68,0.4)", bg: "rgba(239,68,68,0.25)" };
      default:
        return { borderColor: "rgba(217,119,6,0.35)", boxShadow: "none", bg: "hsl(var(--card))" };
    }
  };

  return (
    <div
      className="w-full h-[580px] flex items-center justify-center overflow-hidden relative"
      ref={containerRef}
      onClick={handleContainerClick}
    >
      <div
        className="absolute w-full h-full flex items-center justify-center"
        ref={orbitRef}
        style={{ perspective: "1000px" }}
      >
        {/* Center - BumbleBee transformer logo */}
        <div className="absolute z-10 flex flex-col items-center gap-1">
          <div className="relative">
            <div className="absolute -inset-3 rounded-full bg-amber-400/15 animate-pulse" />
            <div className="absolute -inset-6 rounded-full border border-amber-400/10 animate-ping opacity-30" />
            <img
              src="/bumblebee.png"
              alt="BumbleBee"
              className="w-16 h-16 rounded-2xl relative z-10 shadow-lg shadow-amber-500/20"
            />
          </div>
        </div>

        {/* Orbit rings */}
        <div className="absolute w-[420px] h-[420px] rounded-full border-2 border-amber-500/50" />
        <div className="absolute w-[320px] h-[320px] rounded-full border border-amber-400/35" />

        {/* Sweeper */}
        <div className="absolute w-[420px] h-[420px] pointer-events-none" style={{ animation: "orbit 16s linear infinite" }}>
          <div className="absolute top-0 left-1/2 w-[2px] h-1/2 origin-bottom -translate-x-1/2" style={{ background: "linear-gradient(to top, transparent 15%, rgba(217,119,6,0.45) 55%, rgba(245,158,11,0.25) 85%, transparent 100%)" }} />
        </div>

        {/* Nodes */}
        {timelineData.map((item, index) => {
          const pos = calculatePosition(index, timelineData.length);
          const isExpanded = expandedItems[item.id];
          const isRelated = isRelatedToActive(item.id);
          const isPulsing = pulseEffect[item.id];
          const Icon = item.icon;
          const statusBadge = getStatusBadge(item.status);
          const nodeStyle = getNodeStyle(item);
          const isActive = item.status === "in-progress";
          const isComplete = item.status === "completed";
          const isHot = isComplete && item.energy >= 90;
          const isError = item.status === "error";

          return (
            <div
              key={item.id}
              ref={(el) => (nodeRefs.current[item.id] = el)}
              className="absolute transition-all duration-700 cursor-pointer"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: isExpanded ? 200 : pos.zIndex,
                opacity: isExpanded ? 1 : pos.opacity,
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleItem(item.id);
              }}
            >
              {/* Glow ring — active bees pulse, just-completed bees glow steady */}
              {(isPulsing || isExpanded || isActive || isHot) && (
                <div
                  className={`absolute rounded-full ${isActive ? "animate-ping" : "animate-pulse"}`}
                  style={{
                    background: isActive
                      ? `radial-gradient(circle, ${item.color}35 0%, ${item.color}10 50%, transparent 70%)`
                      : `radial-gradient(circle, ${item.color}20 0%, transparent 70%)`,
                    width: isActive ? "80px" : "64px",
                    height: isActive ? "80px" : "64px",
                    left: isActive ? "-16px" : "-8px",
                    top: isActive ? "-16px" : "-8px",
                  }}
                />
              )}

              {/* Active bee gets a second ring */}
              {isActive && (
                <div
                  className="absolute rounded-full animate-pulse"
                  style={{
                    background: `radial-gradient(circle, ${item.color}15 0%, transparent 70%)`,
                    width: "96px", height: "96px",
                    left: "-24px", top: "-24px",
                  }}
                />
              )}

              {/* Node */}
              <div
                className={`
                  w-14 h-14 rounded-xl flex items-center justify-center relative
                  border-2 transition-all duration-300
                  ${isExpanded
                    ? "scale-110"
                    : isActive
                    ? "scale-110 animate-pulse"
                    : isRelated
                    ? "animate-pulse"
                    : "hover:border-amber-400/50"
                  }
                `}
                style={{
                  borderColor: isExpanded ? "#f59e0b" : nodeStyle.borderColor,
                  boxShadow: isExpanded ? `0 0 20px ${item.color}30` : nodeStyle.boxShadow,
                  background: isExpanded
                    ? `${item.color}20`
                    : isRelated
                    ? `${item.color}10`
                    : nodeStyle.bg,
                }}
              >
                <Icon size={22} style={{ color: isError ? "#ef4444" : item.color, filter: "saturate(1.4) brightness(0.85)" }} strokeWidth={2.5} />
                {/* Status indicator dot */}
                <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                  isActive ? "bg-amber-500 animate-ping" :
                  isHot ? "bg-emerald-500 animate-pulse" :
                  isComplete ? "bg-emerald-400" :
                  isError ? "bg-red-500" :
                  "bg-gray-300"
                }`} />
                {isActive && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                )}
              </div>

              {/* Label */}
              <div
                className={`absolute top-[64px] left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-bold tracking-wide transition-all duration-300 ${
                  isExpanded ? "text-foreground" : isActive ? "text-foreground/90" : "text-foreground/80"
                }`}
              >
                {item.title}
              </div>

              {/* Expanded card */}
              {isExpanded && (
                <Card className="absolute top-[80px] left-1/2 -translate-x-1/2 w-72 bg-card border-border shadow-xl overflow-visible z-50">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-px h-3 bg-amber-400/40" />
                  <CardHeader className="pb-2 p-4">
                    <div className="flex justify-between items-center">
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2 text-[10px] font-bold uppercase tracking-[0.15em] ${statusBadge.className}`}
                      >
                        {statusBadge.label}
                      </Badge>
                      <span className="mono text-xs text-foreground/40">{item.date}</span>
                    </div>
                    <CardTitle className="text-sm font-bold mt-2 flex items-center gap-2">
                      <span>🐝</span> {item.title} Bee
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-foreground/60 p-4 pt-0">
                    <p className="font-medium">{item.content}</p>

                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="flex items-center font-semibold text-foreground/50">
                          <Zap size={12} className="mr-1" />
                          Progress
                        </span>
                        <span className="mono font-bold text-foreground/70">{item.energy}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${item.energy}%` }}
                        />
                      </div>
                    </div>

                    {item.relatedIds.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border">
                        <h4 className="text-xs uppercase tracking-[0.15em] font-bold text-foreground/40 mb-2">
                          Connected Bees
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {item.relatedIds.map((relatedId) => {
                            const relatedItem = timelineData.find((i) => i.id === relatedId);
                            return (
                              <button
                                key={relatedId}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleItem(relatedId);
                                }}
                              >
                                🐝 {relatedItem?.title}
                                <ArrowRight size={10} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
