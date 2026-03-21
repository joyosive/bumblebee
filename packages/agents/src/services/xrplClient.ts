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
