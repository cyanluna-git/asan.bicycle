#!/usr/bin/env node

/**
 * Generate Gulrim (굴림) icon/logo candidates via the Recraft API.
 *
 * Fans out a small matrix of (concept × style) prompts and downloads
 * every returned SVG into scratch/icons/ for side-by-side review.
 * The winning candidate is then hand-exported into the six production
 * slots (app/favicon.ico, public/icons/*, public/og/gulrim-social.png).
 *
 * Prerequisite:
 *   1. Create a Recraft account and generate a token at recraft.ai.
 *   2. Add `RECRAFT_API_TOKEN=rc_...` to `.env.local`.
 *   3. Run with `--env-file=.env.local` so Node loads it for you.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-gulrim-icons.mjs
 *   node --env-file=.env.local scripts/generate-gulrim-icons.mjs --limit 4
 *   node --env-file=.env.local scripts/generate-gulrim-icons.mjs --dry-run
 *   node --env-file=.env.local scripts/generate-gulrim-icons.mjs --concept hangul --style v3-round
 *
 * Flags:
 *   --dry-run        Print the plan but make no network calls.
 *   --limit N        Cap total API calls at N (useful for cheap smoke tests).
 *   --concept KEY    Restrict to one concept (hangul | wordmark | chainring | horizon).
 *   --style KEY      Restrict to one style variant (v3-round | v3-bold | v2-icon).
 *   --n N            Images per prompt (default 2).
 *
 * Credit cost note: each vector image on Recraft V3 is ~2 API credits.
 * The full matrix (4 concepts × 3 styles × 2 images = 24 images) is
 * roughly one dollar depending on your plan — worth checking before
 * re-running.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const API_URL = 'https://external.api.recraft.ai/v1/images/generations'
const OUTPUT_DIR = path.resolve(process.cwd(), 'scratch/icons')
const BRAND_COLOR = '#994200'
const BRAND_BG = '#F7F3EA'

const CONCEPTS = [
  {
    key: 'hangul',
    prompt:
      `Minimalist flat vector logo mark: the Korean Hangul character "굴" ` +
      `where the circular ㅇ consonant is replaced by a stylized bicycle ` +
      `chainring with a short crank arm. Thick geometric strokes, clean ` +
      `unified silhouette. Single solid color terracotta ${BRAND_COLOR} on ` +
      `warm cream ${BRAND_BG} background. Square app icon, fully symmetric ` +
      `chainring, no gradients, no 3D, readable at 16x16 favicon size.`,
  },
  {
    key: 'wordmark',
    prompt:
      `Minimalist flat vector wordmark reading "GUL·RIM" in bold geometric ` +
      `sans-serif, where the dot between GUL and RIM is rendered as a tiny ` +
      `bicycle wheel with visible thin spokes. Horizontal lockup, ` +
      `terracotta ${BRAND_COLOR} letters and wheel on warm cream ${BRAND_BG} ` +
      `background. Clean modern logotype, no gradients, no 3D, crisp edges.`,
  },
  {
    key: 'chainring',
    prompt:
      `Minimalist flat vector app icon: a single bicycle chainring viewed ` +
      `head-on, perfectly circular with evenly spaced teeth around the rim ` +
      `and a simple 5-spoke star pattern inside. Solid terracotta ` +
      `${BRAND_COLOR} silhouette on warm cream ${BRAND_BG} background. ` +
      `Symmetric, geometric, modern, no gradients, no 3D, readable at 16x16.`,
  },
  {
    key: 'horizon',
    prompt:
      `Minimalist flat vector app icon: a single bicycle wheel rolling ` +
      `along a gently curved mountain ridge silhouette, suggesting forward ` +
      `motion. Solid terracotta ${BRAND_COLOR} wheel and ridge on warm ` +
      `cream ${BRAND_BG} background. Symbolic, geometric, calm, no ` +
      `gradients, no 3D, centered in a square frame.`,
  },
]

const STYLE_VARIANTS = [
  {
    key: 'v3-round',
    model: 'recraftv3_vector',
    style: 'roundish_flat',
    note: 'V3 vector · friendly modern rounded shapes',
  },
  {
    key: 'v3-bold',
    model: 'recraftv3_vector',
    style: 'bold_stroke',
    note: 'V3 vector · heavy strokes, strong at small sizes',
  },
  {
    key: 'v2-icon',
    model: 'recraftv2_vector',
    style: 'icon',
    note: 'V2 vector · purpose-built icon grammar',
  },
]

function parseArgs(argv) {
  const flags = {
    dryRun: false,
    limit: Infinity,
    concept: null,
    style: null,
    n: 2,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') flags.dryRun = true
    else if (arg === '--limit') flags.limit = Number(argv[++i])
    else if (arg === '--concept') flags.concept = argv[++i]
    else if (arg === '--style') flags.style = argv[++i]
    else if (arg === '--n') flags.n = Number(argv[++i])
  }
  if (!Number.isFinite(flags.limit)) flags.limit = Infinity
  if (!Number.isInteger(flags.n) || flags.n < 1) flags.n = 2
  return flags
}

function buildPlan(flags) {
  const concepts = flags.concept
    ? CONCEPTS.filter((c) => c.key === flags.concept)
    : CONCEPTS
  const styles = flags.style
    ? STYLE_VARIANTS.filter((s) => s.key === flags.style)
    : STYLE_VARIANTS
  if (concepts.length === 0) throw new Error(`Unknown --concept ${flags.concept}`)
  if (styles.length === 0) throw new Error(`Unknown --style ${flags.style}`)
  const jobs = []
  for (const concept of concepts) {
    for (const variant of styles) {
      jobs.push({ concept, variant })
    }
  }
  return jobs.slice(0, flags.limit)
}

async function callRecraft(token, concept, variant, n) {
  const body = {
    prompt: concept.prompt,
    model: variant.model,
    style: variant.style,
    n,
    size: '1024x1024',
    response_format: 'url',
  }
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Recraft API ${response.status} ${response.statusText}: ${text.slice(0, 400)}`,
    )
  }
  const json = /** @type {{ data: Array<{ url: string, b64_json?: string }> }} */ (
    await response.json()
  )
  return json.data ?? []
}

async function downloadSvg(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download ${response.status}: ${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  const token = process.env.RECRAFT_API_TOKEN

  if (!flags.dryRun && !token) {
    console.error(
      '[generate-gulrim-icons] RECRAFT_API_TOKEN is not set.\n' +
        '  Add it to .env.local, then run with: node --env-file=.env.local scripts/generate-gulrim-icons.mjs',
    )
    process.exit(1)
  }

  const jobs = buildPlan(flags)
  const totalImages = jobs.length * flags.n

  console.log(
    `[generate-gulrim-icons] ${jobs.length} prompts × ${flags.n} = ${totalImages} images`,
  )
  console.log(`[generate-gulrim-icons] output: ${OUTPUT_DIR}`)
  if (flags.dryRun) {
    for (const { concept, variant } of jobs) {
      console.log(`  - ${concept.key}/${variant.key} (${variant.note})`)
    }
    console.log('[generate-gulrim-icons] dry-run: no network calls made.')
    return
  }

  await mkdir(OUTPUT_DIR, { recursive: true })

  const manifest = []
  let index = 0
  for (const { concept, variant } of jobs) {
    index += 1
    const tag = `${concept.key}/${variant.key}`
    console.log(`[${index}/${jobs.length}] ${tag} → ${variant.model}/${variant.style}`)
    try {
      const results = await callRecraft(token, concept, variant, flags.n)
      for (let i = 0; i < results.length; i++) {
        const entry = results[i]
        if (!entry?.url) continue
        const filename = `${concept.key}-${variant.key}-${i + 1}.svg`
        const filepath = path.join(OUTPUT_DIR, filename)
        const buffer = await downloadSvg(entry.url)
        await writeFile(filepath, buffer)
        manifest.push({
          concept: concept.key,
          style: variant.key,
          model: variant.model,
          file: path.relative(process.cwd(), filepath),
          sourceUrl: entry.url,
        })
        console.log(`    ✓ ${filename} (${buffer.length} bytes)`)
      }
    } catch (error) {
      console.error(`    ✗ ${tag}:`, error instanceof Error ? error.message : error)
    }
  }

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`[generate-gulrim-icons] wrote ${manifest.length} files + manifest.json`)
  console.log(
    `[generate-gulrim-icons] open ${OUTPUT_DIR} in Finder (or a browser) to review.`,
  )
}

main().catch((error) => {
  console.error('[generate-gulrim-icons] fatal:', error)
  process.exit(1)
})
