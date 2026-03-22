"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Zap, Eye } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { InteractiveGlobe } from "@/components/ui/interactive-globe";
import { WalletConnector } from "@/components/WalletConnector";
import { useWallet } from "@/components/providers/WalletProvider";
import { useWalletManager } from "@/hooks/useWalletManager";

export default function LandingPage() {
  const router = useRouter();
  const { isConnected, accountInfo } = useWallet();
  useWalletManager();

  useEffect(() => {
    if (isConnected && accountInfo) {
      router.push("/dashboard");
    }
  }, [isConnected, accountInfo, router]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <Image
              src="/bumblebee.png"
              alt="BumbleBee"
              width={48}
              height={48}
              className="rounded-xl"
              style={{ width: "48px", height: "auto" }}
            />
            <span className="text-lg font-extrabold text-foreground tracking-tight">BumbleBee</span>
          </div>
          <Badge
            variant="outline"
            className="rounded-full border-border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-foreground/50"
          >
            XRPL Testnet
          </Badge>
        </div>
      </header>

      {/* Hero - Split layout */}
      <section className="flex-1 flex items-center">
        <div className="max-w-6xl mx-auto w-full px-6 flex flex-col md:flex-row items-center gap-8 md:gap-4 py-12">

          {/* Left - Content */}
          <div className="flex-1 flex flex-col items-start gap-6">
            <Badge
              variant="outline"
              className="animate-appear gap-2 rounded-full border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-bold"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span className="text-amber-700 uppercase tracking-[0.2em]">5 Autonomous Bees on XRPL</span>
            </Badge>

            <h1 className="animate-appear text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight text-foreground tracking-tight">
              Autonomous Impact
              <br />
              <span className="text-amber-500">Funding on XRPL</span>
            </h1>

            <p className="animate-appear opacity-0 delay-100 text-base sm:text-lg font-medium text-muted-foreground max-w-md leading-relaxed">
              Five autonomous Bees evaluate NGO campaigns, manage escrows,
              verify milestone evidence, and publish trust scores, all on-chain.
            </p>

            {/* Connect Wallet */}
            <div className="animate-appear opacity-0 delay-300">
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-1 shadow-lg shadow-amber-500/10">
                <WalletConnector />
              </div>
            </div>

            {/* Feature pills */}
            <div className="flex animate-appear flex-wrap items-center gap-3 opacity-0 delay-700">
              {[
                { icon: Shield, label: "On-Chain Trust Scores", color: "text-emerald-500" },
                { icon: Zap, label: "Conditional Escrows", color: "text-amber-500" },
                { icon: Eye, label: "Real-Time Monitoring", color: "text-blue-500" },
              ].map((feature) => (
                <div
                  key={feature.label}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary border border-border"
                >
                  <feature.icon size={16} className={feature.color} />
                  <span className="text-sm font-semibold text-foreground/70">{feature.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Globe */}
          <div className="flex-1 flex items-center justify-center animate-appear opacity-0 delay-700">
            <InteractiveGlobe size={580} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-5">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <span className="text-sm text-foreground/30 font-semibold">BumbleBee v2 - EPFL Social Impact</span>
          <div className="flex items-center gap-3">
            {[
              { label: "Escrow", color: "border-amber-200 bg-amber-50 text-amber-600" },
              { label: "MCP", color: "border-blue-200 bg-blue-50 text-blue-600" },
              { label: "DID", color: "border-emerald-200 bg-emerald-50 text-emerald-600" },
            ].map((tag) => (
              <Badge
                key={tag.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${tag.color}`}
              >
                {tag.label}
              </Badge>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
