export interface Campaign {
  id: string;
  ngo_name: string;
  ngo_telegram_id: string;
  title: string;
  description: string;
  sector: string;
  country: string;
  funding_goal: number;
  status: 'pending' | 'approved' | 'rejected' | 'funded' | 'in_progress' | 'stalled' | 'completed';
  evaluation_score: number | null;
  created_at: string;
  funded_at: string | null;
  completed_at: string | null;
}

export interface Milestone {
  id: string;
  campaign_id: string;
  number: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'submitted' | 'revision_needed' | 'completed' | 'expired';
  evidence_file_ids: string | null;
  feedback: string | null;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface EscrowRecord {
  id: string;
  campaign_id: string;
  milestone_number: number;
  tx_hash: string;
  sequence: number;
  owner_address: string;
  destination_address: string;
  condition: string;
  fulfillment: string;
  amount: string;
  cancel_after: string;
  status: 'active' | 'released' | 'cancelled';
  created_at: string;
  released_at: string | null;
}

export interface FundAllocation {
  id: string;
  campaign_id: string;
  amount: string;
  treasury_balance_before: string;
  created_at: string;
}

export interface TrustScoreRecord {
  id: string;
  campaign_id: string;
  ngo_name: string;
  ngo_telegram_id: string;
  score: number;
  breakdown: string;
  oracle_tx_hash: string | null;
  credential_tx_hash: string | null;
  completed_at: string;
}

export type BeeName = 'evaluator' | 'treasury' | 'facilitator' | 'verifier' | 'reviewer';

export interface AgentEvent {
  agent: BeeName;
  type: 'spawn' | 'work' | 'complete' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}
