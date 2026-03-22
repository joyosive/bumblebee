import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AgentEvent } from '../data/types.js';
import { getDB } from '../db/database.js';
import { getWallet, getAccountInfo, isRLUSDEnabled, getRLUSDBalance } from '../services/xrplClient.js';

// ── Event Ring Buffer ────────────────────────────────────────────
const EVENT_BUFFER_SIZE = 100;
const eventBuffer: AgentEvent[] = [];

function pushEvent(event: AgentEvent) {
  eventBuffer.unshift(event);
  if (eventBuffer.length > EVENT_BUFFER_SIZE) eventBuffer.pop();
}

// ── WebSocket Clients ────────────────────────────────────────────
const clients = new Set<WebSocket>();

export function emitEvent(event: AgentEvent) {
  const enriched = { ...event, timestamp: event.timestamp || Date.now() };
  pushEvent(enriched);

  const icon = event.type === 'complete' ? '✅' :
               event.type === 'error' ? '❌' :
               event.type === 'spawn' ? '🚀' : '⚙️';
  console.log(`[${event.agent.toUpperCase()}] ${icon} ${event.message}`);

  const payload = JSON.stringify(enriched);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ── REST Handlers ────────────────────────────────────────────────

function getAllCampaigns() {
  const db = getDB();
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE status != ? ORDER BY created_at DESC').all('rejected');
  return (campaigns as any[]).map((c) => {
    const milestones = db.prepare('SELECT number, title, status, submitted_at, approved_at FROM milestones WHERE campaign_id = ? ORDER BY number').all(c.id);
    const escrows = db.prepare('SELECT milestone_number, tx_hash, amount, status FROM escrows WHERE campaign_id = ? ORDER BY milestone_number').all(c.id);
    const trust_score = db.prepare('SELECT score, breakdown, oracle_tx_hash, credential_tx_hash FROM trust_scores WHERE campaign_id = ?').get(c.id) || null;
    return { ...c, milestones, escrows, trust_score };
  });
}

async function getStats() {
  const db = getDB();

  let pool_balance = '0';
  let rlusd_balance = '0';
  try {
    const seed = process.env.TREASURY_WALLET_SEED;
    if (seed) {
      const wallet = getWallet(seed);
      const info = await getAccountInfo(wallet.address);
      if (info) {
        pool_balance = (parseInt(info.Balance) / 1_000_000).toFixed(2);
      }
      if (isRLUSDEnabled()) {
        rlusd_balance = await getRLUSDBalance(wallet.address);
      }
    }
  } catch {}

  const allocRow = db.prepare('SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) as total FROM fund_allocations').get() as any;
  const total_allocated = (allocRow.total / 1_000_000).toFixed(2);

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM campaigns WHERE status != ?').get('rejected') as any;
  const campaign_count = countRow.cnt;

  const avgRow = db.prepare('SELECT COALESCE(AVG(score), 0) as avg FROM trust_scores').get() as any;
  const avg_trust_score = Math.round(avgRow.avg);

  return { pool_balance, rlusd_balance, total_allocated, campaign_count, avg_trust_score };
}

// ── HTTP + WS Server ─────────────────────────────────────────────

export function initBridgeServer(port = 3001, maxRetries = 5) {
  function tryListen(currentPort: number, attempt: number) {
    const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.url === '/api/campaigns') {
        const data = getAllCampaigns();
        res.writeHead(200);
        res.end(JSON.stringify(data));
      } else if (req.url === '/api/stats') {
        const data = await getStats();
        res.writeHead(200);
        res.end(JSON.stringify(data));
      } else if (req.url === '/api/events') {
        res.writeHead(200);
        res.end(JSON.stringify(eventBuffer));
      } else if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', clients: clients.size, events: eventBuffer.length }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err: any) {
      console.error('[BRIDGE API]', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[BRIDGE] Dashboard connected (${clients.size} clients)`);

    ws.send(JSON.stringify({ type: 'history', events: eventBuffer }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {}
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[BRIDGE] Dashboard disconnected (${clients.size} clients)`);
    });
  });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
        console.log(`[BRIDGE] Port ${currentPort} in use, trying ${currentPort + 1}...`);
        tryListen(currentPort + 1, attempt + 1);
      } else {
        console.error(`[BRIDGE] Failed to start server:`, err.message);
      }
    });

    server.listen(currentPort, () => {
      console.log(`   Bridge: http://localhost:${currentPort} (REST + WebSocket)`);
    });
  }

  tryListen(port, 0);
}
