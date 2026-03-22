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
  currency: string = 'USD',
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

  const prepared = await xrpl.autofill({
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: destinationAddress,
    Amount: {
      currency: 'USD',
      issuer,
      value: amount,
    },
  });

  const tx = await xrpl.submitAndWait(prepared, { wallet });
  const txHash = typeof tx.result.hash === 'string' ? tx.result.hash : '';

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
    const line = (response.result as any).lines?.find((l: any) => l.currency === 'USD');
    return line?.balance || '0';
  } catch {
    return '0';
  }
}
