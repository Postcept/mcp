// Render API responses as compact, agent-readable text. The model reads these
// strings to decide what to do next (e.g. reopen a ticket on a mismatch).
import type { PostconditionResult, VcrSummary, Verification } from "./types.js";

const RESULT_LABEL: Record<string, string> = {
  verified: "Verified completion: the action exists, once, correctly, in the system of record.",
  incomplete:
    "Incomplete: the claimed action is not complete in the system of record (missing, still pending, or in a non-final state, see the lifecycle line).",
  duplicated: "Duplicated: the action appears to have happened more than once.",
  mismatched: "Mismatched: a checked field disagrees with the system of record.",
  policy_failed: "Policy failed: a required policy or approval step was not satisfied.",
};

const STATUS_MARK: Record<string, string> = {
  passed: "[pass]",
  failed: "[FAIL]",
  skipped: "[skip]",
};

function formatPostcondition(pc: PostconditionResult): string {
  const mark = STATUS_MARK[pc.status] ?? "[?]";
  let line = `  ${mark} ${pc.name}`;
  if (pc.detail) line += `: ${pc.detail}`;
  return line;
}

const LIFECYCLE_LABEL: Record<string, string> = {
  unobserved: "no matching record was found in the system of record",
  observed: "the record exists but is not in a transitional or terminal state",
  pending_finality: "the provider reports a transitional state, so re-check before telling anyone",
  finalized: "the provider state is terminal",
  reversed: "a previously verified action was later undone",
  indeterminate: "the provider state could not be recognized, so treat as unknown",
  unreachable: "the system of record could not be consulted",
};

export function formatVerification(v: Verification): string {
  const lines: string[] = [];
  lines.push(`Result: ${v.result}`);
  lines.push(RESULT_LABEL[v.result] ?? "");
  if (typeof v.safe_to_claim_complete === "boolean") {
    lines.push(
      v.safe_to_claim_complete
        ? "Safe to tell the customer this is complete."
        : `NOT safe to claim complete (${v.claim_reason ?? "see lifecycle"}).` +
            (v.claim_reason === "pending_finality"
              ? ' Say "processing", not "done" or "failed".'
              : "")
    );
  }
  if (v.lifecycle) {
    const label = LIFECYCLE_LABEL[v.lifecycle];
    lines.push(`Lifecycle: ${v.lifecycle}${label ? `, ${label}` : ""}`);
  }
  if (v.recommended_recovery && v.recommended_recovery !== "none") {
    lines.push(`Recommended recovery: ${v.recommended_recovery.replace(/_/g, " ")}`);
  }
  lines.push("");
  lines.push(`Verification id: ${v.id}`);
  lines.push(`Operation: ${v.operation_id}  |  Agent: ${v.agent_id}  |  Action: ${v.action}`);
  lines.push(`Checked against: ${v.connector}${v.test ? "  (sandbox / not counted in VCR)" : ""}`);

  if (Array.isArray(v.postconditions) && v.postconditions.length > 0) {
    lines.push("");
    lines.push("Postconditions:");
    for (const pc of v.postconditions) lines.push(formatPostcondition(pc));
  }

  if (v.receipt) {
    lines.push("");
    lines.push(
      `Signed receipt: ${v.receipt.id}  |  ${v.receipt.algorithm ?? "ed25519"}  |  key ${v.receipt.signing_key_id}`
    );
  }

  if (typeof v.reconcile_count === "number" && v.reconcile_count > 0) {
    lines.push(`Last reconciled: ${v.reconciled_at ?? "never"} (re-verified ${v.reconcile_count}x)`);
  }

  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n");
}

export function formatVcr(s: VcrSummary): string {
  const pct = (s.verified_completion_rate * 100).toFixed(1);
  return [
    `Verified Completion Rate: ${pct}%  (${s.verified}/${s.claimed} claimed completions verified)`,
    "",
    `Verified:     ${s.verified}`,
    `Incomplete:   ${s.incomplete}`,
    `Duplicated:   ${s.duplicated}`,
    `Mismatched:   ${s.mismatched}`,
    `Policy failed: ${s.policy_failed}`,
  ].join("\n");
}
