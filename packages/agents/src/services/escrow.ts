import { getXrplClient, getWallet } from './xrplClient.js';

export { generateConditionPair } from './cryptoCondition.js';

export async function createEscrow(
  funderSeed: string,
  destinationAddress: string,
  amountDrops: string,
  condition: string,
  cancelAfterSeconds: number = 86400,
): Promise<{ txHash: string; sequence: number; escrowId: string }> {
  const xrpl = await getXrplClient();
  const wallet = getWallet(funderSeed);

  // XRPL uses Ripple epoch (2000-01-01) not Unix epoch
  const cancelAfter = Math.floor(Date.now() / 1000) + cancelAfterSeconds + 946684800;

  const prepared = await xrpl.autofill({
    TransactionType: 'EscrowCreate',
    Account: wallet.address,
    Destination: destinationAddress,
    Amount: amountDrops,
    Condition: condition,
    CancelAfter: cancelAfter,
  });

  const tx = await xrpl.submitAndWait(prepared, { wallet });
  const txHash = typeof tx.result.hash === 'string' ? tx.result.hash : '';
  const sequence = (prepared as any).Sequence || 0;

  return {
    txHash,
    sequence,
    escrowId: `${wallet.address}:${sequence}`,
  };
}

export async function finishEscrow(
  anyWalletSeed: string,
  ownerAddress: string,
  offerSequence: number,
  condition: string,
  fulfillment: string,
): Promise<{ txHash: string }> {
  const xrpl = await getXrplClient();
  const wallet = getWallet(anyWalletSeed);

  // Autofill EscrowFinish to get proper fee (conditions require higher fee)
  const prepared = await xrpl.autofill({
    TransactionType: 'EscrowFinish',
    Account: wallet.address,
    Owner: ownerAddress,
    OfferSequence: offerSequence,
    Condition: condition,
    Fulfillment: fulfillment,
  });

  const tx = await xrpl.submitAndWait(prepared, { wallet });
  const txHash = typeof tx.result.hash === 'string' ? tx.result.hash : '';

  return { txHash };
}
