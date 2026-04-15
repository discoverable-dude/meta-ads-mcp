# Meta Ads MCP — Design Spec

**Date:** 2026-04-15
**Author:** George Collins
**Status:** Draft for review

## Purpose

A Model Context Protocol (MCP) server that gives George's team full-coverage access to Meta Ads (Marketing API) from Claude — reporting, campaign management, creative operations, audiences, and lead forms. Each teammate installs locally and authenticates via OAuth against a single shared Facebook App.

## Goals

- Frictionless team install: one npm command, one OAuth click, done.
- Full CRUD over campaigns, ad sets, ads, creatives, audiences, and lead retrieval.
- Safe by default: any action that raises daily budget above a threshold requires explicit confirmation.
- Per-teammate identity: each user authenticates as themselves, so Meta's audit trail stays clean.

## Non-goals (v1)

- Hosted/remote MCP deployment.
- Pixel / Conversions API management.
- Catalog & commerce objects.
- Programmatic creation/editing of lead forms (Ads Manager's form builder is better).
- A/B test objects, reach & frequency campaigns.

## Architecture

### Distribution

- Published to npm as `@yourorg/meta-ads-mcp`.
- Teammates add one block to their Claude config:
  ```json
  {
    "mcpServers": {
      "meta-ads": { "command": "npx", "args": ["-y", "@yourorg/meta-ads-mcp"] }
    }
  }
  ```
- Also installs a CLI `meta-ads-mcp` with subcommands: `auth`, `logout`, `whoami`.

### Authentication

- **Flow:** OAuth 2.0 with PKCE, against a single Facebook App registered by George.
- **No client secret shipped in the package** — PKCE avoids it.
- **Redirect:** loopback (`http://localhost:PORT/callback`) on an ephemeral port.
- **First run:** if no cached token, MCP prints the auth URL, starts the loopback listener, user clicks link, Facebook redirects with a code, MCP exchanges code → short-lived → long-lived (~60 day) token.
- **Storage:** `~/.meta-ads-mcp/credentials.json`, chmod 600. Schema:
  ```json
  {
    "userId": "...",
    "accessToken": "...",
    "expiresAt": "2026-06-14T00:00:00Z",
    "defaultAdAccountId": "act_123..."
  }
  ```
- **Refresh:** if token is <7 days from expiry, silently re-exchange for a new long-lived token on next call. If refresh fails, return a structured `AUTH_EXPIRED` error instructing Claude to tell the user to run `meta-ads-mcp auth`.

### Facebook App setup (one-time, done by George)

1. Register app in Meta for Developers.
2. Add permissions: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `leads_retrieval`.
3. Add each teammate as a developer or tester role until app is approved for public use.
4. Configure valid OAuth redirect URIs for `http://localhost/*`.

### Ad account resolution

- User sets a default via `set_default_account` after install (stored in credentials file).
- Every tool accepts optional `ad_account_id`; falls back to default.
- `list_ad_accounts` enumerates all accounts the token can access.

## Tool surface (v1)

### Account & setup
- `list_ad_accounts`
- `set_default_account(ad_account_id)`
- `whoami`

### Read — structure
- `list_campaigns(ad_account_id?, status?, limit?, after?)`
- `get_campaign(campaign_id)`
- `list_ad_sets(campaign_id | ad_account_id, ...)`
- `get_ad_set(ad_set_id)`
- `list_ads(ad_set_id | campaign_id | ad_account_id, ...)`
- `get_ad(ad_id)`
- `list_creatives(ad_account_id?)`
- `get_creative(creative_id)`
- `list_audiences(ad_account_id?)`

### Read — performance
- `get_insights({ level, object_id, date_range, breakdowns?, metrics? })` — unified insights tool across account/campaign/adset/ad.

### Write — structure (subject to threshold guard where spend applies)
- `create_campaign`, `update_campaign`, `pause_campaign`, `resume_campaign`
- `create_ad_set`, `update_ad_set`
- `create_ad`, `update_ad`, `pause_ad`, `resume_ad`
- `upload_creative({ image_url | local_path, name, ... })`

### Write — audiences
- `create_custom_audience`
- `update_audience`

### Lead forms & leads
- `list_lead_forms(ad_account_id? | page_id?)`
- `get_lead_form(form_id)`
- `list_leads(form_id, date_range?, after?)`
- `get_lead(lead_id)`
- `export_leads(form_id, date_range)` — bulk fetch, CSV-shaped output

## Safety: threshold guard

- **Default threshold:** $30/day daily budget. Overridable via env var `META_ADS_MCP_CONFIRM_THRESHOLD`.
- **Triggers when:** a write tool sets or raises `daily_budget` above the threshold, or creates a new campaign/ad set whose initial daily budget exceeds it.
- **Behavior when triggered (and `confirm !== true`):** tool returns
  ```json
  {
    "requires_confirmation": true,
    "preview": { "action": "update_ad_set", "changes": { "daily_budget": 5000 }, "reason": "daily_budget 5000 cents exceeds threshold 3000 cents" }
  }
  ```
- Re-call with `confirm: true` to execute.
- **Never triggers for:** lowering budgets, pausing, or non-spend mutations.

## Data flow per tool call

1. Load cached credentials. If token <7 days from expiry, refresh.
2. If no token or refresh fails → return `AUTH_EXPIRED`.
3. Resolve `ad_account_id` (explicit → default → `INVALID_PARAM`).
4. For writes: evaluate threshold guard; if tripped without `confirm: true`, return preview.
5. Call Graph API v21.0. Retry once on 5xx with exponential backoff (250ms, 1s).
6. Parse `X-Business-Use-Case-Usage`:
   - >80% on any bucket → include warning in response.
   - >95% → refuse with `RATE_LIMITED` including `retry_after_seconds`.
7. Normalize response: camelCase keys, ISO timestamps, money in dollars (float).

## Error model

Every tool returns one of:
- `AUTH_EXPIRED`
- `PERMISSION_DENIED` (missing scope or page access, includes `missing_permission` if Meta says)
- `RATE_LIMITED` (includes `retry_after_seconds`, `bucket`)
- `INVALID_PARAM` (includes `field`, `detail`)
- `NOT_FOUND`
- `UPSTREAM_ERROR` (raw Meta response attached as `cause`)

Each includes `code` + human-readable `message`.

## Logging

- Structured JSON to `~/.meta-ads-mcp/logs/YYYY-MM-DD.log`, 14-day rotation.
- Logs: tool name, args (with tokens/PII redacted), duration, result code.
- Never logs token values or full lead PII.

## Project structure

```
meta-ads-mcp/
├── src/
│   ├── index.ts              # MCP server entry, tool registration
│   ├── auth/
│   │   ├── oauth.ts          # PKCE flow, loopback server
│   │   ├── credentials.ts    # ~/.meta-ads-mcp/credentials.json I/O
│   │   └── refresh.ts        # long-lived token exchange
│   ├── graph/
│   │   ├── client.ts         # fetch wrapper, retry, rate-limit parsing
│   │   └── errors.ts         # error normalization
│   ├── tools/
│   │   ├── accounts.ts
│   │   ├── campaigns.ts
│   │   ├── adsets.ts
│   │   ├── ads.ts
│   │   ├── creatives.ts
│   │   ├── audiences.ts
│   │   ├── insights.ts
│   │   ├── leads.ts
│   │   └── guard.ts          # threshold guard helper
│   ├── cli.ts                # meta-ads-mcp auth | logout | whoami
│   └── config.ts             # env vars, defaults
├── tests/
│   ├── unit/
│   └── integration/
├── README.md
└── package.json
```

## Testing strategy

- **Unit (vitest):** threshold guard, error normalization, credentials I/O, PKCE challenge generation, config resolution.
- **Integration:** each tool handler tested against a mocked Graph HTTP client — asserts correct endpoint, query params, error mapping.
- **Manual smoke test:** `scripts/smoke.ts` runs read-only tools against a sandbox account before release.
- **No live API in CI.**

## Configuration (env vars)

| Variable | Default | Purpose |
| --- | --- | --- |
| `META_ADS_MCP_CONFIRM_THRESHOLD` | `3000` (cents) | Daily-budget guard threshold |
| `META_ADS_MCP_GRAPH_VERSION` | `v21.0` | Pinned Graph API version |
| `META_ADS_MCP_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `META_ADS_MCP_CREDENTIALS_DIR` | `~/.meta-ads-mcp` | Override for testing |

## Open questions

None blocking — ready for implementation plan.

## Out of scope for this spec

- Hosted deployment (future work if team outgrows local install).
- Pixel/CAPI, catalog, A/B tests, reach & frequency (v2 candidates).
