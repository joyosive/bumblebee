// packages/agents/src/bees/reviewer.ts
import { getCampaign, getMilestones, updateCampaignStatus, createTrustScore } from '../db/database.js';
import { calculateCampaignTrustScore, formatTrustScoreMessage } from '../services/trustScore.js';
import { mcpSetOracle, mcpCreateCredential, isMCPConnected, mcpMPTIssuanceCreate, mcpMPTAuthorize, mcpMPTPayment } from '../services/mcpClient.js';
import { getWallet, getExplorerUrl } from '../services/xrplClient.js';
import { emitEvent } from '../bridge/server.js';
import type { Campaign, Milestone } from '../data/types.js';

const NGO_SEED = () => process.env.NGO_WALLET_SEED!;

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

  // ── Mint Trust Score as MPT via MCP (Treasury → NGO) ───────────
  let mptMsg = '';
  if (isMCPConnected('treasury')) {
    try {
      const metadata = `BumbleBee TrustScore | ${campaign.title} | Total:${score.total}/100 | Speed:${score.speed}/35 | Quality:${score.quality}/35 | Utilization:${score.utilization}/30`;

      // 1. Treasury creates MPT issuance via MCP
      emitEvent({ agent: 'reviewer', type: 'work', message: `Minting Trust Score MPT: ${score.total}/100`, timestamp: Date.now() });
      const issuance = await mcpMPTIssuanceCreate('treasury', {
        metadata,
        maxAmount: '100',
        canTransfer: true,
        assetScale: 0,
      });
      const mptIssuanceId = issuance?.mptIssuanceID || issuance?.mpt_issuance_id || issuance?.MPTokenIssuanceID || '';

      // 2. NGO authorizes to hold the MPT via MCP
      await mcpMPTAuthorize('verifier', mptIssuanceId);

      // 3. Treasury sends trust score amount to NGO via MCP payment
      const ngoWallet = getWallet(NGO_SEED());
      const payment = await mcpMPTPayment('treasury', ngoWallet.address, mptIssuanceId, score.total.toString());
      const txHash = payment?.hash || payment?.tx_hash || payment?.txHash || '';

      mptMsg = `\nMPT Trust Score: ${score.total} tokens sent to NGO${txHash ? ` | ${getExplorerUrl(txHash)}` : ''}`;

      emitEvent({
        agent: 'reviewer', type: 'complete',
        message: `MPT issued: ${score.total} trust tokens → NGO`,
        data: { mptIssuanceId, txHash },
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.log(`  MPT trust score failed: ${err.message?.slice(0, 80)}`);
      mptMsg = `\nMPT: failed (${err.message?.slice(0, 40)})`;
    }
  } else {
    mptMsg = '\nMPT: skipped (MCP not connected)';
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

  return `[ReviewerBee] Campaign complete.\n\n${scoreReport}${onChain}${cred}${mptMsg}`;
}
