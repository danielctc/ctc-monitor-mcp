/**
 * CTC Monitor MCP Server
 *
 * Real MCP protocol server (JSON-RPC over stdio) for AI tools.
 * Exposes CTC Monitor intelligence data to Claude, Cursor, and any MCP client.
 *
 * Usage:
 *   CTC_MONITOR_API_KEY=nk_... npx tsx src/server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
const REGIONS = ['western','europe','china','taiwan','japan','korea','sea','india','mena','africa','latam','balkans','central_asia','pacific','global'] as const
const REGION_LABELS: Record<string, string> = {western:'Americas',europe:'Europe',china:'China',taiwan:'Taiwan',japan:'Japan',korea:'South Korea',sea:'Southeast Asia',india:'South Asia',mena:'Africa & ME',africa:'Africa',latam:'Latin America',balkans:'Balkans',central_asia:'Central Asia',pacific:'Pacific Islands',global:'Global'}
const CATEGORIES = ['ai','cloud','security','startups','venture','robotics','fintech','semiconductors','telecom','government','channel','healthtech','edtech','gaming','sustainability','quantum','space','other'] as const

import { createHash } from 'node:crypto'
import { hostname, platform, arch } from 'node:os'

const API_BASE = 'https://www.comparethecloud.net/monitor/api'
const API_KEY = process.env['CTC_MONITOR_API_KEY'] ?? ''
const PACKAGE_VERSION = '1.0.4'

// Anonymous boot fingerprint — sha256 of platform+arch+hostname, truncated.
// Gives us a stable per-machine count without identifying the user.
function bootFingerprint(): string {
  return createHash('sha256').update(`${platform()}:${arch()}:${hostname()}`).digest('hex').slice(0, 16)
}

async function fireBootPing(): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    await fetch(`${API_BASE}/telemetry/mcp-boot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: PACKAGE_VERSION,
        hasKey: Boolean(API_KEY),
        fingerprint: bootFingerprint(),
      }),
      signal: controller.signal,
    })
  } catch {
    // telemetry must never break the MCP — swallow all errors
  } finally {
    clearTimeout(timeout)
  }
}

// ── API client ─────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-API-Key': API_KEY },
  })
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

// ── Types ──────────────────────────────────────────────────

interface Story {
  id: number
  title: string
  url: string
  translatedTitle: string | null
  sourceName: string | null
  region: string | null
  country: string | null
  category: string | null
  score: number | null
  publishedAt: string | null
  ingestedAt: string
  clusterId: number | null
  clusterItemCount: number | null
  velocityScore: number | null
  propagationTag: string | null
}

interface MapDot {
  country: string
  lat: number
  lng: number
  storyCount: number
  maxScore: number
  avgScore: number
  topTitle: string
  topCategory: string | null
  region: string | null
}

// ── Formatters ─────────────────────────────────────────────

/** Decode HTML entities (numeric, hex, and common named) back to plain text */
export function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
  }
  return text
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => named[entity] ?? entity)
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function regionLabel(region: string | null): string {
  if (!region) return 'Global'
  return REGION_LABELS[region] ?? region
}

function formatStories(stories: Story[]): string {
  if (stories.length === 0) return 'No stories found.'

  // Separate CTC/DL stories for pinning
  const ctcNames = ['Compare the Cloud', 'Disruptive Live']
  const featured = stories.filter((s) => ctcNames.includes(s.sourceName ?? ''))
  const rest = stories.filter((s) => !ctcNames.includes(s.sourceName ?? ''))

  // Group rest by region, cap western at 3
  const regionGroups = new Map<string, Story[]>()
  const westernCap = 3
  let westernCount = 0

  for (const story of rest) {
    const r = story.region ?? 'global'
    if (r === 'western') {
      if (westernCount >= westernCap) continue
      westernCount++
    }
    const group = regionGroups.get(r) ?? []
    group.push(story)
    regionGroups.set(r, group)
  }

  const lines: string[] = ['## CTC Monitor — Top Stories\n']

  if (featured.length > 0) {
    lines.push('### Featured')
    for (const s of featured) {
      lines.push(formatStoryLine(s))
    }
    lines.push('')
  }

  // Sort regions: non-western first, western last
  const sortedRegions = [...regionGroups.keys()].sort((a, b) => {
    if (a === 'western') return 1
    if (b === 'western') return -1
    return 0
  })

  for (const region of sortedRegions) {
    const group = regionGroups.get(region)!
    lines.push(`### ${regionLabel(region)} (${group.length})`)
    for (const s of group) {
      lines.push(formatStoryLine(s))
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatStoryLine(s: Story): string {
  const title = decodeHtmlEntities(s.translatedTitle ?? s.title)
  const score = s.score !== null ? ` (${s.score.toFixed(2)})` : ''
  const source = s.sourceName ?? 'Unknown'
  const region = regionLabel(s.region)
  const time = timeAgo(s.publishedAt ?? s.ingestedAt)
  const cluster = s.clusterItemCount && s.clusterItemCount > 1 ? ` · ${s.clusterItemCount} related` : ''
  return `- **${title}**${score}\n  ${source} · ${region} · ${time}${cluster}\n  ${s.url}`
}

// ── MCP Server ─────────────────────────────────────────────

const server = new McpServer({
  name: 'ctc-monitor',
  version: '1.0.0',
})

server.tool(
  'get_stories',
  'Get top scored tech stories from CTC Monitor with global diversity. Stories are scored by relevance, geographic novelty, and velocity. Results are grouped by region with Western sources capped to prevent US dominance.',
  {
    region: z.string().optional().describe('Filter by region key (e.g. europe, china, sea, western)'),
    category: z.string().optional().describe('Filter by category (e.g. ai, cloud, security, startups)'),
    limit: z.number().min(1).max(100).default(20).optional().describe('Number of stories (default 20, max 100)'),
  },
  async ({ region, category, limit }) => {
    const params = new URLSearchParams()
    if (region) params.set('region', region)
    if (category) params.set('category', category)
    if (limit) params.set('limit', String(limit))
    const qs = params.toString()
    const stories = await apiFetch<Story[]>(`/stories${qs ? `?${qs}` : ''}`)
    return { content: [{ type: 'text' as const, text: formatStories(stories) }] }
  },
)

server.tool(
  'search_stories',
  'Full-text search across all CTC Monitor stories. Searches titles in all languages.',
  {
    query: z.string().min(2).describe('Search query (minimum 2 characters)'),
    limit: z.number().min(1).max(50).default(10).optional().describe('Number of results (default 10, max 50)'),
  },
  async ({ query, limit }) => {
    const params = new URLSearchParams({ q: query })
    if (limit) params.set('limit', String(limit))
    const stories = await apiFetch<Story[]>(`/search?${params}`)
    if (stories.length === 0) {
      return { content: [{ type: 'text' as const, text: `No stories found for "${query}".` }] }
    }
    const lines = [`## CTC Monitor — Search results for "${query}"\n`]
    for (const s of stories) {
      lines.push(formatStoryLine(s))
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'get_stats',
  'Get a 7-day rolling intelligence overview from CTC Monitor — story counts, region/category/country breakdowns, trending categories, top sources, and highest-scoring stories.',
  {},
  async () => {
    const stats = await apiFetch<Record<string, unknown>>('/stats')

    const lines = ['## CTC Monitor — Intelligence Overview (7-day rolling)\n']

    const storyCount = stats['storyCount'] as number | undefined
    const sourceCount = stats['sourceCount'] as number | undefined
    const countryCount = stats['countryCount'] as number | undefined
    if (storyCount) lines.push(`**${storyCount}** stories from **${sourceCount}** sources across **${countryCount}** countries\n`)

    const regionBreakdown = stats['regionBreakdown'] as Record<string, number> | undefined
    if (regionBreakdown) {
      lines.push('### Stories by region')
      for (const [r, count] of Object.entries(regionBreakdown).sort((a, b) => b[1] - a[1])) {
        lines.push(`- ${regionLabel(r)}: ${count}`)
      }
      lines.push('')
    }

    const categoryBreakdown = stats['categoryBreakdown'] as Record<string, number> | undefined
    if (categoryBreakdown) {
      lines.push('### Stories by category')
      for (const [cat, count] of Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        lines.push(`- ${cat}: ${count}`)
      }
      lines.push('')
    }

    const topScoring = stats['topScoring'] as Array<{ title: string; score: number; category: string; region: string; sourceName: string }> | undefined
    if (topScoring && topScoring.length > 0) {
      lines.push('### Top scoring stories')
      for (const s of topScoring.slice(0, 5)) {
        lines.push(`- **${s.title}** (${s.score.toFixed(2)}) — ${s.sourceName}, ${regionLabel(s.region)}`)
      }
      lines.push('')
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'get_map',
  'Get geographic story distribution — which countries have active tech stories, how many, and what the top headline is per country.',
  {
    region: z.string().optional().describe('Filter by region key'),
  },
  async ({ region }) => {
    const qs = region ? `?region=${region}` : ''
    const dots = await apiFetch<MapDot[]>(`/map-state${qs}`)

    if (dots.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No geographic data available.' }] }
    }

    const lines = ['## CTC Monitor — Geographic Distribution\n']
    const sorted = dots.sort((a, b) => b.storyCount - a.storyCount)

    for (const dot of sorted) {
      lines.push(`### ${dot.country} (${dot.storyCount} stories, avg score ${dot.avgScore.toFixed(2)})`)
      lines.push(`Top story: ${dot.topTitle}`)
      if (dot.topCategory) lines.push(`Category: ${dot.topCategory}`)
      lines.push('')
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'get_cluster',
  'Get details of a story cluster — related stories grouped by topic, with blast radius and propagation data.',
  {
    clusterId: z.number().describe('Cluster ID'),
  },
  async ({ clusterId }) => {
    const data = await apiFetch<Record<string, unknown>>(`/clusters/${clusterId}`)
    const items = (data['items'] ?? []) as Story[]

    const lines = [`## CTC Monitor — Cluster #${clusterId}\n`]

    if (data['title']) lines.push(`**${data['title']}**`)
    if (data['summary']) lines.push(`${data['summary']}\n`)

    const itemCount = data['itemCount'] as number | undefined
    const propagationTag = data['propagationTag'] as string | undefined
    const velocityScore = data['velocityScore'] as number | undefined

    if (itemCount) lines.push(`Stories: ${itemCount}`)
    if (propagationTag) lines.push(`Propagation: ${propagationTag}`)
    if (velocityScore) lines.push(`Velocity: ${velocityScore}`)
    lines.push('')

    if (items.length > 0) {
      lines.push('### Related stories')
      for (const s of items) {
        lines.push(formatStoryLine(s))
      }
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'get_regions',
  'List all available regions and categories in CTC Monitor.',
  {},
  async () => {
    const lines = ['## CTC Monitor — Available Regions and Categories\n']

    lines.push('### Regions')
    for (const r of REGIONS) {
      lines.push(`- \`${r}\` — ${REGION_LABELS[r] ?? r}`)
    }
    lines.push('')

    lines.push('### Categories')
    for (const c of CATEGORIES) {
      lines.push(`- \`${c}\``)
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'get_digest',
  'Get a regional digest — top stories summarised per region. Provide the regions you want coverage for.',
  {
    regions: z.array(z.string()).min(1).describe('Array of region keys (e.g. ["europe", "china", "sea"])'),
  },
  async ({ regions }) => {
    // Validate regions
    const valid = regions.filter((r) => (REGIONS as readonly string[]).includes(r))
    if (valid.length === 0) {
      return { content: [{ type: 'text' as const, text: `No valid regions provided. Use get_regions to see available options.` }] }
    }

    const lines = ['## CTC Monitor — Regional Digest\n']

    for (const region of valid) {
      const stories = await apiFetch<Story[]>(`/stories?region=${region}&limit=5`)
      lines.push(`### ${regionLabel(region)}`)

      if (stories.length === 0) {
        lines.push('No recent stories for this region.\n')
        continue
      }

      for (const s of stories) {
        lines.push(formatStoryLine(s))
      }
      lines.push('')
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

server.tool(
  'get_preferences',
  'View the current user\'s newsletter digest preferences — which regions they subscribe to and frequency.',
  {},
  async () => {
    const response = await fetch(`${API_BASE}/preferences`, {
      headers: { 'X-API-Key': API_KEY },
    })

    if (!response.ok) {
      return { content: [{ type: 'text' as const, text: 'Could not fetch preferences. The user may need to log in at comparethecloud.net/monitor/preferences to configure their digest.' }] }
    }

    const prefs = await response.json() as {
      email: string
      digestRegions: string[]
      digestFrequency: string
      unsubscribedAt: string | null
    }

    const lines = ['## CTC Monitor — Digest Preferences\n']
    lines.push(`**Email:** ${prefs.email}`)
    lines.push(`**Frequency:** ${prefs.digestFrequency}`)
    lines.push(`**Unsubscribed:** ${prefs.unsubscribedAt ? 'Yes' : 'No'}`)
    lines.push('')

    if (prefs.digestRegions.length > 0) {
      lines.push('**Subscribed regions:**')
      for (const r of prefs.digestRegions) {
        lines.push(`- ${regionLabel(r)}`)
      }
    } else {
      lines.push('No regions selected. Visit comparethecloud.net/monitor/preferences to choose regions.')
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  },
)

// ── Start ──────────────────────────────────────────────────

async function main() {
  // Fire anonymous boot ping — works whether or not a key is set, so we see
  // installs that haven't completed registration yet.
  void fireBootPing()

  if (!API_KEY) {
    console.error('[ctc-monitor] CTC_MONITOR_API_KEY not set — register at https://www.comparethecloud.net/monitor')
    process.exit(1)
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Only boot the stdio server when this file is the process entry point —
// prevents `main()` running (and calling process.exit on missing API key)
// when the module is imported from tests.
const isEntryPoint = (() => {
  if (typeof process === 'undefined') return false
  const entry = process.argv[1]
  if (!entry) return false
  return entry.endsWith('/server.ts') || entry.endsWith('/server.js') || entry.endsWith('/ctc-monitor-mcp')
})()

if (isEntryPoint) {
  main().catch((err) => {
    console.error('[ctc-monitor] Fatal:', err)
    process.exit(1)
  })
}
