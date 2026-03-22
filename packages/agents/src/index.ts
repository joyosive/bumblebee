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
import { initBridgeServer, emitEvent } from './bridge/server.js';
import { initAllMCP, mcpCreateDID, isMCPConnected } from './services/mcpClient.js';
import { startA2AServer } from './a2a/agentCards.js';

import { getFacilitatorSystemPrompt, parseCampaignFromGemini, handleCampaignCreate, handleSubmitEvidence, handleMyStatus } from './bees/facilitator.js';
import { evaluateCampaign } from './bees/evaluator.js';
import { allocateAndCreateEscrows, releaseMilestoneEscrow, cancelCampaignEscrows, getPoolStatus, ensureRLUSDTrustlines } from './bees/treasury.js';
import { reviewEvidence, approveMilestone, rejectMilestone, verifyEvidenceWithLLM } from './bees/verifier.js';
import { completeCampaign } from './bees/reviewer.js';
import { getCampaignsByNgo, getCampaignsByStatus, getMilestones, getMilestone, updateMilestone } from './db/database.js';
import type { Campaign, Milestone, BeeName } from './data/types.js';

// ── LLM (Groq primary, Gemini fallback) ─────────────────────────────

const GROQ_KEYS = (process.env.GROQ_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
let groqKeyIndex = 0;

async function askGroq(systemPrompt: string, userMessage: string): Promise<string | null> {
  if (GROQ_KEYS.length === 0) return null;
  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const key = GROQ_KEYS[groqKeyIndex % GROQ_KEYS.length];
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json() as any;
      return data.choices?.[0]?.message?.content || null;
    } catch (err: any) {
      console.log(`[GROQ] Key ${groqKeyIndex + 1} failed:`, err.message?.slice(0, 60));
      groqKeyIndex = (groqKeyIndex + 1) % GROQ_KEYS.length;
    }
  }
  return null;
}

const GEMINI_KEYS = (process.env.GOOGLE_API_KEYS || process.env.GOOGLE_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
let currentKeyIndex = 0;

// Track conversation state per user
interface UserState {
  mode: string;
  campaignId?: string;
  context?: string;
  step?: number;
  draft?: Record<string, any>;
}
const userState = new Map<string, UserState>();

// Campaign intake prompt — one message, Gemini or manual parse
const CAMPAIGN_PROMPT = `Tell me about your campaign in one message. Include:\n- Organization name\n- Campaign title\n- What it does\n- Sector (Education, Healthcare, WASH, Agriculture, Energy, Environment)\n- Country\n- Amount needed in XRP`;

async function askLLM(systemPrompt: string, userMessage: string): Promise<string | null> {
  // Try Groq first (fast, reliable free tier)
  const groqResponse = await askGroq(systemPrompt, userMessage);
  if (groqResponse) return groqResponse;

  // Fallback to Gemini with key rotation
  for (let attempt = 0; attempt < Math.max(GEMINI_KEYS.length, 1); attempt++) {
    try {
      const key = GEMINI_KEYS[currentKeyIndex % GEMINI_KEYS.length];
      if (!key) break;
      const ai = new GoogleGenerativeAI(key);
      const model = ai.getGenerativeModel({ model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash' });
      const result = await model.generateContent(`${systemPrompt}\n\nUser: ${userMessage}`);
      return result.response.text();
    } catch (err: any) {
      console.log(`[GEMINI] Key ${currentKeyIndex + 1} failed:`, err.message?.slice(0, 60));
      currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n BumbleBee v2 — Campaign-Based Milestone Funding\n');

  // 1. Database
  initDB();
  console.log('   DB: SQLite initialized');

  // 2. Infrastructure
  initBridgeServer();
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

  // 4b. RLUSD TrustLines (if configured)
  if (process.env.RLUSD_ISSUER) {
    ensureRLUSDTrustlines().then(ok => {
      console.log(`   RLUSD: ${ok ? 'Trustlines ready' : 'Not configured'}`);
    }).catch(() => {
      console.log('   RLUSD: Setup skipped (issuer not available)');
    });
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
    ctx.reply(CAMPAIGN_PROMPT);
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
      ctx.reply('Usage: /submit <milestone_number>\nExample: /submit 2\n\nThen attach photos or documents in the next message.');
      return;
    }

    // Find the user's active campaign
    const campaigns = getCampaignsByNgo(userId) as Campaign[];
    const activeCampaign = campaigns.find(c => ['funded', 'in_progress'].includes(c.status));

    if (!activeCampaign) {
      ctx.reply('No active campaign found. Submit a campaign first with /campaign');
      return;
    }

    // Check milestone status before setting state
    const milestone = getMilestone(activeCampaign.id, milestoneNum) as Milestone | undefined;
    if (!milestone) {
      ctx.reply(`Milestone ${milestoneNum} not found.`);
      return;
    }
    if (milestone.status === 'completed') {
      ctx.reply(`Milestone ${milestoneNum} ("${milestone.title}") is already completed.`);
      return;
    }
    if (milestone.status === 'pending') {
      ctx.reply(`Milestone ${milestoneNum} ("${milestone.title}") isn't active yet. Complete the earlier milestones first.`);
      return;
    }

    userState.set(userId, { mode: 'awaiting_evidence', campaignId: activeCampaign.id, context: milestoneNum.toString() });
    ctx.reply(`Send your evidence for milestone ${milestoneNum} ("${milestone.title}") now.\nAttach photos, invoices, or documents.`);
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
        // Trigger VerifierBee LLM review
        const review = reviewEvidence(state.campaignId, milestoneNum);
        if (review.hasEvidence && review.campaign && review.milestone) {
          const verdict = await verifyEvidenceWithLLM(review.campaign, review.milestone, review.fileCount, askLLM);
          ctx.reply(`[VerifierBee] Evidence analysis (${verdict.confidence}% confidence):\n${verdict.reasoning}`);

          if (verdict.approved) {
            const approveResult = approveMilestone(state.campaignId, milestoneNum);

            if (approveResult === 'MILESTONE_APPROVED:ALL_COMPLETE') {
              const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
              ctx.reply(releaseMsg);
              const completionMsg = await completeCampaign(state.campaignId);
              ctx.reply(completionMsg);
            } else {
              const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
              ctx.reply(`[VerifierBee] Milestone ${milestoneNum} approved.\n\n${releaseMsg}`);
            }
          } else {
            const rejectResult = rejectMilestone(state.campaignId, milestoneNum, verdict.feedback);
            ctx.reply(`[VerifierBee] ${rejectResult}`);
          }
        }
      }

      userState.delete(userId);
    } else {
      // Auto-detect /submit N in caption or find active milestone
      const caption = (ctx.message as any).caption || '';
      const captionMatch = caption.match(/\/submit\s+(\d)/);
      const campaigns = getCampaignsByNgo(userId) as Campaign[];
      const activeCampaign = campaigns.find(c => ['funded', 'in_progress'].includes(c.status));

      if (activeCampaign) {
        let milestoneNum: number | null = null;
        if (captionMatch) {
          milestoneNum = parseInt(captionMatch[1]);
        } else {
          // Auto-detect: find the active or revision_needed milestone
          const milestones = getMilestones(activeCampaign.id) as Milestone[];
          const active = milestones.find(m => m.status === 'active' || m.status === 'revision_needed');
          if (active) milestoneNum = active.number;
        }

        if (milestoneNum) {
          const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
          userState.set(userId, { mode: 'awaiting_evidence', campaignId: activeCampaign.id, context: milestoneNum.toString() });
          // Re-trigger by emitting to self — simpler: just inline the evidence flow
          const result = handleSubmitEvidence(activeCampaign.id, milestoneNum, [fileId]);
          ctx.reply(result.message);
          if (result.milestone) {
            const review = reviewEvidence(activeCampaign.id, milestoneNum);
            if (review.hasEvidence && review.campaign && review.milestone) {
              const verdict = await verifyEvidenceWithLLM(review.campaign, review.milestone, review.fileCount, askLLM);
              ctx.reply(`[VerifierBee] Evidence analysis (${verdict.confidence}% confidence):\n${verdict.reasoning}`);
              if (verdict.approved) {
                const approveResult = approveMilestone(activeCampaign.id, milestoneNum);
                if (approveResult === 'MILESTONE_APPROVED:ALL_COMPLETE') {
                  const releaseMsg = await releaseMilestoneEscrow(activeCampaign.id, milestoneNum);
                  ctx.reply(releaseMsg);
                  const completionMsg = await completeCampaign(activeCampaign.id);
                  ctx.reply(completionMsg);
                } else {
                  const releaseMsg = await releaseMilestoneEscrow(activeCampaign.id, milestoneNum);
                  ctx.reply(`[VerifierBee] Milestone ${milestoneNum} approved.\n\n${releaseMsg}`);
                }
              } else {
                const rejectResult = rejectMilestone(activeCampaign.id, milestoneNum, verdict.feedback);
                ctx.reply(`[VerifierBee] ${rejectResult}`);
              }
            }
          }
          userState.delete(userId);
          return;
        }
      }
      ctx.reply('Got a photo. To submit evidence, use /submit <milestone_number> first, then attach files.');
    }
  });

  bot.on(message('document'), async (ctx) => {
    const userId = ctx.from.id.toString();
    let state = userState.get(userId);

    // Auto-detect /submit N in document caption
    if (!state?.mode && ctx.message.caption) {
      const captionMatch = ctx.message.caption.match(/\/submit\s+(\d)/);
      if (captionMatch) {
        const campaigns = getCampaignsByNgo(userId) as Campaign[];
        const activeCampaign = campaigns.find(c => ['funded', 'in_progress'].includes(c.status));
        if (activeCampaign) {
          state = { mode: 'awaiting_evidence', campaignId: activeCampaign.id, context: captionMatch[1] };
          userState.set(userId, state);
        }
      }
    }

    // If still no state, auto-detect active milestone
    if (!state?.mode) {
      const campaigns = getCampaignsByNgo(userId) as Campaign[];
      const activeCampaign = campaigns.find(c => ['funded', 'in_progress'].includes(c.status));
      if (activeCampaign) {
        const milestones = getMilestones(activeCampaign.id) as Milestone[];
        const active = milestones.find(m => m.status === 'active' || m.status === 'revision_needed');
        if (active) {
          state = { mode: 'awaiting_evidence', campaignId: activeCampaign.id, context: active.number.toString() };
          userState.set(userId, state);
        }
      }
    }

    if (state?.mode === 'awaiting_evidence' && state.campaignId && state.context) {
      const fileId = ctx.message.document.file_id;
      const milestoneNum = parseInt(state.context);

      const result = handleSubmitEvidence(state.campaignId, milestoneNum, [fileId]);
      ctx.reply(result.message);

      if (result.milestone) {
        const review = reviewEvidence(state.campaignId, milestoneNum);
        if (review.hasEvidence && review.campaign && review.milestone) {
          const verdict = await verifyEvidenceWithLLM(review.campaign, review.milestone, review.fileCount, askLLM);
          ctx.reply(`[VerifierBee] Evidence analysis (${verdict.confidence}% confidence):\n${verdict.reasoning}`);

          if (verdict.approved) {
            const approveResult = approveMilestone(state.campaignId, milestoneNum);

            if (approveResult === 'MILESTONE_APPROVED:ALL_COMPLETE') {
              const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
              ctx.reply(releaseMsg);
              const completionMsg = await completeCampaign(state.campaignId);
              ctx.reply(completionMsg);
            } else {
              const releaseMsg = await releaseMilestoneEscrow(state.campaignId, milestoneNum);
              ctx.reply(`[VerifierBee] Milestone ${milestoneNum} approved.\n\n${releaseMsg}`);
            }
          } else {
            const rejectResult = rejectMilestone(state.campaignId, milestoneNum, verdict.feedback);
            ctx.reply(`[VerifierBee] ${rejectResult}`);
          }
        }
      }

      userState.delete(userId);
    } else {
      ctx.reply('Got a document. To submit evidence, use /submit <milestone_number> first.');
    }
  });

  // ── Text handler ──────

  bot.on(message('text'), async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    const state = userState.get(userId);
    const lower = text.toLowerCase();

    console.log(`[MSG] ${userId}: "${text.slice(0, 80)}"`);

    try {
      // Campaign intake mode
      if (state?.mode === 'campaign_intake') {
        // Cancel words
        if (['no', 'cancel', 'stop', 'exit', 'back', 'nevermind'].includes(lower.trim())) {
          userState.delete(userId);
          ctx.reply('Cancelled. Let me know when you want to start.');
          return;
        }

        // Need minimum info — check if message has enough substance
        if (text.trim().length < 20) {
          ctx.reply('Need more detail. Describe your org, what the campaign does, sector, country, and amount in XRP — all in one message.');
          return;
        }

        // Try LLM extraction
        const llmResponse = await askLLM(getFacilitatorSystemPrompt(), text);
        let campaignData = llmResponse ? parseCampaignFromGemini(llmResponse) : null;

        // Fallback: line-by-line extraction
        if (!campaignData) {
          const lines = text.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
          const sectors = ['Education', 'Healthcare', 'WASH', 'Agriculture', 'Energy', 'Environment'];
          const foundSector = sectors.find(s => lower.includes(s.toLowerCase())) || 'Education';
          const amountMatch = text.match(/(\d+)\s*XRP/i);
          const amount = amountMatch ? parseFloat(amountMatch[1]) : 3;

          // Try to extract from labeled lines (e.g. "Org name is X" or "Organization name: X")
          const extract = (keys: string[]): string => {
            for (const line of lines) {
              const ll = line.toLowerCase();
              if (keys.some(k => ll.includes(k))) {
                return line.replace(/^.*?(?:is|:)\s*/i, '').trim() || line;
              }
            }
            return '';
          };

          const orgName = extract(['org', 'organization']) || lines[0] || 'NGO';
          const title = extract(['campaign', 'title', 'name']) || lines[1] || text.slice(0, 60);
          const country = extract(['country', 'region', 'location']) || 'Global';

          campaignData = {
            ngo_name: orgName.slice(0, 60),
            title: title.slice(0, 60),
            description: text,
            sector: foundSector,
            country,
            funding_goal: Math.min(amount, 10),
          };
        }

        const result = handleCampaignCreate(campaignData, userId);
        userState.delete(userId);

        const evalResult = await evaluateCampaign(result.campaignId, askLLM);
        ctx.reply(result.message);

        if (evalResult.approved) {
          ctx.reply(evalResult.message);
          const fundResult = await allocateAndCreateEscrows(result.campaignId);
          ctx.reply(fundResult);
        } else {
          ctx.reply(evalResult.message);
        }
        return;
      }

      // Check if user has an active campaign — evidence routing takes priority
      const userCampaigns = getCampaignsByNgo(userId) as Campaign[];
      const activeCampaign = userCampaigns.find(c => ['funded', 'in_progress'].includes(c.status));

      if (activeCampaign && (/\b(done|finished|complete|submit|evidence|milestone|ready)\b/.test(lower) || /^(ok|okay|next|yes|yep|sure)$/i.test(lower.trim()) || /\bm\s*\d/i.test(lower))) {
        const milestones = getMilestones(activeCampaign.id) as Milestone[];
        const activeMilestone = milestones.find(m => m.status === 'active' || m.status === 'revision_needed');
        if (activeMilestone) {
          userState.set(userId, { mode: 'awaiting_evidence', campaignId: activeCampaign.id, context: activeMilestone.number.toString() });
          ctx.reply(`[FacilitatorBee] Ready for milestone ${activeMilestone.number}: "${activeMilestone.title}"\n\nAttach a photo or document as evidence.`);
        } else {
          const allDone = milestones.every(m => m.status === 'completed');
          ctx.reply(allDone ? 'All milestones completed. Campaign is done.' : 'No active milestone right now. Use /mystatus to check.');
        }
        return;
      }

      // Intent: start a new campaign
      if (lower.includes('campaign') || lower.includes('grant') || lower.includes('funding') || lower.includes('ngo') || lower.includes('initiative')) {
        userState.set(userId, { mode: 'campaign_intake' });
        ctx.reply(CAMPAIGN_PROMPT);
        return;
      }

      // General chat — try LLM, smart fallback if unavailable
      const companionPrompt = `You are BumbleBee, an impact funding assistant on XRPL. Be direct, short, no emojis. If someone says thanks or the campaign is done, congratulate them briefly. If someone describes a project, suggest /campaign. Status check: /mystatus. Do NOT suggest spending more money or starting new campaigns unprompted.`;
      const response = await askLLM(companionPrompt, text);
      if (response) {
        ctx.reply(response);
      } else if (lower.includes('thank') || lower.includes('great') || lower.includes('awesome')) {
        ctx.reply('Glad to help. Use /mystatus to review your campaigns anytime.');
      } else if (lower.includes('hi') || lower.includes('hey') || lower.includes('hello') || lower.includes('sup') || lower.includes('yo')) {
        ctx.reply('Hey. Ready when you are.\n\n/campaign — submit a funding request\n/mystatus — check progress');
      } else if (lower.includes('help') || lower.includes('what') || lower.includes('how')) {
        ctx.reply('I manage impact funding on XRPL. NGOs submit campaigns, I evaluate them, set milestones, and release funds as you deliver.\n\nStart with /campaign');
      } else {
        ctx.reply('Not sure what you mean. Try /campaign to get started or /help for options.');
      }

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
  console.log(`   RLUSD: ${process.env.RLUSD_ISSUER ? 'Enabled (dual-currency)' : 'XRP only'}`);
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
