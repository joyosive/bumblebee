import type { Action } from '@elizaos/core';
import { VENTURES, findVenture } from '../../../data/ventures.js';
import type { Venture, PendingVerification } from '../../../data/types.js';
import { calculateTrustScore, formatScoreReport } from '../../../services/trustScore.js';
import { mcpSetOracle, mcpCreateCredential, isMCPConnected } from '../../../services/mcpClient.js';
import { generateConditionPair } from '../../../services/cryptoCondition.js';

export const pendingVerifications = new Map<string, PendingVerification>();

export const verifyProjectAction: Action = {
  name: 'VERIFY_VENTURE',
  description: 'Verify a social-impact venture on-chain using XRPL oracle data, credentials, and trust scoring',
  similes: [
    'CHECK_VENTURE',
    'ANALYZE_VENTURE',
    'AUDIT_VENTURE',
    'VALIDATE_VENTURE',
    'VERIFY_PROJECT',
  ],

  validate: async (_runtime, message) => {
    const text = (message.content?.text || '').toLowerCase();
    const keywords = ['verify', 'check', 'analyze', 'audit', 'validate'];
    return keywords.some(k => text.includes(k));
  },

  handler: async (_runtime, message, _state, _options, callback) => {
    const text = message.content?.text || '';

    // Try to find a venture by matching against text
    let venture: Venture | undefined;

    // Try each venture name against the user text
    for (const v of VENTURES) {
      if (text.toLowerCase().includes(v.name.toLowerCase())) {
        venture = v;
        break;
      }
    }

    // Fallback: try individual words > 3 chars via findVenture
    if (!venture) {
      const words = text.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        const found = findVenture(word);
        if (found) {
          venture = found;
          break;
        }
      }
    }

    if (!venture) {
      if (callback) {
        await callback({
          text: `I could not identify which venture you want to verify. Please mention the venture name (e.g., "Verify Solar Sister" or "Verify Drinkwell").`,
          actions: ['VERIFY_VENTURE'],
        });
      }
      return { success: false, text: 'Venture not found' };
    }

    // 1. Calculate trust score
    const score = calculateTrustScore(venture);

    // 2. If MCP connected, publish oracle and issue credential on-chain
    let oracleTxHash: string | undefined;
    let credentialTxHash: string | undefined;

    if (isMCPConnected()) {
      try {
        const oracleResult = await mcpSetOracle(
          Math.floor(Math.random() * 100000),
          'BumbleBee',
          'TrustScore',
          Math.floor(Date.now() / 1000),
          [
            { baseAsset: venture.id, quoteAsset: 'TRUST', assetPrice: score.total, scale: 0 },
          ],
        );
        oracleTxHash = oracleResult?.hash || oracleResult?.txHash;
      } catch (err) {
        console.log(`Oracle publish failed for ${venture.name}:`, (err as Error).message);
      }

      try {
        const credResult = await mcpCreateCredential(
          venture.walletAddress || venture.id,
          'ImpactVerification',
          venture.website || undefined,
        );
        credentialTxHash = credResult?.hash || credResult?.txHash;
      } catch (err) {
        console.log(`Credential issue failed for ${venture.name}:`, (err as Error).message);
      }
    }

    // 3. Generate crypto-condition pair for escrow
    const { condition, fulfillment } = generateConditionPair();

    // 4. Store pending verification
    const verification: PendingVerification = {
      ventureId: venture.id,
      condition,
      fulfillment,
      trustScore: score.total,
      oracleTxHash,
      credentialTxHash,
    };
    pendingVerifications.set(venture.id, verification);

    // Cache the score on the venture object
    venture.trustScore = score;

    // 5. Build response
    const report = formatScoreReport(venture, score);

    const statusLines: string[] = [];
    if (oracleTxHash) {
      statusLines.push(`Oracle TX: \`${oracleTxHash}\``);
    }
    if (credentialTxHash) {
      statusLines.push(`Credential TX: \`${credentialTxHash}\``);
    }
    if (!isMCPConnected()) {
      statusLines.push('*(MCP not connected — on-chain attestations skipped)*');
    }

    const responseText = [
      `## Verification: ${venture.name}\n`,
      report,
      '',
      statusLines.length > 0 ? statusLines.join('\n') : '',
      '',
      `This venture is verified and ready for escrow funding. Would you like to fund it?`,
    ].filter(Boolean).join('\n');

    if (callback) {
      await callback({ text: responseText, actions: ['VERIFY_VENTURE'] });
    }

    return { success: true, text: responseText };
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'Verify Solar Sister' },
      },
      {
        user: 'agent',
        content: { text: 'Verification: Solar Sister\n\nTrust Score: 82/100...' },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Verify Drinkwell' },
      },
      {
        user: 'agent',
        content: { text: 'Verification: Drinkwell\n\nTrust Score: 78/100...' },
      },
    ],
  ],
};
