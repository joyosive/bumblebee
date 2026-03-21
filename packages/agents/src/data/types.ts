/**
 * Data sourced from a Portfolio dataset.
 */
export interface Venture {
  id: string;
  name: string;
  sector: string;
  description: string;
  countries: string;
  hq: string;
  yearFounded: number | null;
  type: 'For-profit' | 'Non-profit';
  communitiesServed: string;
  projectFocus: string;
  website: string;
  leader: string | null;
  supportType: string;
  // Runtime fields — populated on startup
  walletAddress?: string;
  walletSeed?: string;
  trustScore?: TrustScoreBreakdown;
}

export interface TrustScoreBreakdown {
  total: number;
  maturity: number;
  reach: number;
  backing: number;
  transparency: number;
  sector: number;
  community: number;
}

export interface ActiveEscrow {
  ventureId: string;
  ventureName: string;
  txHash: string;
  sequence: number;
  ownerAddress: string;
  condition: string;
  fulfillment: string;
  amount: string;
  createdAt: string;
}

export interface PendingVerification {
  ventureId: string;
  condition: string;
  fulfillment: string;
  trustScore: number;
  oracleTxHash?: string;
  credentialTxHash?: string;
}

export interface AgentEvent {
  agent: 'scout' | 'analyst' | 'funder';
  type: 'spawn' | 'work' | 'complete' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}
