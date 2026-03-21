/**
 * MCP Client — connects to mcp-xrpl server for XRPL operations
 *
 * Instead of calling xrpl.js directly, the agent uses MCP tools:
 * - get-account-info: read account balances and properties
 * - escrow-create: create conditional escrow
 * - escrow-finish: release escrowed funds
 * - credential-create: issue verification credentials
 * - oracle-set: publish trust score data
 * - did-create: create on-chain identity
 *
 * This demonstrates the MCP standard for agent → blockchain tool access.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { emitEvent } from '../bridge/websocket.js';

let mcpClient: Client | null = null;
let mcpConnected = false;

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read at call time, not import time — dotenv hasn't loaded yet when this module is first imported
function getMCPServerPath(): string {
  return process.env.MCP_SERVER_PATH || path.resolve(__dirname, '../../../../mcp-xrpl');
}

export async function connectMCP(): Promise<boolean> {
  try {
    const serverPath = path.resolve(getMCPServerPath());
    const tsxBin = path.join(serverPath, 'node_modules', '.bin', 'tsx');

    console.log(`   MCP server path: ${serverPath}`);
    console.log(`   tsx binary: ${tsxBin}`);

    mcpClient = new Client({ name: 'bumblebee-agent', version: '1.0.0' });

    const transport = new StdioClientTransport({
      command: tsxBin,
      args: ['src/index.ts'],
      cwd: serverPath,
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`,
        XRPL_SEED: process.env.SCOUT_WALLET_SEED || '',
        XRPL_NETWORK: 'testnet',
      },
    });

    await mcpClient.connect(transport);
    mcpConnected = true;
    console.log('🔌 MCP: Connected to mcp-xrpl server');

    // List available tools
    const tools = await mcpClient.listTools();
    console.log(`🔌 MCP: ${tools.tools.length} XRPL tools available`);
    const toolNames = tools.tools.map(t => t.name).slice(0, 15);
    console.log(`   Tools: ${toolNames.join(', ')}...`);

    emitEvent({ agent: 'analyst', type: 'work', message: `MCP connected: ${tools.tools.length} XRPL tools available` });

    return true;
  } catch (err: any) {
    console.log('⚠️  MCP: Failed to connect:', err.message?.slice(0, 60));
    mcpConnected = false;
    return false;
  }
}

export function isMCPConnected(): boolean {
  return mcpConnected && mcpClient !== null;
}

export async function mcpCall(toolName: string, args: Record<string, unknown>): Promise<any> {
  if (!mcpClient || !mcpConnected) {
    throw new Error('MCP not connected');
  }

  console.log(`[MCP] Calling: ${toolName}(${JSON.stringify(args).slice(0, 100)})`);

  const result = await mcpClient.callTool({ name: toolName, arguments: args });

  // Extract text content from MCP response
  const textContent = (result.content as any[])?.find((c: any) => c.type === 'text');
  if (textContent) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  }
  return result;
}

// ── Convenience wrappers for common XRPL operations ──────────────────

export async function mcpGetAccountInfo(address: string): Promise<any> {
  return mcpCall('get-account-info', { address, useTestnet: true });
}

export async function mcpCreateEscrow(
  amount: string,
  destination: string,
  condition: string,
  cancelAfter: number
): Promise<any> {
  return mcpCall('escrow-create', {
    amount,
    destination,
    condition,
    cancelAfter,
    useTestnet: true,
  });
}

export async function mcpFinishEscrow(
  owner: string,
  offerSequence: number,
  condition: string,
  fulfillment: string
): Promise<any> {
  return mcpCall('escrow-finish', {
    owner,
    offerSequence,
    condition,
    fulfillment,
    useTestnet: true,
  });
}

export async function mcpCreateCredential(
  subject: string,
  credentialType: string,
  uri?: string
): Promise<any> {
  return mcpCall('credential-create', {
    subject,
    credentialType,
    uri,
    useTestnet: true,
  });
}

export async function mcpSetOracle(
  oracleDocumentId: number,
  provider: string,
  assetClass: string,
  lastUpdateTime: number,
  priceData: any[]
): Promise<any> {
  return mcpCall('oracle-set', {
    oracleDocumentId,
    provider,
    assetClass,
    lastUpdateTime,
    priceData,
    useTestnet: true,
  });
}

export async function mcpCreateDID(uri: string): Promise<any> {
  return mcpCall('did-create', { uri, useTestnet: true });
}

export async function mcpListTools(): Promise<string[]> {
  if (!mcpClient) return [];
  const tools = await mcpClient.listTools();
  return tools.tools.map(t => t.name);
}
