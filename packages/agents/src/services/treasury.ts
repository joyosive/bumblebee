import { Client, Wallet, xrpToDrops } from 'xrpl';
import { Venture } from '../data/types.js';

const ACTIVATION_AMOUNT = '2'; // XRP per venture wallet (minimum for activation + reserve)

/**
 * Treasury wallet system.
 * On startup, generates XRPL testnet wallets for ventures
 * and funds them from the treasury wallet.
 */
export async function initVentureWallets(
  ventures: Venture[],
  treasurySeed: string,
  wssUrl: string,
  count: number = 10,
): Promise<Venture[]> {
  const client = new Client(wssUrl);
  await client.connect();

  const treasury = Wallet.fromSeed(treasurySeed);
  console.log(`💰 Treasury wallet: ${treasury.address}`);

  // Check treasury balance
  try {
    const info = await client.request({
      command: 'account_info',
      account: treasury.address,
    });
    const balance = Number(info.result.account_data.Balance) / 1_000_000;
    console.log(`   Balance: ${balance} XRP`);

    if (balance < count * Number(ACTIVATION_AMOUNT) + 10) {
      console.log(`   ⚠️ Low balance — may not fund all ${count} ventures`);
    }
  } catch (err: any) {
    console.log(`   ⚠️ Treasury account not found: ${err.message}`);
    await client.disconnect();
    return ventures;
  }

  const selected = ventures.slice(0, count);
  const funded: Venture[] = [];

  for (const venture of selected) {
    try {
      const ventureWallet = Wallet.generate();
      venture.walletAddress = ventureWallet.address;
      venture.walletSeed = ventureWallet.seed!;

      // Fund venture wallet from treasury
      const prepared = await client.autofill({
        TransactionType: 'Payment',
        Account: treasury.address,
        Destination: ventureWallet.address,
        Amount: xrpToDrops(ACTIVATION_AMOUNT),
      });

      const signed = treasury.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      const meta = result.result.meta as any;
      if (meta?.TransactionResult === 'tesSUCCESS') {
        console.log(`   ✅ ${venture.name}: ${ventureWallet.address} (${ACTIVATION_AMOUNT} XRP)`);
        funded.push(venture);
      } else {
        console.log(`   ❌ ${venture.name}: ${meta?.TransactionResult}`);
      }
    } catch (err: any) {
      console.log(`   ❌ ${venture.name}: ${err.message?.slice(0, 60)}`);
    }
  }

  await client.disconnect();
  console.log(`   💰 Funded ${funded.length}/${selected.length} venture wallets`);
  return funded;
}

/**
 * Fund treasury from testnet faucet (for development).
 */
export async function fundTreasuryFromFaucet(wssUrl: string): Promise<Wallet> {
  const client = new Client(wssUrl);
  await client.connect();
  const { wallet } = await client.fundWallet();
  console.log(`🏦 Treasury funded from faucet: ${wallet.address}`);
  await client.disconnect();
  return wallet;
}
