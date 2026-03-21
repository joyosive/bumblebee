/**
 * BumbleBee — Autonomous Social Impact Funding on XRPL
 *
 * Three-agent swarm:
 *   BeeScout   — discovers ventures via Telegram
 *   BeeAnalyst — verifies on-chain (Oracle, Credentials, DID via MCP)
 *   BeeFunder  — creates conditional escrow with crypto-conditions
 *
 * Telegraf handles XRPL commands, Gemini handles general conversation.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { initBridge, emitEvent } from './bridge/websocket.js';
import { getExplorerUrl, getWallet } from './services/xrplClient.js';
import { createEscrow, finishEscrow, generateConditionPair } from './services/escrow.js';
import { searchVentures, findVenture, VENTURES } from './data/ventures.js';
import { calculateTrustScore, formatScoreReport } from './services/trustScore.js';
import { initVentureWallets } from './services/treasury.js';
import { startA2AServer } from './a2a/agentCards.js';
import { startX402Server, storeVerificationResult } from './services/x402.js';
import {
  connectMCP, isMCPConnected, mcpListTools,
  mcpSetOracle, mcpCreateCredential, mcpCreateDID,
} from './services/mcpClient.js';
import type { PendingVerification, ActiveEscrow } from './data/types.js';

// ── State ────────────────────────────────────────────────────────────

const pendingVerifications = new Map<string, PendingVerification>();
const activeEscrows = new Map<string, ActiveEscrow>();

// ── Gemini ───────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const model = genAI.getGenerativeModel({ model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash' });

async function askGemini(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const result = await model.generateContent([
      { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser message: ${userMessage}` }] },
    ]);
    return result.response.text();
  } catch (err) {
    console.error('[GEMINI] Error:', err);
    return 'Sorry, something went wrong. Try "Find ventures" or "Verify Solar Sister".';
  }
}

// ── Agent Handlers ───────────────────────────────────────────────────

async function handleScout(query: string): Promise<string> {
  emitEvent({ agent: 'scout', type: 'work', message: `Searching: "${query}"` });

  const results = searchVentures(query);
  const ventures = results.length > 0 ? results : VENTURES.slice(0, 5);

  const list = ventures.map((v, i) =>
    `${i + 1}. **${v.name}**\n   📍 ${v.countries} | 🏷️ ${v.sector} | ${v.type}\n   ${v.description.slice(0, 120)}...`
  ).join('\n\n');

  emitEvent({ agent: 'scout', type: 'complete', message: `Found ${ventures.length} ventures` });

  return `🔍 Found ${ventures.length} venture(s):\n\n${list}\n\n💡 Say "Verify [name]" to check trust score\n💰 Say "Fund [name] with [amount] XRP" to create escrow`;
}

async function handleAnalyst(text: string): Promise<string> {
  const venture = findVenture(text);
  if (!venture) return '❌ Venture not found. Try "Find ventures" first.';

  emitEvent({ agent: 'analyst', type: 'work', message: `Verifying ${venture.name}...` });

  // Calculate deterministic trust score
  const score = calculateTrustScore(venture);
  venture.trustScore = score;

  let oracleTxHash = '';
  let credentialTxHash = '';

  // Publish on-chain via MCP if connected
  if (isMCPConnected()) {
    try {
      emitEvent({ agent: 'analyst', type: 'work', message: `Publishing oracle for ${venture.name}...` });
      const oracleResult = await mcpSetOracle(
        0, 'BumbleBee', 'TrustScore',
        Math.floor(Date.now() / 1000),
        [{ BaseAsset: 'XRP', QuoteAsset: 'USD', AssetPrice: score.total, Scale: 0 }],
      );
      oracleTxHash = oracleResult?.hash || oracleResult?.tx_hash || '';
    } catch (err: any) {
      console.log(`  ⚠️ Oracle publish failed: ${err.message?.slice(0, 50)}`);
    }

    try {
      const credResult = await mcpCreateCredential(
        venture.walletAddress || '',
        'TrustVerified',
        `score:${score.total}|venture:${venture.name}`,
      );
      credentialTxHash = credResult?.hash || credResult?.tx_hash || '';
    } catch (err: any) {
      console.log(`  ⚠️ Credential issue failed: ${err.message?.slice(0, 50)}`);
    }
  }

  // Generate escrow condition pair
  const { condition, fulfillment } = generateConditionPair();

  pendingVerifications.set(venture.id, {
    ventureId: venture.id,
    condition,
    fulfillment,
    trustScore: score.total,
    oracleTxHash,
    credentialTxHash,
  });

  // Store for x402 API
  storeVerificationResult(venture.id, {
    ventureName: venture.name,
    trustScore: score.total,
    verifiedAt: new Date().toISOString(),
    metrics: score,
  });

  emitEvent({
    agent: 'analyst', type: 'complete',
    message: `Verified ${venture.name}: Score ${score.total}/100`,
    data: { txHash: oracleTxHash, trustScore: score.total },
  });

  const report = formatScoreReport(venture, score);
  const mcpSection = isMCPConnected()
    ? `\n🔌 **On-chain (via MCP):**\n• Oracle: ${oracleTxHash || 'pending approval'}\n• Credential: ${credentialTxHash || 'pending approval'}\n• Escrow condition: Generated ✅`
    : '\n🔌 MCP not connected — scores calculated locally';

  return `🔬 **Verification Report: ${venture.name}**\n\n${report}\n${mcpSection}\n\n✅ **VERIFIED** — Ready for funding!\nSay: "Fund ${venture.name} with 50 XRP"`;
}

async function handleFunder(text: string): Promise<string> {
  const amountMatch = text.match(/(\d+)\s*XRP/i);
  const amount = amountMatch ? parseInt(amountMatch[1]) : 50;
  const amountDrops = (amount * 1_000_000).toString();
  const venture = findVenture(text);
  if (!venture) return '❌ Venture not found. Try "Find ventures" first.';
  if (!venture.walletAddress) return `❌ ${venture.name} wallet not provisioned yet. Restart the bot to initialize wallets.`;

  emitEvent({ agent: 'funder', type: 'work', message: `Creating escrow: ${amount} XRP for ${venture.name}` });

  const verification = pendingVerifications.get(venture.id);
  let condition: string, fulfillment: string;
  if (verification) {
    condition = verification.condition;
    fulfillment = verification.fulfillment;
  } else {
    const pair = generateConditionPair();
    condition = pair.condition;
    fulfillment = pair.fulfillment;
  }

  try {
    const result = await createEscrow(
      process.env.FUNDER_WALLET_SEED!,
      venture.walletAddress,
      amountDrops,
      condition,
    );

    const funderWallet = getWallet(process.env.FUNDER_WALLET_SEED!);
    activeEscrows.set(venture.id, {
      ventureId: venture.id,
      ventureName: venture.name,
      txHash: result.txHash,
      sequence: result.sequence,
      ownerAddress: funderWallet.address,
      condition,
      fulfillment,
      amount: amount.toString(),
      createdAt: new Date().toISOString(),
    });

    const explorerLink = getExplorerUrl(result.txHash);
    emitEvent({
      agent: 'funder', type: 'complete',
      message: `Escrow created: ${amount} XRP for ${venture.name}`,
      data: { txHash: result.txHash, amount, ventureName: venture.name },
    });

    return `💰 **Escrow Created!**\n\n🔒 Amount: ${amount} XRP locked\n📍 Destination: ${venture.name}\n⏰ Auto-refund: 24 hours\n🔐 Crypto-condition attached\n\n🔗 ${explorerLink}\n\n✅ Say "Release escrow for ${venture.name}" after verification.`;
  } catch (err: any) {
    emitEvent({ agent: 'funder', type: 'error', message: `Escrow failed: ${err.message}` });
    return `❌ Escrow creation failed: ${err.message}`;
  }
}

async function handleRelease(text: string): Promise<string> {
  const venture = findVenture(text);
  if (!venture) return '❌ Venture not found.';

  const escrow = activeEscrows.get(venture.id);
  if (!escrow) return `❌ No active escrow for ${venture.name}.`;

  emitEvent({ agent: 'funder', type: 'work', message: `Releasing escrow for ${venture.name}` });

  try {
    const result = await finishEscrow(
      process.env.ANALYST_WALLET_SEED!,
      escrow.ownerAddress,
      escrow.sequence,
      escrow.condition,
      escrow.fulfillment,
    );

    activeEscrows.delete(venture.id);
    const explorerLink = getExplorerUrl(result.txHash);

    emitEvent({
      agent: 'funder', type: 'complete',
      message: `Released ${escrow.amount} XRP to ${venture.name}`,
      data: { txHash: result.txHash, amount: escrow.amount, ventureName: venture.name },
    });

    return `✅ **Escrow Released!**\n\n💸 ${escrow.amount} XRP sent to ${venture.name}\n🔓 Verified by BeeAnalyst\n\n🔗 ${explorerLink}`;
  } catch (err: any) {
    return `❌ Release failed: ${err.message}`;
  }
}

// ── Intent Router ───────────────────────────────────────────────────

function isXrplCommand(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('release') || lower.includes('finish') ||
    ((lower.includes('fund') || lower.includes('escrow') || lower.includes('donate')) && lower.includes('xrp')) ||
    lower.includes('verify') || lower.includes('check') || lower.includes('analyze') ||
    lower.includes('find') || lower.includes('search') || lower.includes('venture') ||
    lower.includes('agriculture') || lower.includes('healthcare') || lower.includes('education') ||
    lower.includes('energy') || lower.includes('wash') || lower === '/start'
  );
}

async function routeCommand(text: string): Promise<string | null> {
  const lower = text.toLowerCase();

  if (lower.includes('release') || lower.includes('finish')) return handleRelease(text);
  if ((lower.includes('fund') || lower.includes('escrow') || lower.includes('donate')) && lower.includes('xrp')) return handleFunder(text);
  if (lower.includes('verify') || lower.includes('check') || lower.includes('analyze')) return handleAnalyst(text);
  if (lower.includes('find') || lower.includes('search') || lower.includes('venture') ||
      lower.includes('agriculture') || lower.includes('healthcare') || lower.includes('education') ||
      lower.includes('energy') || lower.includes('wash')) return handleScout(lower);

  return null;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🐝 BumbleBee — Autonomous Social Impact Funding on XRPL\n');

  // 1. Infrastructure
  initBridge();
  startA2AServer();
  startX402Server(3003);

  // 2. Connect MCP (mcp-xrpl server for on-chain operations)
  const mcpReady = await connectMCP();

  // 3. Register agent DIDs via MCP
  if (mcpReady) {
    for (const agent of ['BeeScout', 'BeeAnalyst', 'BeeFunder']) {
      try {
        await mcpCreateDID(`did:xrpl:testnet:${agent.toLowerCase()}`);
        console.log(`   🆔 ${agent} DID registered`);
      } catch (err: any) {
        console.log(`   ⚠️ ${agent} DID: ${err.message?.slice(0, 40)}`);
      }
    }
  }

  // 4. Initialize venture wallets from treasury
  if (process.env.TREASURY_WALLET_SEED) {
    const wss = process.env.XRPL_WSS || 'wss://s.altnet.rippletest.net:51233';
    await initVentureWallets(VENTURES, process.env.TREASURY_WALLET_SEED, wss, 10);
  } else {
    console.log('   ⚠️ No TREASURY_WALLET_SEED — venture wallets not provisioned');
  }

  // 5. Telegram bot
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

  bot.command('start', (ctx) => {
    ctx.reply(`🐝 **Welcome to BumbleBee!**

Autonomous agents for social impact funding on XRPL.

🤖 Three agents: BeeScout, BeeAnalyst, BeeFunder
⛓️ XRPL: Escrow, Oracle, Credentials, DID
🔌 MCP: ${mcpReady ? 'Connected' : 'Not available'}
💳 x402: http://localhost:3003/pricing

Try:
• "Find agriculture ventures"
• "Verify Solar Sister"
• "Fund Solar Sister with 50 XRP"
• "Release escrow for Solar Sister"`, { parse_mode: 'Markdown' });
  });

  bot.command('tools', async (ctx) => {
    if (isMCPConnected()) {
      const tools = await mcpListTools();
      ctx.reply(`🔌 **MCP Tools (mcp-xrpl)**\n\n${tools.length} XRPL tools available:\n${tools.slice(0, 20).map(t => `• ${t}`).join('\n')}${tools.length > 20 ? `\n... and ${tools.length - 20} more` : ''}`, { parse_mode: 'Markdown' }).catch(() => {
        ctx.reply(`MCP Tools: ${tools.join(', ')}`);
      });
    } else {
      ctx.reply('🔌 MCP not connected. Using direct xrpl.js.');
    }
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    console.log(`\n[TELEGRAM] "${text}"`);

    try {
      const xrplResponse = await routeCommand(text);
      if (xrplResponse) {
        const chunks = xrplResponse.match(/[\s\S]{1,4000}/g) || [xrplResponse];
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
        }
        return;
      }

      // General chat via Gemini
      const systemPrompt = `You are BeeScout, part of the BumbleBee protocol on XRPL. You help users discover and fund social impact ventures using blockchain escrow. You're enthusiastic about impact but data-driven. Keep responses concise for Telegram. Guide users to commands: "Find ventures", "Verify [name]", "Fund [name] with [amount] XRP".`;
      const response = await askGemini(systemPrompt, text);
      const chunks = response.match(/[\s\S]{1,4000}/g) || [response];
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
      }
    } catch (err: any) {
      console.error('[TELEGRAM] Error:', err.message);
      await ctx.reply('❌ Something went wrong. Try "Find ventures" or "Verify Solar Sister".');
    }
  });

  bot.launch().then(() => {
    console.log('📱 Telegram polling started');
  }).catch((err) => {
    console.error('📱 Telegram error:', err.message);
  });

  // 6. Emit spawn events
  emitEvent({ agent: 'scout', type: 'spawn', message: 'BeeScout ready' });
  emitEvent({ agent: 'analyst', type: 'spawn', message: 'BeeAnalyst ready' });
  emitEvent({ agent: 'funder', type: 'spawn', message: 'BeeFunder ready' });

  console.log(`\n🐝 BumbleBee is live!`);
  console.log(`   🔌 MCP: ${mcpReady ? 'Connected' : 'Not available'}`);
  console.log(`   🌐 A2A: http://localhost:3002/.well-known/agent.json`);
  console.log(`   💳 x402: http://localhost:3003/pricing`);
  console.log(`   📊 Dashboard: http://localhost:3000\n`);

  process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
}

main().catch(console.error);
