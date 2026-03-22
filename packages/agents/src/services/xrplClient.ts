import { Client, Wallet } from 'xrpl';

let client: Client | null = null;

export async function getXrplClient(): Promise<Client> {
  if (!client || !client.isConnected()) {
    client = new Client(process.env.XRPL_WSS || 'wss://s.altnet.rippletest.net:51233');
    await client.connect();
  }
  return client;
}

export function getWallet(seed: string): Wallet {
  return Wallet.fromSeed(seed);
}

export async function getAccountInfo(address: string) {
  const xrpl = await getXrplClient();
  try {
    const response = await xrpl.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    return response.result.account_data;
  } catch {
    return null;
  }
}

export async function getAccountTransactions(address: string, limit = 20) {
  const xrpl = await getXrplClient();
  try {
    const response = await xrpl.request({
      command: 'account_tx',
      account: address,
      limit,
      ledger_index_min: -1,
      ledger_index_max: -1,
    });
    return response.result.transactions;
  } catch {
    return [];
  }
}

export function getExplorerUrl(txHash: string): string {
  return `https://testnet.xrpl.org/transactions/${txHash}`;
}

// ── RLUSD Support ─────────────────────────────────────────────────

// RLUSD currency code — hex-encoded "RLUSD" (40-char XRPL format for non-standard currencies)
const RLUSD_CURRENCY_HEX = '524C555344000000000000000000000000000000';

// RLUSD issuer address (configurable via env)
export function getRLUSDIssuer(): string {
  return process.env.RLUSD_ISSUER || '';
}

export function isRLUSDEnabled(): boolean {
  return !!getRLUSDIssuer();
}

/**
 * Create a TrustLine from an account to the RLUSD issuer.
 * Required before an account can receive RLUSD.
 */
export async function createTrustLine(
  walletSeed: string,
  issuerAddress: string,
  currency: string = RLUSD_CURRENCY_HEX,
  limit: string = '1000000',
): Promise<{ txHash: string }> {
  const xrpl = await getXrplClient();
  const wallet = getWallet(walletSeed);

  const prepared = await xrpl.autofill({
    TransactionType: 'TrustSet',
    Account: wallet.address,
    LimitAmount: {
      currency,
      issuer: issuerAddress,
      value: limit,
    },
  });

  const tx = await xrpl.submitAndWait(prepared, { wallet });
  const txHash = typeof tx.result.hash === 'string' ? tx.result.hash : '';

  return { txHash };
}

/**
 * Send RLUSD (issued currency) from one wallet to another.
 * Both sender and receiver must have TrustLines to the issuer.
 */
export async function sendRLUSD(
  senderSeed: string,
  destinationAddress: string,
  amount: string,
  issuerAddress?: string,
): Promise<{ txHash: string }> {
  const xrpl = await getXrplClient();
  const wallet = getWallet(senderSeed);
  const issuer = issuerAddress || getRLUSDIssuer();

  // Check sender has RLUSD balance before attempting
  const balance = await getRLUSDBalance(wallet.address);
  if (parseFloat(balance) < parseFloat(amount)) {
    throw new Error(`Insufficient RLUSD: have ${balance}, need ${amount}`);
  }

  const prepared = await xrpl.autofill({
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: destinationAddress,
    Amount: {
      currency: RLUSD_CURRENCY_HEX,
      issuer,
      value: amount,
    },
  });

  const tx = await xrpl.submitAndWait(prepared, { wallet });
  const txHash = typeof tx.result.hash === 'string' ? tx.result.hash : '';
  const meta = tx.result.meta as any;
  const resultCode = meta?.TransactionResult || '';

  if (resultCode !== 'tesSUCCESS') {
    throw new Error(`RLUSD tx failed: ${resultCode}`);
  }

  return { txHash };
}

/**
 * Check RLUSD balance for an account.
 */
export async function getRLUSDBalance(address: string): Promise<string> {
  const xrpl = await getXrplClient();
  const issuer = getRLUSDIssuer();
  if (!issuer) return '0';

  try {
    const response = await xrpl.request({
      command: 'account_lines',
      account: address,
      peer: issuer,
    });
    const line = (response.result as any).lines?.find((l: any) => l.currency === RLUSD_CURRENCY_HEX);
    return line?.balance || '0';
  } catch {
    return '0';
  }
}
