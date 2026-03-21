// packages/agents/src/bees/facilitator.ts
import { createCampaign, getCampaignsByNgo, getMilestones, getMilestone, updateMilestone } from '../db/database.js';
import { emitEvent } from '../bridge/websocket.js';
import type { Campaign, Milestone } from '../data/types.js';

const SYSTEM_PROMPT = `You are FacilitatorBee, part of the BumbleBee swarm. You help NGOs submit funding campaigns. Extract these details from the conversation:
- Organization name
- Campaign title
- What they do (description)
- Sector (Education, Healthcare, WASH, Agriculture, Energy, Environment, or other)
- Country/region
- Funding goal in XRP (suggest 3 XRP for small campaigns)

Be direct and short. No fluff. Ask for missing details one at a time. When you have all details, respond with EXACTLY this JSON block on its own line:
CAMPAIGN_DATA:{"ngo_name":"...","title":"...","description":"...","sector":"...","country":"...","funding_goal":3}

Do not wrap in code blocks. Just the CAMPAIGN_DATA: prefix followed by JSON.`;

export function getFacilitatorSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function parseCampaignFromGemini(response: string): {
  ngo_name: string; title: string; description: string;
  sector: string; country: string; funding_goal: number;
} | null {
  const match = response.match(/CAMPAIGN_DATA:(\{.*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function handleCampaignCreate(data: {
  ngo_name: string; title: string; description: string;
  sector: string; country: string; funding_goal: number;
}, telegramId: string): { campaignId: string; message: string } {
  emitEvent({ agent: 'facilitator', type: 'work', message: `New campaign: ${data.title}`, timestamp: Date.now() });

  const campaignId = createCampaign({
    ...data,
    ngo_telegram_id: telegramId,
  });

  emitEvent({ agent: 'facilitator', type: 'complete', message: `Campaign stored: ${campaignId}`, timestamp: Date.now() });

  return {
    campaignId,
    message: `[FacilitatorBee] Campaign received.\n\n"${data.title}"\n${data.sector} | ${data.country}\nGoal: ${data.funding_goal} XRP\n\nPassing to EvaluatorBee...`,
  };
}

export function handleSubmitEvidence(
  campaignId: string, milestoneNum: number, fileIds: string[],
): { message: string; milestone: any } | { message: string; milestone: null } {
  const milestone = getMilestone(campaignId, milestoneNum) as Milestone | undefined;
  if (!milestone) return { message: `No milestone ${milestoneNum} found for this campaign.`, milestone: null };

  if (milestone.status !== 'active' && milestone.status !== 'revision_needed') {
    return { message: `Milestone ${milestoneNum} is ${milestone.status}. Can't submit evidence right now.`, milestone: null };
  }

  const existingIds = milestone.evidence_file_ids ? JSON.parse(milestone.evidence_file_ids) : [];
  const allIds = [...existingIds, ...fileIds];

  updateMilestone(milestone.id, {
    evidence_file_ids: JSON.stringify(allIds),
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  });

  emitEvent({ agent: 'facilitator', type: 'work', message: `Evidence submitted for milestone ${milestoneNum}`, timestamp: Date.now() });

  return {
    message: `[FacilitatorBee] Evidence received for milestone ${milestoneNum}. ${allIds.length} file(s) attached.\n\nPassing to VerifierBee...`,
    milestone: { ...milestone, status: 'submitted' },
  };
}

export function handleMyStatus(telegramId: string): string {
  const campaigns = getCampaignsByNgo(telegramId) as Campaign[];
  if (campaigns.length === 0) return '[FacilitatorBee] No campaigns yet. Send /campaign to start one.';

  const list = campaigns.map(c => {
    const milestones = getMilestones(c.id) as Milestone[];
    const msStatus = milestones.map(m => {
      const icon = m.status === 'completed' ? '[done]' : m.status === 'active' ? '[active]' : m.status === 'submitted' ? '[reviewing]' : '[pending]';
      return `  M${m.number} ${icon} ${m.title}`;
    }).join('\n');
    return `"${c.title}" [${c.status}]\n${c.sector} | ${c.country} | ${c.funding_goal} XRP\n${msStatus}`;
  }).join('\n\n');

  return `[FacilitatorBee] Your campaigns:\n\n${list}`;
}
