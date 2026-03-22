<p align="center">
  <img src="https://img.shields.io/badge/🐝-BumbleBee-f5c542?style=for-the-badge&labelColor=1a1a2e" alt="BumbleBee" />
</p>

<h1 align="center">BumbleBee</h1>

<p align="center">
  <strong>Autonomous Impact Funding on XRPL</strong>
  <br />
  <em>A swarm of 5 autonomous agents that evaluate, fund, verify, and score NGO campaigns — all on-chain.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/XRPL-Testnet-blue?style=flat-square" alt="XRPL" />
  <img src="https://img.shields.io/badge/Agents-5%20Bees-f5c542?style=flat-square" alt="Bees" />
  <img src="https://img.shields.io/badge/RLUSD-Enabled-0066ff?style=flat-square" alt="RLUSD" />
  <img src="https://img.shields.io/badge/MCP-Enabled-34d399?style=flat-square" alt="MCP" />
  <img src="https://img.shields.io/badge/A2A-Discovery-8b5cf6?style=flat-square" alt="A2A" />
  <img src="https://img.shields.io/badge/Track-Social%20Impact-ff6b6b?style=flat-square" alt="Social Impact" />
  <img src="https://img.shields.io/badge/License-MIT-white?style=flat-square" alt="License" />
</p>

---

## The Problem

Billions flow into impact funding every year, yet the system is broken:

- **Donors** send money and hope for the best — no visibility, no accountability
- **NGOs** burn time on bureaucratic reporting instead of delivering impact
- **No standard** exists to verify outcomes, release funds conditionally, or build portable reputation

## What BumbleBee Does

BumbleBee is a **multi-agent swarm** that automates the entire lifecycle of impact funding on the **XRP Ledger**. NGOs submit campaigns via Telegram. Five specialized agents — the Bees — take it from there.

Every fund release is **conditional** (crypto-conditions). Every action is **auditable** (per-agent wallets with DIDs). Every trust score is **on-chain** (XRPL Oracle).

```
  NGO submits via Telegram
           │
     ┌─────▼──────┐
     │ Facilitator  │  ← Intake & structuring via LLM
     └─────┬──────┘
           │
     ┌─────▼──────┐
     │  Evaluator   │  ← Due diligence scoring (60+ to pass)
     └─────┬──────┘
           │
     ┌─────▼──────┐
     │  Treasury    │  ← XRPL escrow creation + milestone payments
     └─────┬──────┘
           │
     ┌─────▼──────┐
     │  Verifier    │  ← Evidence review & milestone approval
     └─────┬──────┘
           │
     ┌─────▼──────┐
     │  Reviewer    │  ← Trust scoring & on-chain reputation
     └────────────┘
           │
    Donor monitors via Dashboard
```

## The 5 Bees

| Bee | Role | Key Action |
|-----|------|-----------|
| **Facilitator** | Campaign Intake | Receives proposals via Telegram, uses LLM to extract structured data, creates campaign records |
| **Evaluator** | Due Diligence | LLM-powered scoring (problem clarity, feasibility, impact, sector alignment), generates tailored milestones |
| **Treasury** | Escrow & Funds | Allocates pool funds, creates XRPL escrow contracts with PREIMAGE-SHA-256 conditions + RLUSD stablecoin payments |
| **Verifier** | Evidence Review | LLM-powered evidence analysis — evaluates submitted photos/docs against milestone requirements |
| **Reviewer** | Trust Scoring | Calculates trust scores (speed + quality + utilization), publishes via Oracle, issues credentials |

## Campaign Lifecycle

```
Submit ──► Evaluate ──► Fund ──► Execute ──► Verify ──► Score
  │           │          │          │           │          │
  │       Score 60+   3 escrows   NGO works   Evidence   Trust score
  │       to pass     created     on M1-M3    reviewed   on-chain
  │                   M1 auto-                            via Oracle
  │                   released
  └── Natural language or /campaign via Telegram
```

1. **Submit** — NGO describes their project via Telegram (natural language or `/campaign`)
2. **Evaluate** — Evaluator scores the proposal; 60+ threshold to proceed, generates 3 milestones
3. **Fund** — Treasury creates 3 escrow contracts on XRPL, auto-releases M1 as seed funding
4. **Execute** — NGO works through milestones, submits evidence (photos, documents) via Telegram
5. **Verify** — Verifier reviews evidence, approves or requests revisions
6. **Score** — Reviewer calculates trust score and publishes on-chain via XRPL Oracle + Credentials

Each milestone payment is gated by a **PREIMAGE-SHA-256 crypto-condition** — funds cannot be released without cryptographic proof of fulfillment.

## XRPL Integration

BumbleBee uses **5 native XRPL features**:

| Feature | Usage |
|---------|-------|
| **Escrow** | Conditional fund releases — each milestone gets its own escrow with a PREIMAGE-SHA-256 crypto-condition. Funds auto-refund after 7 days if unclaimed |
| **RLUSD Payments** | Dual-currency support — alongside XRP escrow releases, RLUSD stablecoin payments are sent to NGOs, eliminating volatility risk for real-world aid |
| **DIDs** | Each of the 5 Bees registers a Decentralized Identifier on-chain, enabling full auditability of which agent performed which action |
| **Oracle** | Trust scores are published on-chain as Oracle data, queryable by any application — building portable NGO reputation |
| **Credentials** | Campaign completion certificates issued on-chain by the Reviewer Bee |

### Wallet Architecture

**5 separate XRPL wallets** — one per Bee — each with its own registered DID:

```
Treasury    ── Holds pool funds, creates & releases escrows
Facilitator ── Registers campaigns on-chain via MCP
Evaluator   ── Records evaluation scores
Verifier    ── Issues verification records
Reviewer    ── Publishes trust scores via Oracle
```

## Trust Scoring

Completed campaigns receive a trust score (0–100) based on three dimensions:

| Dimension | Weight | Criteria |
|-----------|--------|----------|
| **Speed** | 35 pts | How quickly milestones were completed (≤3 days = max) |
| **Quality** | 35 pts | First-time approval vs. revisions needed |
| **Utilization** | 30 pts | Percentage of milestones completed |

Trust scores are published on-chain via **XRPL Oracle** and can be queried by any application — building a portable, verifiable reputation layer for NGOs across the ecosystem.

## Architecture

```
bumblebee/
├── apps/
│   └── web/                    # Next.js 14 monitoring dashboard
│       ├── app/                # App Router (landing, dashboard)
│       ├── components/         # UI + dashboard components
│       └── hooks/              # Wallet management hooks
├── packages/
│   └── agents/                 # 5-Bee agent swarm
│       ├── src/bees/           # Individual bee handlers (5 agents)
│       ├── src/db/             # SQLite schema & queries (6 tables)
│       ├── src/services/       # XRPL, MCP, escrow, trust scoring
│       ├── src/bridge/         # WebSocket bridge to dashboard
│       └── src/a2a/            # Agent-to-Agent discovery cards
├── turbo.json                  # Turborepo build orchestration
└── pnpm-workspace.yaml         # Monorepo workspace config
```

### Data Model

```
campaigns ──┬── milestones (3 per campaign)
             ├── escrows (1 per milestone, PREIMAGE-SHA-256)
             ├── fund_allocations
             └── trust_scores (Oracle + Credentials tx hashes)
```

## Tech Stack

### Agent Swarm (`packages/agents`)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Bot Framework** | Telegraf | Telegram interface for NGO interactions |
| **LLM** | Groq (Llama 3.3 70B) + Gemini 2.0 Flash | AI-powered evaluation, evidence verification, and campaign parsing (automatic failover) |
| **Ledger** | xrpl.js 4.6 | Direct XRPL interaction (escrow, payments, queries) |
| **Agent Protocol** | MCP SDK | Model Context Protocol for DIDs, Oracles, Credentials |
| **Crypto** | five-bells-condition | RFC PREIMAGE-SHA-256 conditions for escrow gates |
| **Database** | SQLite (better-sqlite3) | Persistent state for campaigns, milestones, escrows |
| **Agent Framework** | ElizaOS | Foundation for agent lifecycle management |
| **Real-time** | ws (WebSocket) | Event streaming to monitoring dashboard |

### Monitoring Dashboard (`apps/web`)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 14 | React with App Router |
| **Styling** | Tailwind CSS | Utility-first with custom dark theme |
| **Animation** | Framer Motion | Smooth transitions and orbital bee visualizations |
| **Wallet** | xrpl-connect | Multi-wallet support (Xaman, Crossmark, GemWallet, WalletConnect) |
| **Icons** | Lucide React | Consistent iconography |
| **Components** | shadcn/ui | Radix-based primitives |
| **3D** | Spline | Interactive globe visualization |

### Infrastructure

| Tool | Purpose |
|------|---------|
| **Turborepo** | Monorepo build orchestration with caching |
| **pnpm** | Fast, disk-efficient package management |
| **TypeScript** | Type-safe agent code (ES2022 target) |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Google Gemini API key

### Installation

```bash
git clone https://github.com/joyosive/bumblebee.git
cd bumblebee
pnpm install
```

### Environment Setup

```bash
cp packages/agents/.env.example packages/agents/.env
cp apps/web/.env.example apps/web/.env.local
```

Configure `packages/agents/.env`:

```env
# XRPL
XRPL_NETWORK=testnet
XRPL_WSS=wss://s.altnet.rippletest.net:51233

# Wallets (fund from https://faucet.altnet.rippletest.net)
TREASURY_WALLET_SEED=your_treasury_seed
FACILITATOR_WALLET_SEED=your_facilitator_seed
EVALUATOR_WALLET_SEED=your_evaluator_seed
VERIFIER_WALLET_SEED=your_verifier_seed
REVIEWER_WALLET_SEED=your_reviewer_seed

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# LLM (Groq is primary — free tier, Gemini is fallback)
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
GOOGLE_API_KEYS=key1,key2
GOOGLE_MODEL=gemini-2.0-flash

# RLUSD (optional — enables dual-currency XRP + stablecoin)
RLUSD_ISSUER=rlusd_issuer_address

# Dashboard Bridge
DASHBOARD_WS_URL=ws://localhost:3001
```

### Run

```bash
# Start the monitoring dashboard
pnpm --filter web dev

# Start the agent swarm (separate terminal)
pnpm --filter impactbee-agents dev
```

- Dashboard: [http://localhost:3000](http://localhost:3000)
- A2A Discovery: [http://localhost:3002/.well-known/agent.json](http://localhost:3002/.well-known/agent.json)

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/campaign` | Submit a new campaign |
| `/submit <n>` | Submit evidence for milestone n |
| `/mystatus` | View your campaign status |
| `/pool` | Check treasury balance |
| `/help` | List all commands |

NGOs can also type naturally — the Facilitator Bee uses intent detection to understand what you need.

## Demo Script (5 minutes)

1. **Open Dashboard** — Show the monitoring interface at `localhost:3000`. Connect wallet. Point out the 5 bee statuses and empty campaign list.

2. **Submit Campaign** — In Telegram, type `/campaign` then describe an NGO project:
   > "Clean Water Kenya is a non-profit providing clean water access in rural Kenya. We need 5 XRP to install 3 water filtration systems in Mombasa county. Sector: WASH, Country: Kenya."

3. **Watch the Bees** — Dashboard updates in real-time:
   - **FacilitatorBee** parses the campaign (LLM extraction)
   - **EvaluatorBee** scores it (LLM-powered: problem clarity, feasibility, impact, sector)
   - **TreasuryBee** creates 3 escrow contracts on XRPL + RLUSD payments if enabled
   - Click the explorer links to show the escrow transactions on `testnet.xrpl.org`

4. **Submit Evidence** — Type `/submit 2`, then send a photo. The **VerifierBee** analyzes the evidence using LLM and either approves or requests revisions. Show the confidence score and reasoning.

5. **Campaign Complete** — After all milestones, the **ReviewerBee** calculates a trust score and publishes it on-chain via Oracle. Show the trust score breakdown on the dashboard.

**Key talking points:**
- "Funds release ONLY when milestones are verified — crypto-conditions, not trust"
- "RLUSD eliminates volatility — NGOs receive stablecoins for real-world spending"
- "Every action is auditable — 5 separate wallets with DIDs on XRPL"
- "Telegram-first — accessible to NGOs with just a phone"

## Development

```bash
pnpm dev          # Start all packages in dev mode
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm format       # Format with Prettier
pnpm clean        # Clean build artifacts
```

## Network

| Network | WebSocket | Explorer |
|---------|-----------|----------|
| XRPL Testnet | `wss://s.altnet.rippletest.net:51233` | [testnet.xrpl.org](https://testnet.xrpl.org) |

## License

MIT

---

<p align="center">
  Built by <a href="https://github.com/joyosive">joyosive</a> at EPFL
</p>
