# CTC Monitor MCP

Global tech intelligence for any AI agent that speaks MCP. Point Claude, Cursor, Windsurf, Zed, or any other MCP-aware tool at this server and ask what the world's tech press is reporting right now, in any region you care about.

Most AI assistants see the internet through a narrow US-tech-Twitter lens. CTC Monitor pulls stories from 500+ sources across China, South-East Asia, India, MENA, Africa, Latin America, Europe, Korea, Taiwan, Japan, and the Pacific, scores them for velocity and geographic novelty, caps western-source dominance, and translates non-English headlines. Your agent gets a genuinely global view of what's moving in tech.

## What you get

Seven tools, plain JSON-RPC over stdio. Ask your agent things like:

- "What's breaking in cloud and AI across Asia today?"
- "Summarise the last 24 hours from China, Korea, and Taiwan."
- "Search everything we've indexed for 'post-quantum cryptography'."
- "Which countries have the most stories right now, and what's the top headline in each?"
- "Give me the propagation picture for cluster 4812."

| Tool | Does what |
|---|---|
| `get_stories` | Top-scored stories, optionally filtered by region or category. Western sources capped so you don't get a US-only feed. |
| `search_stories` | Full-text search across every indexed story, including translated titles. |
| `get_stats` | Seven-day rolling overview: story counts, regions, categories, top sources, highest scorers. |
| `get_map` | Geographic distribution: which countries are hot, story counts, top headline per country. |
| `get_cluster` | Detailed view of a story cluster — related items, blast radius, velocity, propagation tag. |
| `get_regions` | Lists every region key and category the feed supports. |
| `get_digest` | Pass an array of regions, get a summarised digest per region in one call. |

Stories carry their original source, translated title where applicable, region, country, category, a relevance score, a cluster ID, a velocity score, and a propagation tag for how the story is spreading.

## Install

```bash
npm install -g ctc-monitor-mcp
```

Or run without installing:

```bash
npx ctc-monitor-mcp
```

## Get an API key

The feed is free. You need a key so we can rate-limit fairly and so the digest emails know where to go.

1. Go to https://www.comparethecloud.net/monitor
2. Sign in with a work email. A verification link lands in your inbox.
3. Click it. Your API key is auto-generated and emailed to you. Save it somewhere safe; it isn't shown again in plain text.

Work emails only. Personal inboxes (gmail, outlook, yahoo and the like) are blocked at registration.

## Wire it up

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your OS:

```json
{
  "mcpServers": {
    "ctc-monitor": {
      "command": "npx",
      "args": ["ctc-monitor-mcp"],
      "env": {
        "CTC_MONITOR_API_KEY": "nk_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear in the tool menu.

### Cursor / Windsurf / Zed

In the MCP settings panel, add a server entry with:

- Command: `npx`
- Arguments: `ctc-monitor-mcp`
- Environment: `CTC_MONITOR_API_KEY=nk_your_key_here`

### Anywhere else

If your client takes an MCP stdio command, run:

```bash
CTC_MONITOR_API_KEY=nk_your_key_here npx ctc-monitor-mcp
```

## Rate limits

100 requests per minute per key. Plenty for interactive use; if you're building something higher-volume, get in touch via the site and we'll talk.

## What the data looks like

A typical `get_stories` call comes back grouped by region, with featured CTC/Disruptive Live content at the top, then region sections ordered so you see non-western markets before western coverage:

```
## CTC Monitor — Top Stories

### Europe (8)
- Alibaba Cloud expands Frankfurt region with AI-specific zones (0.87)
  South China Morning Post · Europe · 2h ago · 4 related
  https://...

### China (5)
- ...

### South-East Asia (4)
- ...

### Western (3)  ← capped to prevent US dominance
- ...
```

Clusters group related stories so a single headline doesn't drown out the rest of the news. Velocity scores and propagation tags surface stories that are spreading fast across languages and regions.

## What this is built on

CTC Monitor ingests from ~500 global tech sources including state-backed outlets, regional trade press, specialist analyst sites, and official feeds from every major cloud, chip, and AI vendor. Stories are de-duplicated, clustered across languages, scored for relevance and geographic novelty, and translated where needed. The dataset refreshes continuously.

Compare the Cloud has run enterprise tech coverage since 2013 and Disruptive Live produces the video layer. The Monitor is our editorial feed, exposed as an MCP so your agent can read the same intelligence our analysts do.

## Digest emails

Set your region preferences at https://www.comparethecloud.net/monitor/preferences and we'll send a daily or weekly digest matching your picks. Unsubscribe from any email.

## Support

- Issues and feature requests: https://github.com/comparethecloud/nolan/issues
- Help and integration questions: https://www.comparethecloud.net/monitor/help
- Press and partnership enquiries: the press page on comparethecloud.net

## Licence

MIT.
