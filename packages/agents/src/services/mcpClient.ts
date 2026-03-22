import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { emitEvent } from '../bridge/server.js';
import type { BeeName } from '../data/types.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mcpClients = new Map<BeeName, Client>();

import { existsSync } from 'fs';

function getMCPServerPath(): string {
  // Check env first, then common relative paths
  if (process.env.MCP_SERVER_PATH) return process.env.MCP_SERVER_PATH;

  const candidates = [
    path.resolve(__dirname, '../../../../mcp-xrpl/mcp-server'), // submodule: bumblebee/mcp-xrpl/mcp-server
    path.resolve(__dirname, '../../../../mcp-xrpl'),            // flat submodule
    path.resolve(__dirname, '../../../../../mcp-xrpl/mcp-server'), // sibling repo nested
    path.resolve(__dirname, '../../../../../mcp-xrpl'),         // sibling repo flat
  ];

  for (const p of candidates) {
    try {
      if (existsSync(path.join(p, 'src', 'index.ts'))) return p;
    } catch {}
  }

  return candidates[0]; // fallback to first candidate
}

export async function connectMCPForBee(bee: BeeName, walletSeed: string): Promise<boolean> {
  try {
    const serverPath = path.resolve(getMCPServerPath());
    const tsxBin = path.join(serverPath, 'node_modules', '.bin', 'tsx');

    const client = new Client({ name: `bumblebee-${bee}`, version: '2.0.0' });

    const transport = new StdioClientTransport({
      command: tsxBin,
      args: ['src/index.ts'],
      cwd: serverPath,
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`,
        XRPL_SEED: walletSeed,
        XRPL_NETWORK: 'testnet',
      },
    });

    await client.connect(transport);
    mcpClients.set(bee, client);
    console.log(`   MCP: ${bee} connected`);
    return true;
  } catch (err: any) {
    console.log(`   MCP: ${bee} failed: ${err.message?.slice(0, 60)}`);
    return false;
  }
}

export async function initAllMCP(): Promise<boolean> {
  const bees: { name: BeeName; seedEnv: string }[] = [
    { name: 'evaluator', seedEnv: 'EVALUATOR_WALLET_SEED' },
    { name: 'treasury', seedEnv: 'TREASURY_WALLET_SEED' },
    { name: 'facilitator', seedEnv: 'FACILITATOR_WALLET_SEED' },
    { name: 'verifier', seedEnv: 'VERIFIER_WALLET_SEED' },
    { name: 'reviewer', seedEnv: 'REVIEWER_WALLET_SEED' },
  ];

  let anyConnected = false;
  for (const { name, seedEnv } of bees) {
    const seed = process.env[seedEnv];
    if (seed) {
      const ok = await connectMCPForBee(name, seed);
      if (ok) anyConnected = true;
    } else {
      console.log(`   MCP: ${name} skipped (no ${seedEnv})`);
    }
  }
  return anyConnected;
}

export function isMCPConnected(bee: BeeName): boolean {
  return mcpClients.has(bee);
}

export async function mcpCall(bee: BeeName, toolName: string, args: Record<string, unknown>): Promise<any> {
  const client = mcpClients.get(bee);
  if (!client) throw new Error(`MCP not connected for ${bee}`);

  console.log(`[MCP:${bee}] ${toolName}(${JSON.stringify(args).slice(0, 100)})`);
  const result = await client.callTool({ name: toolName, arguments: args });

  const textContent = (result.content as any[])?.find((c: any) => c.type === 'text');
  if (textContent) {
    try { return JSON.parse(textContent.text); } catch { return textContent.text; }
  }
  return result;
}

// ── Convenience wrappers ───────────────────────────────────

export async function mcpCreateDID(bee: BeeName, uri: string) {
  return mcpCall(bee, 'did-create', { uri, useTestnet: true });
}

export async function mcpCreateEscrow(amount: string, destination: string, condition: string, cancelAfter: number) {
  return mcpCall('treasury', 'escrow-create', { amount, destination, condition, cancelAfter, useTestnet: true });
}

export async function mcpFinishEscrow(owner: string, offerSequence: number, condition: string, fulfillment: string) {
  return mcpCall('treasury', 'escrow-finish', { owner, offerSequence, condition, fulfillment, useTestnet: true });
}

export async function mcpCancelEscrow(owner: string, offerSequence: number) {
  return mcpCall('treasury', 'escrow-cancel', { owner, offerSequence, useTestnet: true });
}

export async function mcpSetOracle(oracleDocumentId: number, provider: string, assetClass: string, lastUpdateTime: number, priceData: any[]) {
  return mcpCall('reviewer', 'oracle-set', { oracleDocumentId, provider, assetClass, lastUpdateTime, priceData, useTestnet: true });
}

export async function mcpCreateCredential(bee: BeeName, subject: string, credentialType: string, uri?: string) {
  return mcpCall(bee, 'credential-create', { subject, credentialType, uri, useTestnet: true });
}

export async function mcpGetAccountInfo(bee: BeeName, address: string) {
  return mcpCall(bee, 'get-account-info', { address, useTestnet: true });
}

// ── MPT wrappers ─────────────────────────────────────────

export async function mcpMPTIssuanceCreate(bee: BeeName, opts: { metadata?: string; maxAmount?: string; canTransfer?: boolean; assetScale?: number }) {
  return mcpCall(bee, 'mpt-issuance-create', { ...opts, useTestnet: true });
}

export async function mcpMPTAuthorize(bee: BeeName, mptIssuanceID: string) {
  return mcpCall(bee, 'mpt-authorize', { mptIssuanceID, useTestnet: true });
}

export async function mcpMPTPayment(bee: BeeName, destination: string, mptIssuanceId: string, value: string) {
  return mcpCall(bee, 'payment', {
    destination,
    amount: { mpt_issuance_id: mptIssuanceId, value },
    useTestnet: true,
  });
}

export async function mcpListTools(bee: BeeName): Promise<string[]> {
  const client = mcpClients.get(bee);
  if (!client) return [];
  const tools = await client.listTools();
  return tools.tools.map(t => t.name);
}
