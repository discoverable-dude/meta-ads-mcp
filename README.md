# @yourorg/meta-ads-mcp

Meta Ads MCP server for Claude. Read/write access to campaigns, ad sets, ads, creatives, audiences, insights, and lead forms.

## One-time setup (admin)

1. Create a Facebook App in [Meta for Developers](https://developers.facebook.com).
2. Add products: Marketing API, Facebook Login.
3. Permissions: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `leads_retrieval`.
4. Add each teammate as a developer or tester until public approval.
5. Enable PKCE and add `http://localhost/*` as a valid OAuth redirect.
6. Share the app ID with your team; set `META_ADS_MCP_APP_ID`.

## Per-teammate setup

**1. Install Claude Code config** — add to `~/.config/claude/claude.json` (or equivalent):

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "@yourorg/meta-ads-mcp"],
      "env": { "META_ADS_MCP_APP_ID": "YOUR_APP_ID" }
    }
  }
}
```

**2. Authenticate** — once, from a terminal:

```bash
META_ADS_MCP_APP_ID=YOUR_APP_ID npx @yourorg/meta-ads-mcp auth
```

**3. Pick a default ad account** — from Claude, ask it to run `list_ad_accounts`, then `set_default_account`.

## Safety

Any write that raises `daily_budget` above $30 (configurable) returns a preview instead of executing. Re-call with `confirm: true` to execute.

```bash
META_ADS_MCP_CONFIRM_THRESHOLD=5000 # raise to $50/day
```

## Commands

- `meta-ads-mcp auth` — OAuth flow
- `meta-ads-mcp logout` — clear credentials
- `meta-ads-mcp whoami` — print current identity

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `META_ADS_MCP_APP_ID` | — | Facebook App ID (required) |
| `META_ADS_MCP_CONFIRM_THRESHOLD` | `3000` | Daily budget guard (cents) |
| `META_ADS_MCP_GRAPH_VERSION` | `v21.0` | Graph API version |
| `META_ADS_MCP_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `META_ADS_MCP_CREDENTIALS_DIR` | `~/.meta-ads-mcp` | Credentials file location |

## Troubleshooting

- **`AUTH_EXPIRED`** — run `meta-ads-mcp auth` again.
- **`PERMISSION_DENIED`** on leads — page owner must grant the app access via Business Manager.
- **`RATE_LIMITED`** — wait `retry_after_seconds`; Meta's per-app bucket is shared across teammates.
