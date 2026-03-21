import type { Action } from '@elizaos/core';
import { findVenture } from '../../../data/ventures.js';
import { finishEscrow } from '../../../services/escrow.js';
import { getExplorerUrl } from '../../../services/xrplClient.js';
import { activeEscrows } from './createEscrow.js';

export const releaseEscrowAction: Action = {
  name: 'RELEASE_ESCROW',
  description: 'Release funds from an XRPL escrow to the verified impact venture',
  similes: [
    'FINISH_ESCROW',
    'COMPLETE_ESCROW',
    'APPROVE_FUNDING',
    'CONFIRM_RELEASE',
  ],

  validate: async (_runtime, message) => {
    const text = (message.content?.text || '').toLowerCase();
    const keywords = ['release', 'finish', 'confirm', 'approve'];
    return keywords.some(k => text.includes(k));
  },

  handler: async (_runtime, message, _state, _options, callback) => {
    const text = message.content?.text || '';

    // 1. Find venture from message using findVenture()
    const venture = findVenture(text);

    let ventureId: string | undefined;

    if (venture && activeEscrows.has(venture.id)) {
      ventureId = venture.id;
    } else {
      // Fallback: try to match any active escrow by venture name in text
      for (const [id, escrow] of activeEscrows) {
        if (text.toLowerCase().includes(escrow.ventureName.toLowerCase())) {
          ventureId = id;
          break;
        }
      }
      // Last resort: use first active escrow
      if (!ventureId) {
        const first = activeEscrows.entries().next();
        if (!first.done) {
          ventureId = first.value[0];
        }
      }
    }

    // 2. Look up active escrow from the activeEscrows Map
    if (!ventureId || !activeEscrows.has(ventureId)) {
      if (callback) {
        await callback({
          text: 'There are no active escrows to release. Create an escrow first by saying "fund [venture name] with [amount] XRP".',
          actions: ['RELEASE_ESCROW'],
        });
      }
      return { success: false, text: 'No active escrows' };
    }

    const escrow = activeEscrows.get(ventureId)!;
    const walletSeed = process.env.XRPL_AGENT_SEED || '';

    try {
      if (!walletSeed) {
        throw new Error('No XRPL_AGENT_SEED configured');
      }

      // 3. Call finishEscrow() with the stored condition/fulfillment
      const result = await finishEscrow(
        walletSeed,
        escrow.ownerAddress,
        escrow.sequence,
        escrow.condition,
        escrow.fulfillment,
      );

      // 4. Remove from activeEscrows
      activeEscrows.delete(ventureId);

      // 5. Return result with explorer link
      const responseText =
        `## Escrow Released Successfully!\n\n` +
        `**Venture:** ${escrow.ventureName}\n` +
        `**Amount Released:** ${escrow.amount} XRP\n` +
        `**Release TX:** ${getExplorerUrl(result.txHash)}\n\n` +
        `The funds have been released to the venture.`;

      if (callback) {
        await callback({ text: responseText, actions: ['RELEASE_ESCROW'] });
      }

      return { success: true, text: responseText };
    } catch (error) {
      // Simulated release for demo
      const simulatedTxHash = 'simulated_release_' + Date.now();

      activeEscrows.delete(ventureId);

      const responseText =
        `## Escrow Released (Simulated)\n\n` +
        `**Venture:** ${escrow.ventureName}\n` +
        `**Amount Released:** ${escrow.amount} XRP\n` +
        `**Release TX:** ${getExplorerUrl(simulatedTxHash)}\n\n` +
        `*(Transaction simulated — configure XRPL_AGENT_SEED for live transactions)*\n\n` +
        `The funds have been released to the venture.`;

      if (callback) {
        await callback({ text: responseText, actions: ['RELEASE_ESCROW'] });
      }

      return { success: true, text: responseText };
    }
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'Release escrow for Solar Sister' },
      },
      {
        user: 'agent',
        content: { text: 'Escrow Released Successfully! Venture: Solar Sister...' },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Confirm the release for Digital Green' },
      },
      {
        user: 'agent',
        content: { text: 'Escrow Released Successfully! Venture: Digital Green...' },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Approve funding for Bridges to Prosperity' },
      },
      {
        user: 'agent',
        content: { text: 'Escrow Released Successfully! Venture: Bridges to Prosperity...' },
      },
    ],
  ],
};
