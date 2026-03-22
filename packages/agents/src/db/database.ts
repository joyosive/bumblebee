import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCHEMA } from './schema.js';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/bumblebee.db');

let db: Database.Database;

export function initDB(): void {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
}

export function getDB(): Database.Database {
  if (!db) initDB();
  return db;
}

// ── Campaigns ──────────────────────────────────────────────

export function createCampaign(data: {
  ngo_name: string; ngo_telegram_id: string; title: string;
  description: string; sector: string; country: string; funding_goal: number;
}): string {
  const id = uuid();
  getDB().prepare(`INSERT INTO campaigns (id, ngo_name, ngo_telegram_id, title, description, sector, country, funding_goal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.ngo_name, data.ngo_telegram_id, data.title, data.description, data.sector, data.country, data.funding_goal);
  return id;
}

export function getCampaign(id: string) {
  return getDB().prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
}

export function getCampaignsByNgo(telegramId: string) {
  return getDB().prepare('SELECT * FROM campaigns WHERE ngo_telegram_id = ? ORDER BY created_at DESC').all(telegramId);
}

export function getCampaignsByStatus(status: string) {
  return getDB().prepare('SELECT * FROM campaigns WHERE status = ? ORDER BY created_at DESC').all(status);
}

export function updateCampaignStatus(id: string, status: string, extra?: Record<string, any>) {
  const sets = ['status = ?'];
  const vals: any[] = [status];
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  vals.push(id);
  getDB().prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

// ── Milestones ─────────────────────────────────────────────

export function createMilestones(campaignId: string, milestones: { title: string; description: string }[]) {
  const stmt = getDB().prepare(`INSERT INTO milestones (id, campaign_id, number, title, description, status)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < milestones.length; i++) {
    stmt.run(uuid(), campaignId, i + 1, milestones[i].title, milestones[i].description, i === 0 ? 'active' : 'pending');
  }
}

export function getMilestones(campaignId: string) {
  return getDB().prepare('SELECT * FROM milestones WHERE campaign_id = ? ORDER BY number').all(campaignId);
}

export function getMilestone(campaignId: string, number: number) {
  return getDB().prepare('SELECT * FROM milestones WHERE campaign_id = ? AND number = ?').get(campaignId, number);
}

export function updateMilestone(id: string, data: Record<string, any>) {
  const sets = Object.keys(data).map(k => `${k} = ?`);
  const vals = [...Object.values(data), id];
  getDB().prepare(`UPDATE milestones SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

// ── Escrows ────────────────────────────────────────────────

export function createEscrowRecord(data: {
  campaign_id: string; milestone_number: number; tx_hash: string; sequence: number;
  owner_address: string; destination_address: string; condition: string;
  fulfillment: string; amount: string; cancel_after: string;
}): string {
  const id = uuid();
  getDB().prepare(`INSERT INTO escrows (id, campaign_id, milestone_number, tx_hash, sequence, owner_address, destination_address, condition, fulfillment, amount, cancel_after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.campaign_id, data.milestone_number, data.tx_hash, data.sequence, data.owner_address, data.destination_address, data.condition, data.fulfillment, data.amount, data.cancel_after);
  return id;
}

export function getEscrow(campaignId: string, milestoneNumber: number) {
  return getDB().prepare('SELECT * FROM escrows WHERE campaign_id = ? AND milestone_number = ? AND status = ?').get(campaignId, milestoneNumber, 'active');
}

export function getActiveEscrows(campaignId: string) {
  return getDB().prepare('SELECT * FROM escrows WHERE campaign_id = ? AND status = ?').all(campaignId, 'active');
}

export function updateEscrowStatus(id: string, status: string) {
  const releasedAt = status === 'released' ? new Date().toISOString() : null;
  getDB().prepare('UPDATE escrows SET status = ?, released_at = ? WHERE id = ?').run(status, releasedAt, id);
}

// ── Fund Allocations ───────────────────────────────────────

export function createAllocation(campaignId: string, amount: string, balanceBefore: string): string {
  const id = uuid();
  getDB().prepare(`INSERT INTO fund_allocations (id, campaign_id, amount, treasury_balance_before) VALUES (?, ?, ?, ?)`).run(id, campaignId, amount, balanceBefore);
  return id;
}

// ── Trust Scores ───────────────────────────────────────────

export function createTrustScore(data: {
  campaign_id: string; ngo_name: string; ngo_telegram_id: string;
  score: number; breakdown: string; oracle_tx_hash?: string; credential_tx_hash?: string;
}): string {
  const id = uuid();
  getDB().prepare(`INSERT INTO trust_scores (id, campaign_id, ngo_name, ngo_telegram_id, score, breakdown, oracle_tx_hash, credential_tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.campaign_id, data.ngo_name, data.ngo_telegram_id, data.score, data.breakdown, data.oracle_tx_hash || null, data.credential_tx_hash || null);
  return id;
}

export function getTrustScore(campaignId: string) {
  return getDB().prepare('SELECT * FROM trust_scores WHERE campaign_id = ?').get(campaignId);
}
