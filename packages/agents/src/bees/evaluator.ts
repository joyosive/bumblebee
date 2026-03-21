// packages/agents/src/bees/evaluator.ts
import { getCampaign, updateCampaignStatus, createMilestones } from '../db/database.js';
import { emitEvent } from '../bridge/websocket.js';
import type { Campaign } from '../data/types.js';

const SECTOR_TEMPLATES: Record<string, { title: string; description: string }[]> = {
  Education: [
    { title: 'Procure materials', description: 'Purchase educational supplies and materials' },
    { title: 'Deliver program', description: 'Execute the education program with beneficiaries' },
    { title: 'Report outcomes', description: 'Document results, attendance, and impact metrics' },
  ],
  Healthcare: [
    { title: 'Setup & supplies', description: 'Acquire medical supplies and setup facilities' },
    { title: 'Deliver services', description: 'Provide healthcare services to target population' },
    { title: 'Impact report', description: 'Document patients served, outcomes, and follow-ups' },
  ],
  default: [
    { title: 'Phase 1 setup', description: 'Initial procurement and groundwork' },
    { title: 'Phase 2 execution', description: 'Core program delivery' },
    { title: 'Phase 3 reporting', description: 'Document outcomes and impact evidence' },
  ],
};

export function evaluateCampaign(campaignId: string): {
  approved: boolean;
  score: number;
  message: string;
} {
  const campaign = getCampaign(campaignId) as Campaign | undefined;
  if (!campaign) return { approved: false, score: 0, message: 'Campaign not found.' };

  emitEvent({ agent: 'evaluator', type: 'work', message: `Evaluating: ${campaign.title}`, timestamp: Date.now() });

  // Simple scoring: description length, sector clarity, reasonable funding
  let score = 50; // base
  if (campaign.description.length > 50) score += 15;
  if (campaign.description.length > 100) score += 10;
  if (['Education', 'Healthcare', 'WASH', 'Agriculture', 'Energy', 'Environment'].includes(campaign.sector)) score += 15;
  if (campaign.funding_goal > 0 && campaign.funding_goal <= 10) score += 10;
  score = Math.min(score, 100);

  const approved = score >= 60;

  if (approved) {
    const templates = SECTOR_TEMPLATES[campaign.sector] || SECTOR_TEMPLATES.default;
    createMilestones(campaignId, templates);
    updateCampaignStatus(campaignId, 'approved', { evaluation_score: score });

    emitEvent({ agent: 'evaluator', type: 'complete', message: `Approved: ${campaign.title} (${score}/100)`, timestamp: Date.now() });

    return {
      approved: true,
      score,
      message: `[EvaluatorBee] Approved. Score: ${score}/100.\n\n3 milestones set:\n${templates.map((t, i) => `  ${i + 1}. ${t.title}`).join('\n')}\n\nPassing to TreasuryBee for fund allocation...`,
    };
  } else {
    updateCampaignStatus(campaignId, 'rejected', { evaluation_score: score });
    emitEvent({ agent: 'evaluator', type: 'complete', message: `Rejected: ${campaign.title} (${score}/100)`, timestamp: Date.now() });

    return {
      approved: false,
      score,
      message: `[EvaluatorBee] Not approved (score: ${score}/100). Need more detail in the campaign description and a clear sector alignment. Resubmit with /campaign.`,
    };
  }
}
