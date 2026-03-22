// packages/agents/src/bees/evaluator.ts
import { getCampaign, updateCampaignStatus, createMilestones } from '../db/database.js';
import { emitEvent } from '../bridge/server.js';
import type { Campaign } from '../data/types.js';

// ── LLM Evaluation Prompt ─────────────────────────────────────────

const EVAL_SYSTEM_PROMPT = `You are EvaluatorBee, an AI agent that evaluates social impact campaign proposals for funding on XRPL. You score campaigns 0-100 and generate 3 tailored milestones.

Evaluate on these criteria:
- Problem clarity (0-25): Is there a real, specific problem being addressed?
- Feasibility (0-25): Can this be achieved with the requested funding and timeline?
- Impact potential (0-25): How many people benefit? How measurable is the outcome?
- Sector alignment (0-25): Does it fit a clear social impact sector?

Also generate 3 specific milestones tailored to THIS campaign (not generic templates).

Respond with EXACTLY this JSON format:
EVALUATION:{"score":75,"reasoning":"one paragraph explanation","milestones":[{"title":"...","description":"..."},{"title":"...","description":"..."},{"title":"...","description":"..."}]}

Be fair. Most legitimate campaigns should score 55-85. Reject only clearly unviable proposals (<60).`;

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

export async function evaluateCampaign(
  campaignId: string,
  askLLM?: (system: string, user: string) => Promise<string | null>,
): Promise<{
  approved: boolean;
  score: number;
  message: string;
}> {
  const campaign = getCampaign(campaignId) as Campaign | undefined;
  if (!campaign) return { approved: false, score: 0, message: 'Campaign not found.' };

  emitEvent({ agent: 'evaluator', type: 'work', message: `Evaluating: ${campaign.title}`, timestamp: Date.now() });

  let score = 0;
  let reasoning = '';
  let milestones: { title: string; description: string }[] = [];

  // Try LLM evaluation first
  if (askLLM) {
    try {
      const userPrompt = `Campaign: "${campaign.title}"
Organization: ${campaign.ngo_name}
Sector: ${campaign.sector}
Country: ${campaign.country}
Funding requested: ${campaign.funding_goal} XRP
Description: ${campaign.description}`;

      const response = await askLLM(EVAL_SYSTEM_PROMPT, userPrompt);
      if (response) {
        // Try multiple JSON extraction patterns (LLMs wrap in various formats)
        let jsonStr: string | null = null;
        const evalMatch = response.match(/EVALUATION:\s*(\{[\s\S]*\})/);
        if (evalMatch) jsonStr = evalMatch[1];
        if (!jsonStr) {
          const codeBlock = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (codeBlock) jsonStr = codeBlock[1];
        }
        if (!jsonStr) {
          const rawJson = response.match(/(\{[\s\S]*"score"[\s\S]*"milestones"[\s\S]*\})/);
          if (rawJson) jsonStr = rawJson[1];
        }
        if (jsonStr) {
          // Clean common LLM artifacts
          jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          // Remove control characters that break JSON
          jsonStr = jsonStr.replace(/[\x00-\x1f\x7f]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? ' ' : '');
          // Fix unescaped newlines inside strings
          jsonStr = jsonStr.replace(/\n/g, ' ');
          const parsed = JSON.parse(jsonStr);
          score = Math.min(Math.max(parsed.score || 0, 0), 100);
          reasoning = parsed.reasoning || '';
          if (Array.isArray(parsed.milestones) && parsed.milestones.length === 3) {
            milestones = parsed.milestones;
          }
          emitEvent({ agent: 'evaluator', type: 'work', message: `LLM scored: ${score}/100`, timestamp: Date.now() });
        }
      }
    } catch (err: any) {
      console.log(`[EVALUATOR] LLM evaluation failed: ${err.message?.slice(0, 60)}`);
    }
  }

  // Fallback to heuristic scoring if LLM failed
  if (score === 0) {
    score = 50;
    if (campaign.description.length > 50) score += 15;
    if (campaign.description.length > 100) score += 10;
    if (['Education', 'Healthcare', 'WASH', 'Agriculture', 'Energy', 'Environment'].includes(campaign.sector)) score += 15;
    if (campaign.funding_goal > 0 && campaign.funding_goal <= 10) score += 10;
    score = Math.min(score, 100);
    reasoning = 'Evaluated using heuristic scoring (LLM unavailable).';
  }

  // Fallback to sector templates if LLM didn't generate milestones
  if (milestones.length !== 3) {
    milestones = SECTOR_TEMPLATES[campaign.sector] || SECTOR_TEMPLATES.default;
  }

  const approved = score >= 60;

  if (approved) {
    createMilestones(campaignId, milestones);
    updateCampaignStatus(campaignId, 'approved', { evaluation_score: score });

    emitEvent({ agent: 'evaluator', type: 'complete', message: `Approved: ${campaign.title} (${score}/100)`, timestamp: Date.now() });

    const reasoningLine = reasoning ? `\n\n${reasoning}\n` : '\n';

    return {
      approved: true,
      score,
      message: `[EvaluatorBee] Approved. Score: ${score}/100.${reasoningLine}\n3 milestones set:\n${milestones.map((t, i) => `  ${i + 1}. ${t.title}`).join('\n')}\n\nPassing to TreasuryBee for fund allocation...`,
    };
  } else {
    updateCampaignStatus(campaignId, 'rejected', { evaluation_score: score });
    emitEvent({ agent: 'evaluator', type: 'complete', message: `Rejected: ${campaign.title} (${score}/100)`, timestamp: Date.now() });

    return {
      approved: false,
      score,
      message: `[EvaluatorBee] Not approved (score: ${score}/100).\n${reasoning || 'Need more detail in the campaign description and a clear sector alignment.'}\n\nResubmit with /campaign.`,
    };
  }
}
