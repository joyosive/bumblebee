// packages/agents/src/index.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { initDB } from './db/database.js';
import { initBridge, emitEvent } from './bridge/websocket.js';
import { initAllMCP, mcpCreateDID, isMCPConnected } from './services/mcpClient.js';
import { startA2AServer } from './a2a/agentCards.js';

import { getFacilitatorSystemPrompt, parseCampaignFromGemini, handleCampaignCreate, handleSubmitEvidence, handleMyStatus } from './bees/facilitator.js';
import { evaluateCampaign } from './bees/evaluator.js';
import { allocateAndCreateEscrows, releaseMilestoneEscrow, cancelCampaignEscrows, getPoolStatus } from './bees/treasury.js';
import { reviewEvidence, approveMilestone } from './bees/verifier.js';
import { completeCampaign } from './bees/reviewer.js';
import { getCampaignsByNgo, getCampaignsByStatus, getMilestones, updateMilestone } from './db/database.js';
import type { Campaign, Milestone, BeeName } from './data/types.js';

// ── Gemini ───────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const gemini = genAI.getGenerativeModel({ model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash' });

// Track conversation state per user
const userState = new Map<string, { mode: string; campaignId?: string; context?: string }>();

async function askGemini(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const result = await gemini.generateContent([
      { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser: ${userMessage}` }] },
    ]);
    return result.response.text();
  } catch (err) {
    console.error('[GEMINI]', err);
    return 'Something went wrong. Try /help for commands.';
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n BumbleBee v2 — Campaign-Based Milestone Funding\n');

  // 1. Database
  initDB();
  console.log('   DB: SQLite initialized');

  // 2. Infrastructure
  initBridge();
  startA2AServer();

  // 3. MCP (multi-wallet)
  const mcpReady = await initAllMCP();

  // 4. Register DIDs
  if (mcpReady) {
    const bees: BeeName[] = ['evaluator', 'treasury', 'facilitator', 'verifier', 'reviewer'];
    for (const bee of bees) {
      if (isMCPConnected(bee)) {
        try {
          await mcpCreateDID(bee, `did:xrpl:testnet:${bee}`);
          console.log(`   DID: ${bee} registered`);
        } catch (err: any) {
          console.log(`   DID: ${bee} - ${err.message?.slice(0, 40)}`);
        }
      }
    }
  }

  // 5. Telegram bot
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

  // ── Commands ───────────────────────────────────────────

  bot.command('start', (ctx) => {
    ctx.reply(
      `BumbleBee — Impact Funding on XRPL\n\n` +
      `5 Bees manage your campaign from submission to completion.\n\n` +
      `NGO commands:\n` +
      `  /campaign — submit a funding request\n` +
      `  /submit <num> — send evidence for a milestone\n` +
      `  /mystatus — check your campaigns\n\n` +
      `Admin:\n` +
      `  /pool — treasury balance\n\n` +
      `Or just chat naturally.`
    );
  });

  bot.command('help', (ctx) => {
    ctx.reply(
      `/campaign — start a new campaign\n` +
      `/submit 1 — submit evidence for milestone 1 (attach files)\n` +
      `/mystatus — view your campaigns\n` +
      `/pool — treasury status\n\n` +
      `You can also just describe your project and I'll guide you.`
    );
  });

  bot.command('campaign', (ctx) => {
    const userId = ctx.from.id.toString();
    userState.set(userId, { mode: 'campaign_intake' });
    ctx.reply('Tell me about your project. What does your organization do, where, and how much funding do you need?');
  });

  bot.command('mystatus', (ctx) => {
    const userId = ctx.from.id.toString();
    const status = handleMyStatus(userId);
    ctx.reply(status);
  });

  bot.command('pool', async (ctx) => {
    const status = await getPoolStatus();
    ctx.reply(status);
  });

  bot.command('submit', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    const milestoneNum = parseInt(args[1]);

    if (!milestoneNum || milestoneNum < 1 || milestoneNum > 3) {
      ctx.reply('Usage: /submit <milestone_number>\nExample: /submit 1\n\nAttach photos or documents with the command.');
      return;
    }

    // Find the user's active campaign
    const campaigns = getCampaignsByNgo(userId) as Campaign[];
    const activeCampaign = campaigns.find(c => ['funded', 'in_progress'].includes(c.status));

    if (!activeCampaign) {
      ctx.reply('No active campaign found. Submit a campaign first with /campaign');
      return;
    }

    userState.set(userId, { mode: 'awaiting_evidence', campaignId: activeCampaign.id, context: milestoneNum.toString() });
    ctx.reply(`Send your evidence for milestone ${milestoneNum} now. Attach photos, invoices, or documents.`);
  });

  // ── File/Photo handler ─────────────────────────────────

  bot.on(message('photo'), async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userState.get(userId);

    if (state?.mode === 'awaiting_evidence' && state.campaignId && state.context) {
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const milestoneNum = parseInt(state.context);

      const result = handleSubmitEvidence(state.campaignId, milestoneNum, [fileId]);
      ctx.reply(result.message);

      if (result.milestone) {
        // Auto-trigger VerifierBee review
        const review = reviewEvidence(state.campaignId, milestoneNum);
        if (review.hasEvidence) {
          // Auto-approve for demo (in production, VerifierBee would do real review via Gemini)
          const approveResult = approveMilestone(state.campaignId, milestoneNum);

          if (approveResult === 'MILESTONE_APPROVED:ALL_COMPLETE') {
            // Release escrow
            const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
            ctx.reply(releaseMsg);

            // All milestones done — trigger ReviewerBee
            const completionMsg = await completeCampaign(state.campaignId);
            ctx.reply(completionMsg);
          } else {
            // Release this milestone's escrow
            const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
            ctx.reply(`Milestone ${milestoneNum} verified.\n${releaseMsg}`);
          }
        }
      }

      userState.delete(userId);
    } else {
      ctx.reply('Got a photo. To submit evidence, use /submit <milestone_number> first, then attach files.');
    }
  });

  bot.on(message('document'), async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userState.get(userId);

    if (state?.mode === 'awaiting_evidence' && state.campaignId && state.context) {
      const fileId = ctx.message.document.file_id;
      const milestoneNum = parseInt(state.context);

      const result = handleSubmitEvidence(state.campaignId, milestoneNum, [fileId]);
      ctx.reply(result.message);

      if (result.milestone) {
        const review = reviewEvidence(state.campaignId, milestoneNum);
        if (review.hasEvidence) {
          const approveResult = approveMilestone(state.campaignId, milestoneNum);

          if (approveResult === 'MILESTONE_APPROVED:ALL_COMPLETE') {
            const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
            ctx.reply(releaseMsg);
            const completionMsg = await completeCampaign(state.campaignId);
            ctx.reply(completionMsg);
          } else {
            const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
            ctx.reply(`Milestone ${milestoneNum} verified.\n${releaseMsg}`);
          }
        }
      }

      userState.delete(userId);
    } else {
      ctx.reply('Got a document. To submit evidence, use /submit <milestone_number> first.');
    }
  });

  // ── Text handler (natural chat + campaign intake) ──────

  bot.on(message('text'), async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    const state = userState.get(userId);

    console.log(`[MSG] ${userId}: "${text.slice(0, 80)}"`);

    try {
      // Campaign intake mode
      if (state?.mode === 'campaign_intake') {
        const context = state.context || '';
        const fullContext = context ? `${context}\nUser: ${text}` : text;

        const response = await askGemini(getFacilitatorSystemPrompt(), fullContext);

        // Check if Gemini extracted campaign data
        const campaignData = parseCampaignFromGemini(response);
        if (campaignData) {
          const result = handleCampaignCreate(campaignData, userId);
          userState.delete(userId);

          // Auto-trigger EvaluatorBee
          const evalResult = evaluateCampaign(result.campaignId);
          ctx.reply(result.message);

          if (evalResult.approved) {
            ctx.reply(evalResult.message);

            // Auto-trigger TreasuryBee
            const fundResult = await allocateAndCreateEscrows(result.campaignId);
            ctx.reply(fundResult);
          } else {
            ctx.reply(evalResult.message);
          }
        } else {
          // Gemini is still asking questions — strip any CAMPAIGN_DATA artifacts
          const cleanResponse = response.replace(/CAMPAIGN_DATA:\{.*\}/g, '').trim();
          userState.set(userId, { mode: 'campaign_intake', context: fullContext + '\nAssistant: ' + cleanResponse });
          ctx.reply(cleanResponse);
        }
        return;
      }

      // Natural chat — detect intent
      const lower = text.toLowerCase();

      if (lower.includes('campaign') || lower.includes('funding') || lower.includes('project') || lower.includes('program')) {
        userState.set(userId, { mode: 'campaign_intake', context: text });
        const response = await askGemini(getFacilitatorSystemPrompt(), text);
        const campaignData = parseCampaignFromGemini(response);
        if (campaignData) {
          const result = handleCampaignCreate(campaignData, userId);
          userState.delete(userId);
          const evalResult = evaluateCampaign(result.campaignId);
          ctx.reply(result.message);
          if (evalResult.approved) {
            ctx.reply(evalResult.message);
            const fundResult = await allocateAndCreateEscrows(result.campaignId);
            ctx.reply(fundResult);
          } else {
            ctx.reply(evalResult.message);
          }
        } else {
          const cleanResponse = response.replace(/CAMPAIGN_DATA:\{.*\}/g, '').trim();
          userState.set(userId, { mode: 'campaign_intake', context: text + '\nAssistant: ' + cleanResponse });
          ctx.reply(cleanResponse);
        }
        return;
      }

      // General companion chat
      const companionPrompt = `You are BumbleBee, an impact funding assistant on XRPL. Be direct and helpful. Short messages. If someone describes a project or asks about funding, suggest /campaign. If they want to check status, suggest /mystatus. If they ask about the treasury, suggest /pool.`;
      const response = await askGemini(companionPrompt, text);
      ctx.reply(response);

    } catch (err: any) {
      console.error('[BOT]', err.message);
      ctx.reply('Something went wrong. Try /help');
    }
  });

  bot.launch().then(() => {
    console.log('   Telegram: polling started');
  }).catch((err) => {
    console.error('   Telegram error:', err.message);
  });

  // 6. Spawn events
  const beeNames: BeeName[] = ['evaluator', 'treasury', 'facilitator', 'verifier', 'reviewer'];
  for (const bee of beeNames) {
    emitEvent({ agent: bee, type: 'spawn', message: `${bee} ready`, timestamp: Date.now() });
  }

  console.log(`\n BumbleBee is live!`);
  console.log(`   MCP: ${mcpReady ? 'Connected' : 'Not available (using direct xrpl.js)'}`);
  console.log(`   A2A: http://localhost:3002/.well-known/agent.json\n`);

  // 7. Milestone deadline checker (runs every hour)
  setInterval(async () => {
    try {
      const fundedCampaigns = (getCampaignsByStatus('funded') as Campaign[]).concat(getCampaignsByStatus('in_progress') as Campaign[]);
      for (const campaign of fundedCampaigns) {
        const milestones = getMilestones(campaign.id) as Milestone[];
        const activeMilestone = milestones.find(m => m.status === 'active');
        if (!activeMilestone || !campaign.funded_at) continue;

        const daysSinceFunded = (Date.now() - new Date(campaign.funded_at).getTime()) / (1000 * 60 * 60 * 24);

        // Reminder at day 5
        if (daysSinceFunded >= 5 && daysSinceFunded < 7) {
          console.log(`[DEADLINE] Reminder: ${campaign.title} M${activeMilestone.number} due in ${(7 - daysSinceFunded).toFixed(1)} days`);
        }

        // Expire at day 7
        if (daysSinceFunded >= 7) {
          console.log(`[DEADLINE] Expired: ${campaign.title} M${activeMilestone.number}`);
          updateMilestone(activeMilestone.id, { status: 'expired' });
          const cancelMsg = await cancelCampaignEscrows(campaign.id);
          console.log(`[DEADLINE] ${cancelMsg}`);
        }
      }
    } catch (err: any) {
      console.error('[DEADLINE]', err.message);
    }
  }, 60 * 60 * 1000); // Every hour

  process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
}

main().catch(console.error);
