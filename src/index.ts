#!/usr/bin/env node
// Postcept MCP server. Exposes Proof-of-Completion to AI agents as MCP tools.
// After an agent performs a high-risk action (a refund, a cancellation, a ticket
// resolution), it calls the matching verify_* tool to prove the action actually
// completed in the system of record and obtain a signed completion receipt.
//
// Transport: stdio. Configuration: environment variables.
//   POSTCEPT_API_KEY   (required)  a Postcept API key, e.g. pcpt_sk_...
//   POSTCEPT_BASE_URL  (optional)  defaults to https://api.postcept.com
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { PostceptApiError, PostceptClient } from "./client.js";
import { formatVcr, formatVerification } from "./format.js";
import type { RefundClaim, VerificationRequest } from "./types.js";

const VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://api.postcept.com";

const apiKey = process.env.POSTCEPT_API_KEY;
if (!apiKey) {
  console.error(
    "postcept-mcp: POSTCEPT_API_KEY is required. Set it to a Postcept API key " +
      "(create one in the dashboard under API keys, prefixed pcpt_sk_)."
  );
  process.exit(1);
}

const baseUrl = process.env.POSTCEPT_BASE_URL ?? DEFAULT_BASE_URL;
const client = new PostceptClient({ apiKey, baseUrl });

const connectorEnum = z.enum([
  "stripe",
  "zendesk",
  "gorgias",
  "intercom",
  "shopify",
  "hubspot",
  "front",
  "servicenow",
  "salesforce",
  "netsuite",
]);

// Shared input fields every verify_* tool accepts.
const operationId = z
  .string()
  .min(1)
  .describe("Stable id for the agent operation, preserved across retries and handoffs.");
const agentId = z.string().min(1).describe("Identifier for the agent that performed the action.");
const idempotencyKey = z
  .string()
  .optional()
  .describe(
    "Optional Postcept idempotency key: a repeat with the same key returns the original " +
      "verification instead of creating a duplicate."
  );
const test = z
  .boolean()
  .optional()
  .describe(
    "Sandbox mode: verify against the deterministic mock connector instead of a live system " +
      "of record. Sandbox verifications are excluded from your Verified Completion Rate."
  );

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

// Run an API call and turn it (or its failure) into an MCP tool result.
async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: "text", text: await fn() }] };
  } catch (err) {
    const text =
      err instanceof PostceptApiError
        ? `Postcept request failed (HTTP ${err.status}): ${err.detail}`
        : `Postcept request failed: ${(err as Error).message}`;
    return { content: [{ type: "text", text }], isError: true };
  }
}

const server = new McpServer(
  { name: "postcept", version: VERSION },
  {
    instructions:
      "Postcept provides Proof-of-Completion for AI agents. After your agent performs a " +
      "high-risk action (a refund, a subscription cancellation, or a support-ticket " +
      "resolution), call the matching verify_* tool to confirm the action actually completed " +
      "in the system of record (Stripe, Zendesk, etc.) and obtain a signed completion receipt. " +
      "Only tell the user the work is done when safe_to_claim_complete is true. When it is " +
      "false, claim_reason says why: 'pending_finality' means the provider is still settling " +
      "(say 'processing', then re-check later). Anything else means surface the mismatch and " +
      "recover (e.g. retry, reopen the ticket, escalate to a human). Use " +
      "reconcile_verification to re-check a past verification, and verified_completion_rate " +
      "to read the agent's overall reliability.",
  }
);

server.registerTool(
  "verify_refund",
  {
    title: "Verify a refund",
    description:
      "Verify that a refund the agent claims to have issued actually completed in the system " +
      "of record (default Stripe). Checks the refund exists, the amount and currency match, " +
      "the customer matches, and that it was not duplicated. Returns the classification " +
      "(verified / incomplete / duplicated / mismatched / policy_failed) and a signed receipt.",
    inputSchema: {
      operation_id: operationId,
      agent_id: agentId,
      customer: z.string().min(1).describe("Customer id or email the refund should belong to."),
      amount_cents: z
        .number()
        .int()
        .nonnegative()
        .describe("Refund amount in minor units (cents), e.g. 12000 for $120.00."),
      currency: z.string().length(3).default("usd").describe("ISO 4217 currency code, e.g. usd."),
      refund_id: z.string().optional().describe("The refund id the agent created, e.g. re_4md82k."),
      charge_id: z.string().optional().describe("The charge the refund applies to, e.g. ch_1P09x."),
      connector: connectorEnum
        .optional()
        .describe("Payments system of record to check. Defaults to stripe."),
      idempotency_key: idempotencyKey,
      test,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async (args) =>
    run(async () => {
      const claim: RefundClaim = {
        customer: args.customer,
        amount_cents: args.amount_cents,
        currency: args.currency,
        refund_id: args.refund_id ?? null,
        charge_id: args.charge_id ?? null,
      };
      const request: VerificationRequest = {
        operation_id: args.operation_id,
        agent_id: args.agent_id,
        connector: args.connector,
        claim,
        test: args.test,
      };
      return formatVerification(await client.createVerification(request, args.idempotency_key));
    })
);

server.registerTool(
  "verify_cancellation",
  {
    title: "Verify a subscription cancellation",
    description:
      "Verify that a subscription the agent claims to have cancelled is actually cancelled in " +
      "the system of record (default Stripe). Returns the classification and a signed receipt.",
    inputSchema: {
      operation_id: operationId,
      agent_id: agentId,
      subscription_id: z
        .string()
        .min(1)
        .describe("The subscription the agent claims it cancelled, e.g. sub_1P09x."),
      customer: z.string().min(1).describe("Customer id or email the subscription belongs to."),
      connector: connectorEnum
        .optional()
        .describe("Payments system of record to check. Defaults to stripe."),
      idempotency_key: idempotencyKey,
      test,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async (args) =>
    run(async () => {
      const request: VerificationRequest = {
        operation_id: args.operation_id,
        agent_id: args.agent_id,
        connector: args.connector,
        claim: { subscription_id: args.subscription_id, customer: args.customer },
        test: args.test,
      };
      return formatVerification(await client.createVerification(request, args.idempotency_key));
    })
);

server.registerTool(
  "verify_ticket",
  {
    title: "Verify a support-ticket resolution",
    description:
      "Verify that a support ticket the agent claims to have resolved is in the expected state " +
      "in the support system of record (Zendesk, Gorgias, Intercom, Front, or ServiceNow). " +
      "Returns the classification and a signed receipt.",
    inputSchema: {
      operation_id: operationId,
      agent_id: agentId,
      ticket_id: z
        .string()
        .min(1)
        .describe("The support ticket the agent claims it resolved, e.g. 48921."),
      status: z.string().optional().describe("The expected ticket status. Defaults to solved."),
      customer: z.string().optional().describe("Requester email, if it should match."),
      connector: connectorEnum
        .optional()
        .describe(
          "Support system of record: zendesk, gorgias, intercom, front, or servicenow. " +
            "Omit to use the organization's configured support connector."
        ),
      idempotency_key: idempotencyKey,
      test,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async (args) =>
    run(async () => {
      const request: VerificationRequest = {
        operation_id: args.operation_id,
        agent_id: args.agent_id,
        connector: args.connector,
        claim: {
          ticket_id: args.ticket_id,
          status: args.status,
          customer: args.customer ?? null,
        },
        test: args.test,
      };
      return formatVerification(await client.createVerification(request, args.idempotency_key));
    })
);

server.registerTool(
  "get_verification",
  {
    title: "Fetch a verification",
    description:
      "Fetch a past verification (and its signed receipt) by id, e.g. to re-read the result " +
      "or the receipt after the original call.",
    inputSchema: {
      verification_id: z
        .string()
        .min(1)
        .describe("The verification id returned by a verify_* tool."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (args) =>
    run(async () => formatVerification(await client.getVerification(args.verification_id)))
);

server.registerTool(
  "reconcile_verification",
  {
    title: "Re-verify a past verification",
    description:
      "Re-run a past verification against the live system of record (continuous reconciliation). " +
      "Use this to catch a completion that has since regressed (e.g. a refund that was later " +
      "reversed) or recovered. Returns the refreshed classification and receipt.",
    inputSchema: {
      verification_id: z.string().min(1).describe("The verification id to re-verify."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async (args) =>
    run(async () => formatVerification(await client.reconcileVerification(args.verification_id)))
);

server.registerTool(
  "verified_completion_rate",
  {
    title: "Read the Verified Completion Rate",
    description:
      "Read the organization's Verified Completion Rate: the share of claimed completions that " +
      "were independently verified against the system of record, with a breakdown of failures.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => run(async () => formatVcr(await client.verifiedCompletionRate()))
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`postcept-mcp ${VERSION}: ready on stdio (base ${baseUrl}).`);
