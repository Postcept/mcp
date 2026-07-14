// Minimal request/response shapes for the Postcept HTTP API. Only the fields the
// MCP server constructs (requests) or surfaces (responses) are modelled, and
// responses are read defensively so new API fields never break the server. The
// full, generated contract lives in @postcept/sdk.

export type ConnectorName =
  | "stripe"
  | "zendesk"
  | "gorgias"
  | "intercom"
  | "shopify"
  | "hubspot"
  | "front"
  | "servicenow"
  | "salesforce"
  | "netsuite";

export interface RefundClaim {
  refund_id?: string | null;
  charge_id?: string | null;
  amount_cents: number;
  currency: string;
  customer: string;
  idempotency_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CancellationClaim {
  subscription_id: string;
  customer: string;
  idempotency_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TicketClaim {
  ticket_id: string;
  status?: string;
  customer?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type Claim = RefundClaim | CancellationClaim | TicketClaim;

export interface VerificationRequest {
  operation_id: string;
  agent_id: string;
  connector?: ConnectorName;
  claim: Claim;
  test?: boolean;
}

export interface PostconditionResult {
  name: string;
  category?: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
  expected?: string | null;
  actual?: string | null;
}

export interface Receipt {
  id: string;
  result: string;
  signature: string;
  signing_key_id: string;
  algorithm?: string;
  version?: string;
  issued_at?: string;
  valid_as_of?: string | null;
  [key: string]: unknown;
}

export interface Verification {
  id: string;
  operation_id: string;
  agent_id: string;
  action: string;
  connector: string;
  result: string;
  // Lifecycle/finality of the observed action, separate from `result` (a pending
  // refund and a missing refund are both `incomplete` outcomes).
  lifecycle?: string;
  // The one boolean an agent may act on. Only true when the outcome is verified
  // AND the provider state is terminal. `claim_reason` says why it is false.
  safe_to_claim_complete?: boolean;
  claim_reason?: string;
  reversal_possible?: boolean;
  correlation_method?: string;
  correlation_strength?: string;
  // Recommended recovery action when not safe to claim complete ("none" when done).
  recommended_recovery?: string;
  postconditions: PostconditionResult[];
  receipt: Receipt;
  created_at: string;
  review_status?: string;
  test?: boolean;
  reconciled_at?: string | null;
  reconcile_count?: number;
  [key: string]: unknown;
}

export interface VcrSummary {
  claimed: number;
  verified: number;
  incomplete: number;
  duplicated: number;
  mismatched: number;
  policy_failed: number;
  verified_completion_rate: number;
}
