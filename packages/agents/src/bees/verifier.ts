// packages/agents/src/bees/verifier.ts
import { getMilestone, updateMilestone, getMilestones, updateCampaignStatus, getCampaign } from '../db/database.js';
import { emitEvent } from '../bridge/websocket.js';
import type { Campaign, Milestone } from '../data/types.js';

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
