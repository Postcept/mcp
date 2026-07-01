// Render API responses as compact, agent-readable text. The model reads these
// strings to decide what to do next (e.g. reopen a ticket on a mismatch).
import type { PostconditionResult, VcrSummary, Verification } from "./types.js";

const RESULT_LABEL: Record<string, string> = {
  verified: "Verified completion: the action exists, once, correctly, in the system of record.",
  incomplete: "Incomplete: the claimed action was not found in the system of record.",
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

export function formatVerification(v: Verification): string {
  const lines: string[] = [];
  lines.push(`Result: ${v.result}`);
  lines.push(RESULT_LABEL[v.result] ?? "");
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
