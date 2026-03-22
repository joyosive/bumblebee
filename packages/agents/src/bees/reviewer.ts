// packages/agents/src/bees/reviewer.ts
import { getCampaign, getMilestones, updateCampaignStatus, createTrustScore } from '../db/database.js';
import { calculateCampaignTrustScore, formatTrustScoreMessage } from '../services/trustScore.js';
import { mcpSetOracle, mcpCreateCredential, isMCPConnected } from '../services/mcpClient.js';
import { emitEvent } from '../bridge/server.js';
import type { Campaign, Milestone } from '../data/types.js';

export async function completeCampaign(campaignId: string): Promise<string> {
  const campaign = getCampaign(campaignId) as Campaign | undefined;
  if (!campaign) return 'Campaign not found.';

  const milestones = getMilestones(campaignId) as Milestone[];
  if (!campaign.funded_at) return 'Campaign not funded yet.';

  emitEvent({ agent: 'reviewer', type: 'work', message: `Scoring: ${campaign.title}`, timestamp: Date.now() });

  const score = calculateCampaignTrustScore(milestones, campaign.funded_at);

  let oracleTxHash = '';
  let credentialTxHash = '';

  // Publish on-chain via MCP
  if (isMCPConnected('reviewer')) {
    try {
      const oracleResult = await mcpSetOracle(
        0, 'BumbleBee', 'TrustScore',
        Math.floor(Date.now() / 1000),
        [{ BaseAsset: 'XRP', QuoteAsset: 'USD', AssetPrice: score.total, Scale: 0 }],
      );
      oracleTxHash = oracleResult?.hash || oracleResult?.tx_hash || '';
    } catch (err: any) {
      console.log(`  Oracle publish failed: ${err.message?.slice(0, 50)}`);
    }

    try {
      const credResult = await mcpCreateCredential(
        'reviewer',
        campaign.ngo_telegram_id,
        'CampaignComplete',
        `campaign:${campaignId}|score:${score.total}`,
      );
      credentialTxHash = credResult?.hash || credResult?.tx_hash || '';
    } catch (err: any) {
      console.log(`  Credential issue failed: ${err.message?.slice(0, 50)}`);
    }
  }

  createTrustScore({
    campaign_id: campaignId,
    ngo_name: campaign.ngo_name,
    ngo_telegram_id: campaign.ngo_telegram_id,
    score: score.total,
    breakdown: JSON.stringify(score),
    oracle_tx_hash: oracleTxHash,
    credential_tx_hash: credentialTxHash,
  });

  updateCampaignStatus(campaignId, 'completed', { completed_at: new Date().toISOString() });

  emitEvent({
    agent: 'reviewer', type: 'complete',
    message: `Campaign complete: ${campaign.title} | Score: ${score.total}/100`,
    data: { score: score.total, oracleTxHash },
    timestamp: Date.now(),
  });

  const scoreReport = formatTrustScoreMessage(score);
  const onChain = oracleTxHash ? `\nOracle: published on-chain` : '';
  const cred = credentialTxHash ? `\nCredential: issued` : '';

  return `[ReviewerBee] Campaign complete.\n\n${scoreReport}${onChain}${cred}`;
}
