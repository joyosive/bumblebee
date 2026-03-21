import WebSocket from 'ws';
import type { AgentEvent } from '../data/types.js';

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connect() {
  const url = process.env.DASHBOARD_WS_URL || 'ws://localhost:3001';

  try {
    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log('[BRIDGE] Connected to dashboard at', url);
    });

    ws.on('close', () => {
      scheduleReconnect();
    });

    ws.on('error', () => {
      // Dashboard not running — silent retry
    });
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

export function initBridge() {
  connect();
}

export function emitEvent(event: AgentEvent) {
  const enriched = { ...event, timestamp: Date.now() };

  const icon = event.type === 'complete' ? '✅' :
               event.type === 'error' ? '❌' :
               event.type === 'spawn' ? '🚀' : '⚙️';
  console.log(`[${event.agent.toUpperCase()}] ${icon} ${event.message}`);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(enriched));
  }
}
