import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(import.meta.url);

/**
 * Generate a PREIMAGE-SHA-256 crypto-condition pair for XRPL Escrow.
 *
 * Uses the Interledger Foundation's five-bells-condition library which
 * implements the crypto-conditions spec (RFC draft-thomas-crypto-conditions-04).
 *
 * The condition is a hash lock:
 *   - Fulfillment = a random 32-byte preimage (secret)
 *   - Condition = SHA-256 hash of the fulfillment (public)
 *
 * EscrowCreate includes the condition (public hash).
 * EscrowFinish requires the fulfillment (proves knowledge of the secret).
 * XRPL validates: hash(fulfillment) === condition → releases funds.
 *
 * We use createRequire to import the CJS module cleanly in ESM context —
 * this avoids needing a separate type declaration file.
 */
export function generateConditionPair(): { condition: string; fulfillment: string } {
  const cc = require('five-bells-condition');

  const preimage = crypto.randomBytes(32);
  const fulfillmentObj = new cc.PreimageSha256();
  fulfillmentObj.setPreimage(preimage);

  return {
    condition: fulfillmentObj.getConditionBinary().toString('hex').toUpperCase(),
    fulfillment: fulfillmentObj.serializeBinary().toString('hex').toUpperCase(),
  };
}
