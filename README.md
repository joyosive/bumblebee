<p align="center">
  <span style="font-size: 48px">🐝</span>
</p>

<h1 align="center">BumbleBee</h1>

<p align="center">
  <strong>Autonomous Impact Funding on XRPL</strong>
  <br />
  <em>5 autonomous agents evaluate, fund, verify, and score NGO campaigns — all on-chain.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/XRPL-Testnet-blue?style=flat-square" alt="XRPL" />
  <img src="https://img.shields.io/badge/Agents-5%20Bees-f5c542?style=flat-square" alt="Bees" />
  <img src="https://img.shields.io/badge/MCP-Enabled-34d399?style=flat-square" alt="MCP" />
  <img src="https://img.shields.io/badge/License-MIT-white?style=flat-square" alt="License" />
</p>

---

## The Problem

Impact funding suffers from opacity. Donors send money and hope for the best. NGOs spend time on bureaucratic reporting instead of impact. There is no standardized way to verify outcomes, release funds conditionally, or build on-chain reputation.

## The Solution

**BumbleBee** is a swarm of 5 autonomous agents ("Bees") that manage the entire lifecycle of impact funding on the XRP Ledger. NGOs submit campaigns via Telegram, and the Bees take it from there — evaluating proposals, creating escrow contracts, verifying milestone evidence, and publishing trust scores. Donors monitor everything through a real-time dashboard.

Every action is auditable. Every fund release is conditional. Every score lives on-chain.

## How It Works

```
  NGO submits via Telegram
           │
     ┌─────▼─────┐
     │ Facilitator │  ← Campaign intake & structuring
     └─────┬─────┘
           │
     ┌─────▼─────┐
     │  Evaluator  │  ← Due diligence scoring (60+ to pass)
     └─────┬─────┘
           │
     ┌─────▼─────┐
     │  Treasury   │  ← Escrow creation & milestone payments
     └─────┬─────┘
           │
     ┌─────▼─────┐
     │  Verifier   │  ← Evidence review & milestone approval
     └─────┬─────┘
           │
     ┌─────▼─────┐
     │  Reviewer   │  ← Trust scoring & on-chain reputation
     └───────────┘
           │
    Donor monitors via Dashboard
```

### The 5 Bees

| Bee | Role | What It Does |
|-----|------|-------------|
| **Facilitator** | Campaign Intake | Receives NGO proposals via Telegram, extracts structured data using LLM, creates campaign records |
| **Evaluator** | Due Diligence | Scores campaigns on description quality, sector clarity, and funding reasonability. Generates 3 milestones |
| **Treasury** | Escrow & Funds | Allocates funds from pool, creates XRPL escrow contracts with crypto-conditions, releases payments on approval |
| **Verifier** | Evidence Review | Reviews submitted evidence (photos, documents), approves or rejects milestones with feedback |
| **Reviewer** | Trust Scoring | Calculates trust scores (speed + quality + utilization), publishes via Oracle, issues credentials |

### Campaign Lifecycle

1. **Submit** — NGO describes their project via Telegram (natural language or `/campaign`)
2. **Evaluate** — Evaluator Bee scores the proposal; 60+ threshold to proceed
3. **Fund** — Treasury Bee creates 3 escrow contracts on XRPL, auto-releases M1 seed funding
4. **Execute** — NGO works on milestones, submits evidence via Telegram
5. **Verify** — Verifier Bee reviews evidence, approves/rejects with feedback
6. **Score** — Reviewer Bee calculates trust score and publishes it on-chain via Oracle

Each milestone payment is gated by a **PREIMAGE-SHA-256 crypto-condition** — funds cannot be released without verified fulfillment.

## Architecture

```
bumblebee/
├── apps/
│   └── web/                  # Next.js 14 monitoring dashboard
│       ├── app/              # App Router pages
│       ├── components/ui/    # shadcn + custom components
│       └── components/       # Dashboard-specific components
├── packages/
│   └── agents/               # 5-Bee agent swarm
│       ├── src/bees/         # Individual bee handlers
│       ├── src/db/           # SQLite schema & queries
│       ├── src/services/     # XRPL, MCP, escrow, trust scoring
│       └── src/bridge/       # WebSocket bridge to dashboard
├── turbo.json
└── pnpm-workspace.yaml
```

## Tech Stack

### Agent Swarm
- **Telegraf** — Telegram bot framework for NGO interface
- **Gemini 2.0 Flash** — LLM for natural language understanding & data extraction
- **Groq** — Fallback LLM (free tier, fast)
- **xrpl.js** — Direct XRPL ledger interaction
- **MCP SDK** — Model Context Protocol for DIDs, Oracles, Credentials
- **five-bells-condition** — RFC crypto-conditions for escrow gates
- **SQLite** — Persistent state (campaigns, milestones, escrows, trust scores)
- **ElizaOS** — Agent framework foundation

### Monitoring Dashboard
- **Next.js 14** — React framework with App Router
- **Tailwind CSS** — Utility-first styling with custom dark theme
- **Framer Motion** — Smooth animations and transitions
- **Lucide React** — Consistent iconography
- **WebSocket** — Real-time event streaming from agent swarm
- **shadcn/ui** — Component primitives (New York style)

### XRPL Features Used
- **Escrow** — Conditional fund releases with crypto-conditions
- **DIDs** — Per-bee decentralized identifiers for auditability
- **Oracle** — On-chain trust score publication
- **Credentials** — Campaign completion certificates

### Infrastructure
- **Turborepo** — Monorepo build orchestration
- **pnpm** — Fast, disk-efficient package manager

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
git clone https://github.com/joyosive/bumblebee.git
cd bumblebee
pnpm install
```

### Environment Setup

```bash
cp packages/agents/.env.example packages/agents/.env
```

Configure the following in `packages/agents/.env`:

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# LLM
GOOGLE_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key          # optional fallback

# Network
XRPL_NETWORK=testnet
XRPL_WSS=wss://s.altnet.rippletest.net:51233
```

### Run

```bash
# Start the monitoring dashboard
pnpm --filter web dev

# Start the agent swarm (separate terminal)
pnpm --filter impactbee-agents dev
```

Dashboard: [http://localhost:3000](http://localhost:3000)

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/campaign` | Submit a new campaign |
| `/submit <n>` | Submit evidence for milestone n |
| `/mystatus` | View your campaign status |
| `/pool` | Check treasury balance |
| `/help` | List all commands |

NGOs can also just type naturally — the Facilitator Bee uses LLM intent detection to understand what you need.

## Wallet Architecture

BumbleBee uses **5 separate XRPL wallets** — one per Bee. Each wallet has its own DID registered on-chain, providing full auditability of which agent performed which action.

```
Treasury  ── Holds pool funds, creates escrows
Facilitator ── Registers campaigns on-chain
Evaluator ── Records evaluation scores
Verifier ── Issues verification records
Reviewer ── Publishes trust scores via Oracle
```

## Trust Scoring

Campaigns that reach completion receive a trust score (0–100) based on three dimensions:

| Dimension | Weight | Criteria |
|-----------|--------|----------|
| **Speed** | 35 pts | How quickly milestones were completed |
| **Quality** | 35 pts | First-time approval vs. revisions needed |
| **Utilization** | 30 pts | Percentage of milestones completed |

Trust scores are published on-chain via **XRPL Oracle** and can be queried by any application — building a portable, verifiable reputation for NGOs.

## Development

```bash
pnpm dev          # Start all packages
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm format       # Format with Prettier
pnpm clean        # Clean build artifacts
```

## Networks

| Network | WebSocket | Explorer |
|---------|-----------|----------|
| Testnet | `wss://s.altnet.rippletest.net:51233` | [testnet.xrpl.org](https://testnet.xrpl.org) |

## License

MIT

---

<p align="center">
  Built by <a href="https://github.com/joyosive">joyosive</a> for EPFL Social Impact
</p>
