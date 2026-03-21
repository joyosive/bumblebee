import type { Action } from '@elizaos/core';
import type { ActiveEscrow } from '../../../data/types.js';
import { VENTURES, findVenture } from '../../../data/ventures.js';
import { createEscrow, generateConditionPair } from '../../../services/escrow.js';
import { getExplorerUrl, getWallet } from '../../../services/xrplClient.js';
import { pendingVerifications } from './verifyProject.js';

/** Active escrows keyed by venture ID — exported for releaseEscrow to consume. */
export const activeEscrows = new Map<string, ActiveEscrow>();

export const createEscrowAction: Action = {
  name: 'CREATE_ESCROW',
  description: 'Create an XRPL escrow to fund a verified social-impact venture',
  similes: [
    'FUND_VENTURE',
    'FUND_PROJECT',
    'DONATE_XRP',
    'SEND_ESCROW',
    'LOCK_FUNDS',
  ],

  validate: async (_runtime, message) => {
    const text = (message.content?.text || '').toLowerCase();
    const keywords = ['fund', 'escrow', 'donate', 'xrp'];
    return keywords.some(k => text.includes(k));
  },

  handler: async (_runtime, message, _state, _options, callback) => {
    const text = message.content?.text || '';

    // 1. Parse amount from message (e.g. "Fund Solar Sister with 50 XRP")
    const amountMatch = text.match(/(\d+)\s*XRP/i);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : 50;
    const amountDrops = String(amount * 1_000_000);

    // 2. Find venture using findVenture()
    //    Try each venture name as a substring match against the message text
    const venture = VENTURES.find(v =>
      text.toLowerCase().includes(v.name.toLowerCase())
    ) || (() => {
      // Fallback: extract a plausible name from the message and use findVenture
      const nameMatch = text.match(/fund\s+(.+?)\s+with/i);
      return nameMatch ? findVenture(nameMatch[1].trim()) : undefined;
    })();

    if (!venture) {
      if (callback) {
        await callback({
          text: 'I could not identify which venture to fund. Please mention the venture name and amount (e.g., "Fund Solar Sister with 100 XRP").',
          actions: ['CREATE_ESCROW'],
        });
      }
      return { success: false, text: 'Venture not found' };
    }

    // 3. Check venture has walletAddress (set by treasury on startup)
    if (!venture.walletAddress) {
      if (callback) {
        await callback({
          text: `${venture.name} does not have a wallet address assigned yet. The treasury must provision wallets before funding.`,
          actions: ['CREATE_ESCROW'],
        });
      }
      return { success: false, text: 'Venture wallet not provisioned' };
    }

    // 4. Get condition from pending verification or generate a new pair
    let condition: string;
    let fulfillment: string;
    const verification = pendingVerifications.get(venture.id);

    if (verification) {
      condition = verification.condition;
      fulfillment = verification.fulfillment;
    } else {
      const pair = generateConditionPair();
      condition = pair.condition;
      fulfillment = pair.fulfillment;
    }

    const walletSeed = process.env.XRPL_AGENT_SEED || '';

    try {
      if (!walletSeed) {
        throw new Error('No XRPL_AGENT_SEED configured');
      }

      // 5. Call createEscrow() from services
      const result = await createEscrow(
        walletSeed,
        venture.walletAddress,
        amountDrops,
        condition,
      );

      // 6. Store active escrow for releaseEscrow to use
      const escrow: ActiveEscrow = {
        ventureId: venture.id,
        ventureName: venture.name,
        txHash: result.txHash,
        sequence: result.sequence,
        ownerAddress: getWallet(walletSeed).address,
        condition,
        fulfillment,
        amount: amountDrops,
        createdAt: new Date().toISOString(),
      };
      activeEscrows.set(venture.id, escrow);

      // 7. Return result with explorer link
      const responseText =
        `## Escrow Created Successfully!\n\n` +
        `**Venture:** ${venture.name}\n` +
        `**Amount:** ${amount} XRP\n` +
        `**Escrow TX:** ${getExplorerUrl(result.txHash)}\n` +
        `**Sequence:** ${result.sequence}\n\n` +
        `The funds are locked in escrow and will be released once the venture milestones are confirmed. ` +
        `Say "release escrow" when you're ready to release the funds.`;

      if (callback) {
        await callback({ text: responseText, actions: ['CREATE_ESCROW'] });
      }

      return { success: true, text: responseText };
    } catch (error) {
      // Simulated escrow for demo / missing seed
      const simulatedTxHash = 'simulated_escrow_' + Date.now();
      const escrow: ActiveEscrow = {
        ventureId: venture.id,
        ventureName: venture.name,
        txHash: simulatedTxHash,
        sequence: Math.floor(Math.random() * 100000),
        ownerAddress: venture.walletAddress,
        condition,
        fulfillment,
        amount: amountDrops,
        createdAt: new Date().toISOString(),
      };
      activeEscrows.set(venture.id, escrow);

      const responseText =
        `## Escrow Created (Simulated)\n\n` +
        `**Venture:** ${venture.name}\n` +
        `**Amount:** ${amount} XRP\n` +
        `**Escrow TX:** ${getExplorerUrl(simulatedTxHash)}\n\n` +
        `*(Transaction simulated — configure XRPL_AGENT_SEED for live transactions)*\n\n` +
        `Say "release escrow" when you're ready to release the funds.`;

      if (callback) {
        await callback({ text: responseText, actions: ['CREATE_ESCROW'] });
      }

      return { success: true, text: responseText };
    }
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'Fund Solar Sister with 100 XRP' },
      },
      {
        user: 'agent',
        content: { text: 'Escrow Created Successfully! Venture: Solar Sister, Amount: 100 XRP' },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Fund Drinkwell with 50 XRP' },
      },
      {
        user: 'agent',
        content: { text: 'Escrow Created Successfully! Venture: Drinkwell, Amount: 50 XRP' },
      },
    ],
  ],
};
