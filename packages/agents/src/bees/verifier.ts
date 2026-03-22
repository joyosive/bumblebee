// packages/agents/src/bees/verifier.ts
import { getMilestone, updateMilestone, getMilestones, updateCampaignStatus, getCampaign } from '../db/database.js';
import { emitEvent } from '../bridge/server.js';
import type { Campaign, Milestone } from '../data/types.js';

// ── LLM Evidence Verification ─────────────────────────────────────

const VERIFY_SYSTEM_PROMPT = `You are VerifierBee, an AI agent that reviews evidence submitted by NGOs for milestone completion in social impact campaigns funded on XRPL.

You must evaluate whether the submitted evidence is sufficient to prove the milestone was completed. Consider:
1. Does the evidence type match what's expected? (photos of construction, receipts, reports, etc.)
2. Is the evidence count reasonable for the milestone scope?
3. Does the description of what was submitted align with the milestone requirements?

Respond with EXACTLY this JSON format:
VERDICT:{"approved":true|false,"confidence":0-100,"reasoning":"one sentence explanation","feedback":"actionable feedback if rejected, empty string if approved"}

Be fair but rigorous. Approve if evidence is reasonable. Reject only if clearly insufficient or mismatched.`;

export async function verifyEvidenceWithLLM(
  campaign: Campaign,
  milestone: Milestone,
  fileCount: number,
  askLLM: (system: string, user: string) => Promise<string | null>,
): Promise<{ approved: boolean; confidence: number; reasoning: string; feedback: string }> {
  emitEvent({ agent: 'verifier', type: 'work', message: `Analyzing evidence for M${milestone.number}: "${milestone.title}"`, timestamp: Date.now() });

  const userPrompt = `Campaign: "${campaign.title}" (${campaign.sector}, ${campaign.country})
Campaign goal: ${campaign.funding_goal} XRP
Milestone ${milestone.number}: "${milestone.title}"
Milestone description: "${milestone.description}"
Evidence submitted: ${fileCount} file(s) (photos/documents uploaded via Telegram)
Submission time: ${milestone.submitted_at || 'just now'}

Evaluate whether ${fileCount} evidence file(s) is sufficient for this milestone. Consider that for "${milestone.title}" in the ${campaign.sector} sector, typical evidence would include relevant photos, receipts, or reports.`;

  try {
    const response = await askLLM(VERIFY_SYSTEM_PROMPT, userPrompt);
    if (response) {
      const match = response.match(/VERDICT:(\{.*\})/);
      if (match) {
        const verdict = JSON.parse(match[1]);
        emitEvent({
          agent: 'verifier', type: 'work',
          message: `LLM verdict for M${milestone.number}: ${verdict.approved ? 'APPROVED' : 'NEEDS REVISION'} (${verdict.confidence}% confidence)`,
          timestamp: Date.now(),
        });
        return verdict;
      }
    }
  } catch (err: any) {
    console.log(`[VERIFIER] LLM analysis failed: ${err.message?.slice(0, 60)}`);
  }

  // Fallback: approve if evidence exists (graceful degradation)
  return {
    approved: fileCount > 0,
    confidence: 60,
    reasoning: fileCount > 0 ? 'Evidence files submitted (LLM unavailable, basic check passed)' : 'No evidence files found',
    feedback: fileCount > 0 ? '' : 'Please attach at least one photo or document as evidence.',
  };
}

// ── Core Functions ────────────────────────────────────────────────

export function reviewEvidence(campaignId: string, milestoneNum: number): {
  hasEvidence: boolean;
  fileCount: number;
  milestone: Milestone | null;
  campaign: Campaign | null;
} {
  const campaign = getCampaign(campaignId) as Campaign | undefined;
  const milestone = getMilestone(campaignId, milestoneNum) as Milestone | undefined;

  if (!campaign || !milestone) return { hasEvidence: false, fileCount: 0, milestone: null, campaign: null };

  const fileIds = milestone.evidence_file_ids ? JSON.parse(milestone.evidence_file_ids) : [];

  return {
    hasEvidence: fileIds.length > 0,
    fileCount: fileIds.length,
    milestone: milestone as Milestone,
    campaign: campaign as Campaign,
  };
}

export function approveMilestone(campaignId: string, milestoneNum: number): string {
  const milestone = getMilestone(campaignId, milestoneNum) as Milestone | undefined;
  if (!milestone) return 'Milestone not found.';

  if (milestone.status !== 'submitted') {
    return `Milestone ${milestoneNum} is ${milestone.status}, not submitted. Can't approve.`;
  }

  emitEvent({ agent: 'verifier', type: 'work', message: `Approving M${milestoneNum}`, timestamp: Date.now() });

  updateMilestone(milestone.id, {
    status: 'completed',
    approved_at: new Date().toISOString(),
  });

  // Activate next milestone if exists
  const allMilestones = getMilestones(campaignId) as Milestone[];
  const nextMilestone = allMilestones.find(m => m.number === milestoneNum + 1);
  if (nextMilestone && nextMilestone.status === 'pending') {
    updateMilestone(nextMilestone.id, { status: 'active' });
  }

  // Update campaign status
  const campaign = getCampaign(campaignId) as Campaign;
  if (campaign.status === 'funded') {
    updateCampaignStatus(campaignId, 'in_progress');
  }

  // Check if all milestones completed
  const updatedMilestones = getMilestones(campaignId) as Milestone[];
  const allCompleted = updatedMilestones.every(m => m.status === 'completed');

  emitEvent({ agent: 'verifier', type: 'complete', message: `M${milestoneNum} approved`, timestamp: Date.now() });

  if (allCompleted) {
    return `MILESTONE_APPROVED:ALL_COMPLETE`;
  }

  return `Milestone ${milestoneNum} approved. ${nextMilestone ? `Milestone ${milestoneNum + 1} is now active.` : 'All milestones reviewed.'}`;
}

export function rejectMilestone(campaignId: string, milestoneNum: number, feedback: string): string {
  const milestone = getMilestone(campaignId, milestoneNum) as Milestone | undefined;
  if (!milestone) return 'Milestone not found.';

  updateMilestone(milestone.id, {
    status: 'revision_needed',
    feedback,
  });

  emitEvent({ agent: 'verifier', type: 'work', message: `M${milestoneNum} needs revision`, timestamp: Date.now() });

  return `Milestone ${milestoneNum} needs revision.\nFeedback: ${feedback}\n\nResubmit with /submit ${milestoneNum}`;
}
