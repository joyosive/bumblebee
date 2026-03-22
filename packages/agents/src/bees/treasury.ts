// packages/agents/src/bees/treasury.ts
import { createEscrow, finishEscrow, cancelEscrow } from '../services/escrow.js';
import { generateConditionPair } from '../services/cryptoCondition.js';
import { getWallet, getExplorerUrl, getAccountInfo, isRLUSDEnabled, sendRLUSD, getRLUSDIssuer, getRLUSDBalance, createTrustLine } from '../services/xrplClient.js';
import { createEscrowRecord, updateEscrowStatus, getEscrow, getActiveEscrows, createAllocation, updateCampaignStatus, getCampaign, getMilestones, updateMilestone } from '../db/database.js';
import type { Milestone } from '../data/types.js';
import { emitEvent } from '../bridge/server.js';
import type { Campaign, EscrowRecord } from '../data/types.js';

const TREASURY_SEED = () => process.env.TREASURY_WALLET_SEED!;
const NGO_SEED = () => process.env.NGO_WALLET_SEED!;

// ── RLUSD TrustLine Setup ──────────────────────────────────────────

let rlusdTrustlineReady = false;

export async function ensureRLUSDTrustlines(): Promise<boolean> {
  if (rlusdTrustlineReady || !isRLUSDEnabled()) return rlusdTrustlineReady;

  const issuer = getRLUSDIssuer();
  try {
    // Treasury needs a trustline to hold RLUSD
    await createTrustLine(TREASURY_SEED(), issuer);
    console.log('   RLUSD: Treasury trustline set');
  } catch (err: any) {
    // May already exist — that's fine
    if (!err.message?.includes('tecNO_LINE_INSUF_RESERVE')) {
      console.log(`   RLUSD: Treasury trustline: ${err.message?.slice(0, 50)}`);
    }
  }

  try {
    // NGO needs a trustline to receive RLUSD
    await createTrustLine(NGO_SEED(), issuer);
    console.log('   RLUSD: NGO trustline set');
  } catch (err: any) {
    if (!err.message?.includes('tecNO_LINE_INSUF_RESERVE')) {
      console.log(`   RLUSD: NGO trustline: ${err.message?.slice(0, 50)}`);
    }
  }

  rlusdTrustlineReady = true;
  return true;
}

/**
 * Send RLUSD equivalent alongside XRP escrow release.
 * Amount is derived from XRP drops using a simple 1 XRP = 0.50 USD rate for testnet demo.
 */
async function sendRLUSDPayment(destinationSeed: string, amountDrops: string, milestoneNum: number): Promise<string> {
  if (!isRLUSDEnabled()) return '';

  try {
    await ensureRLUSDTrustlines();
    const xrpAmount = parseInt(amountDrops) / 1_000_000;
    // Demo rate: 1 XRP ≈ $0.50 USD (configurable)
    const usdAmount = (xrpAmount * 0.5).toFixed(2);

    const ngoWallet = getWallet(NGO_SEED());
    const result = await sendRLUSD(TREASURY_SEED(), ngoWallet.address, usdAmount);

    emitEvent({
      agent: 'treasury', type: 'work',
      message: `RLUSD payment: $${usdAmount} sent for M${milestoneNum}`,
      data: { txHash: result.txHash, currency: 'RLUSD', amount: usdAmount },
      timestamp: Date.now(),
    });

    return `\nRLUSD: $${usdAmount} sent | ${getExplorerUrl(result.txHash)}`;
  } catch (err: any) {
    console.log(`[TREASURY] RLUSD payment failed: ${err.message?.slice(0, 60)}`);
    return '';
  }
}

export async function allocateAndCreateEscrows(campaignId: string): Promise<string> {
  const campaign = getCampaign(campaignId) as Campaign | undefined;
  if (!campaign) return 'Campaign not found.';

  const treasuryWallet = getWallet(TREASURY_SEED());
  const ngoWallet = getWallet(NGO_SEED());

  emitEvent({ agent: 'treasury', type: 'work', message: `Allocating funds for: ${campaign.title}`, timestamp: Date.now() });

  // Check treasury balance
  const accountInfo = await getAccountInfo(treasuryWallet.address);
  if (!accountInfo) return 'Treasury wallet not found on ledger. Fund it via faucet first.';

  const balanceDrops = accountInfo.Balance;
  const balanceXRP = parseInt(balanceDrops) / 1_000_000;

  // Reserve: 10 base + 2 per escrow object (3 escrows = 6) = 16 XRP needed as reserve
  const availableXRP = balanceXRP - 16;
  if (availableXRP < campaign.funding_goal) {
    return `Not enough funds. Treasury has ${balanceXRP.toFixed(2)} XRP (${availableXRP.toFixed(2)} available after reserves). Campaign needs ${campaign.funding_goal} XRP.`;
  }

  // Record allocation
  createAllocation(campaignId, (campaign.funding_goal * 1_000_000).toString(), balanceDrops);

  // Split: 33% / 33% / 34%
  const totalDrops = Math.floor(campaign.funding_goal * 1_000_000);
  const m1Drops = Math.floor(totalDrops * 0.33);
  const m2Drops = Math.floor(totalDrops * 0.33);
  const m3Drops = totalDrops - m1Drops - m2Drops;

  const amounts = [m1Drops, m2Drops, m3Drops];
  const results: string[] = [];

  for (let i = 0; i < 3; i++) {
    const { condition, fulfillment } = generateConditionPair();
    try {
      const result = await createEscrow(
        TREASURY_SEED(),
        ngoWallet.address,
        amounts[i].toString(),
        condition,
        604800, // 7 days cancel timeout
      );

      const cancelAfter = new Date(Date.now() + 604800 * 1000).toISOString();

      createEscrowRecord({
        campaign_id: campaignId,
        milestone_number: i + 1,
        tx_hash: result.txHash,
        sequence: result.sequence,
        owner_address: treasuryWallet.address,
        destination_address: ngoWallet.address,
        condition,
        fulfillment,
        amount: amounts[i].toString(),
        cancel_after: cancelAfter,
      });

      results.push(`M${i + 1}: ${(amounts[i] / 1_000_000).toFixed(2)} XRP locked | ${getExplorerUrl(result.txHash)}`);
    } catch (err: any) {
      results.push(`M${i + 1}: Failed - ${err.message}`);
    }
  }

  updateCampaignStatus(campaignId, 'funded', { funded_at: new Date().toISOString() });

  // Release M1 immediately — NGO needs seed money to start
  const m1Escrow = getEscrow(campaignId, 1) as EscrowRecord | undefined;
  let m1ReleaseMsg = '';
  if (m1Escrow) {
    try {
      const releaseResult = await finishEscrow(
        TREASURY_SEED(),
        m1Escrow.owner_address,
        m1Escrow.sequence,
        m1Escrow.condition,
        m1Escrow.fulfillment,
      );
      updateEscrowStatus(m1Escrow.id, 'released');
      // Mark M1 completed, M2 active
      const milestones = getMilestones(campaignId) as Milestone[];
      const m1 = milestones.find(m => m.number === 1);
      const m2 = milestones.find(m => m.number === 2);
      if (m1) updateMilestone(m1.id, { status: 'completed', approved_at: new Date().toISOString() });
      if (m2) updateMilestone(m2.id, { status: 'active' });
      m1ReleaseMsg = `\nM1 released: ${(amounts[0] / 1_000_000).toFixed(2)} XRP sent to NGO | ${getExplorerUrl(releaseResult.txHash)}`;
      // Also send RLUSD if enabled
      const rlusdMsg = await sendRLUSDPayment(NGO_SEED(), amounts[0].toString(), 1);
      m1ReleaseMsg += rlusdMsg;
    } catch (err: any) {
      m1ReleaseMsg = `\nM1 release failed: ${err.message}`;
    }
  }

  emitEvent({ agent: 'treasury', type: 'complete', message: `Funded: ${campaign.title}`, timestamp: Date.now() });

  const currencyNote = isRLUSDEnabled() ? '\n\nDual-currency: XRP escrow + RLUSD stablecoin payments enabled.' : '';

  return `[TreasuryBee] Funded. 3 milestone escrows created:\n\n${results.join('\n')}${m1ReleaseMsg}${currencyNote}\n\nM1 funds released. Start working, send "done" or /submit 2 when M2 is ready.`;
}

export async function releaseMilestoneEscrow(campaignId: string, milestoneNumber: number): Promise<string> {
  const escrow = getEscrow(campaignId, milestoneNumber) as EscrowRecord | undefined;
  if (!escrow) return `No active escrow for milestone ${milestoneNumber}.`;

  emitEvent({ agent: 'treasury', type: 'work', message: `Releasing M${milestoneNumber} escrow`, timestamp: Date.now() });

  try {
    const result = await finishEscrow(
      TREASURY_SEED(),
      escrow.owner_address,
      escrow.sequence,
      escrow.condition,
      escrow.fulfillment,
    );

    updateEscrowStatus(escrow.id, 'released');

    emitEvent({
      agent: 'treasury', type: 'complete',
      message: `Released M${milestoneNumber}: ${(parseInt(escrow.amount) / 1_000_000).toFixed(2)} XRP`,
      data: { txHash: result.txHash },
      timestamp: Date.now(),
    });

    // Also send RLUSD if enabled
    const rlusdMsg = await sendRLUSDPayment(NGO_SEED(), escrow.amount, milestoneNumber);

    return `[TreasuryBee] Milestone ${milestoneNumber} payment released. ${(parseInt(escrow.amount) / 1_000_000).toFixed(2)} XRP sent to NGO.\n${getExplorerUrl(result.txHash)}${rlusdMsg}`;
  } catch (err: any) {
    return `Release failed: ${err.message}`;
  }
}

export async function cancelCampaignEscrows(campaignId: string): Promise<string> {
  const escrows = getActiveEscrows(campaignId) as EscrowRecord[];
  if (escrows.length === 0) return 'No active escrows to cancel.';

  const results: string[] = [];
  for (const escrow of escrows) {
    try {
      const result = await cancelEscrow(TREASURY_SEED(), escrow.owner_address, escrow.sequence);
      updateEscrowStatus(escrow.id, 'cancelled');
      results.push(`M${escrow.milestone_number}: cancelled | ${getExplorerUrl(result.txHash)}`);
    } catch (err: any) {
      results.push(`M${escrow.milestone_number}: cancel failed - ${err.message}`);
    }
  }

  updateCampaignStatus(campaignId, 'stalled');

  return `Escrows cancelled. Funds returned to treasury.\n${results.join('\n')}`;
}

export async function getPoolStatus(): Promise<string> {
  const treasuryWallet = getWallet(TREASURY_SEED());
  const accountInfo = await getAccountInfo(treasuryWallet.address);
  if (!accountInfo) return 'Treasury wallet not found on ledger.';

  const balanceXRP = parseInt(accountInfo.Balance) / 1_000_000;
  const available = balanceXRP - 10; // base reserve

  let rlusdLine = '';
  if (isRLUSDEnabled()) {
    const rlusdBalance = await getRLUSDBalance(treasuryWallet.address);
    rlusdLine = `\nRLUSD: $${rlusdBalance}`;
  }

  return `[TreasuryBee] Pool Status\nAddress: ${treasuryWallet.address}\nBalance: ${balanceXRP.toFixed(2)} XRP${rlusdLine}\nAvailable: ${available.toFixed(2)} XRP (after 10 XRP base reserve)`;
}
