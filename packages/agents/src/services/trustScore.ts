import type { Milestone } from '../data/types.js';

export interface CampaignTrustScore {
  total: number;
  speed: number;      // 0-35: how fast milestones were completed
  quality: number;    // 0-35: approved on first submission vs revisions
  utilization: number; // 0-30: all milestones completed = full score
}

export function calculateCampaignTrustScore(
  milestones: Milestone[],
  fundedAt: string,
): CampaignTrustScore {
  const fundedDate = new Date(fundedAt).getTime();
  let speedScore = 0;
  let qualityScore = 0;
  let completedCount = 0;

  for (const m of milestones) {
    if (m.status === 'completed' && m.approved_at) {
      completedCount++;

      // Speed: days from funded to approved (faster = higher score)
      const daysToComplete = (new Date(m.approved_at).getTime() - fundedDate) / (1000 * 60 * 60 * 24);
      if (daysToComplete <= 3) speedScore += 12;
      else if (daysToComplete <= 7) speedScore += 10;
      else if (daysToComplete <= 14) speedScore += 7;
      else speedScore += 4;

      // Quality: no feedback means first-time approval
      if (!m.feedback) qualityScore += 12;
      else qualityScore += 6; // had revisions
    }
  }

  // Cap scores
  speedScore = Math.min(speedScore, 35);
  qualityScore = Math.min(qualityScore, 35);

  // Utilization: percentage of milestones completed
  const utilization = Math.round((completedCount / milestones.length) * 30);

  const total = speedScore + qualityScore + utilization;

  return { total, speed: speedScore, quality: qualityScore, utilization };
}

export function formatTrustScoreMessage(score: CampaignTrustScore): string {
  const bar = (value: number, max: number) => {
    const filled = Math.round((value / max) * 5);
    return '█'.repeat(filled) + '░'.repeat(5 - filled);
  };
  return [
    `Trust Score: ${score.total}/100`,
    '',
    `${bar(score.speed, 35)} Speed: ${score.speed}/35`,
    `${bar(score.quality, 35)} Quality: ${score.quality}/35`,
    `${bar(score.utilization, 30)} Utilization: ${score.utilization}/30`,
  ].join('\n');
}
