# @postcept/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
**Postcept: Proof-of-Completion for AI agents** as MCP tools.

After an agent performs a high-risk action (a refund, a subscription
cancellation, a support-ticket resolution), it calls a `verify_*` tool to confirm
the action actually completed in the system of record (Stripe, Zendesk, and more)
and obtain a signed completion receipt. `"done"` becomes proof, not a claim.

The server is a thin wrapper over the live Postcept HTTP API. It holds no
credentials of its own beyond your Postcept API key, and verification is
read-only against your systems of record.

## Configuration

| Variable            | Required | Default                    | Notes                                                        |
| ------------------- | -------- | -------------------------- | ------------------------------------------------------------ |
| `POSTCEPT_API_KEY`  | yes      | none                       | A Postcept API key (`pcpt_sk_...`) with `verifications:write`. |
| `POSTCEPT_BASE_URL` | no       | `https://api.postcept.com` | Point at a self-hosted or staging API.                       |

Create an API key in the Postcept dashboard under **API keys**.

## Use with Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "postcept": {
      "command": "npx",
      "args": ["-y", "@postcept/mcp"],
      "env": { "POSTCEPT_API_KEY": "pcpt_sk_..." }
    }
  }
}
```

## Tools

| Tool                       | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `verify_refund`            | Verify a claimed refund (exists, amount/currency/customer match, not duplicated). |
| `verify_cancellation`      | Verify a subscription was actually cancelled.                                     |
| `verify_ticket`            | Verify a support ticket is in the expected state.                                 |
| `get_verification`         | Fetch a past verification and its signed receipt by id.                           |
| `reconcile_verification`   | Re-verify a past verification against the live system of record.                  |
| `verified_completion_rate` | Read the organization's Verified Completion Rate.                                 |

Every `verify_*` tool accepts `test: true` to run against the deterministic
sandbox connector (excluded from your Verified Completion Rate), so an agent can
exercise the full flow without a live system of record.

A non-`verified` result (`incomplete`, `duplicated`, `mismatched`,
`policy_failed`) means the work is **not** done. Surface the gap and recover.

## Development

```bash
pnpm --filter @postcept/mcp build       # compile to dist/
pnpm --filter @postcept/mcp typecheck
POSTCEPT_API_KEY=pcpt_sk_... node dist/index.js   # stdio server
```
