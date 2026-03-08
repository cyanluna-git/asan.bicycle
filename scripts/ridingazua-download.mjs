#!/usr/bin/env node

import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_BASE_URL = 'https://ridingazua.cc'
const DEFAULT_OUTPUT_DIR = 'courses/ridingazua'
const DEFAULT_FORMATS = ['gpx', 'tcx']
const VALID_FORMATS = new Set(DEFAULT_FORMATS)

export function sanitizeFilenamePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function decodeJsSingleQuotedString(value) {
  return value
    .replace(/\\\\/g, '\\')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
}

export function parseCoursePage(html, courseUrl) {
  const titleMatch = html.match(/<title>(.*?) - Ridingazua! Editor<\/title>/s)
  const encodedCourseMatch = html.match(/ridingazuaApplication\.encodedCourse = '([^']*)'/)
  const errorMessageMatch = html.match(/ridingazuaApplication\.errorMessage = '((?:\\'|[^'])*)'/)

  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null
  const encodedCourse = encodedCourseMatch?.[1] ?? ''
  const errorMessage = errorMessageMatch ? decodeJsSingleQuotedString(errorMessageMatch[1]) : ''

  let visibility = 'unknown'
  if (encodedCourse.length > 0) {
    visibility = 'public'
  } else if (errorMessage.includes('Course is not found')) {
    visibility = 'missing'
  } else if (errorMessage.length > 0) {
    visibility = 'non_public'
  }

  return {
    courseUrl,
    title,
    encodedCourse,
    errorMessage,
    visibility,
  }
}

export function buildDownloadFilename(courseId, title, format) {
  const safeTitle = sanitizeFilenamePart(title) || 'course'
  return `${String(courseId)}_${safeTitle}.${format}`
}

export function manifestToCsv(entries) {
  const headers = [
    'courseId',
    'courseUrl',
    'title',
    'visibility',
    'errorMessage',
    'gpxStatus',
    'gpxPath',
    'tcxStatus',
    'tcxPath',
  ]

  const escapeCell = (value) => {
    const stringValue = value == null ? '' : String(value)
    if (!/[",\n]/.test(stringValue)) {
      return stringValue
    }
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  const rows = entries.map((entry) => [
    entry.courseId,
    entry.courseUrl,
    entry.title ?? '',
    entry.visibility,
    entry.errorMessage ?? '',
    entry.downloads?.gpx?.status ?? '',
    entry.downloads?.gpx?.path ?? '',
    entry.downloads?.tcx?.status ?? '',
    entry.downloads?.tcx?.path ?? '',
  ])

  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n')
}

function buildManifest(entries, options) {
  const counts = entries.reduce(
    (accumulator, entry) => {
      accumulator[entry.visibility] = (accumulator[entry.visibility] ?? 0) + 1
      for (const format of DEFAULT_FORMATS) {
        const status = entry.downloads?.[format]?.status
        if (!status) {
          continue
        }
        const key = `${format}:${status}`
        accumulator[key] = (accumulator[key] ?? 0) + 1
      }
      return accumulator
    },
    {},
  )

  return {
    generatedAt: new Date().toISOString(),
    options: {
      start: options.start,
      end: options.end ?? null,
      stopAfterMisses: options.stopAfterMisses ?? null,
      formats: options.formats,
      force: options.force,
      outputDir: options.outputDir,
      baseUrl: options.baseUrl,
      delayMs: options.delayMs,
    },
    counts,
    entries,
  }
}

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

async function downloadCourseFormat({ baseUrl, encodedCourse, courseId, title, format, outputDir, force, fetchImpl }) {
  const formatDirectory = path.join(outputDir, format)
  await mkdir(formatDirectory, { recursive: true })

  const filename = buildDownloadFilename(courseId, title, format)
  const filePath = path.join(formatDirectory, filename)
  const relativePath = path.relative(outputDir, filePath)

  if (!force && (await pathExists(filePath))) {
    return {
      status: 'skipped_existing',
      path: relativePath,
      bytes: null,
    }
  }

  const body = new URLSearchParams({
    course: encodedCourse,
    type: format,
  })

  const response = await fetchImpl(`${baseUrl}/editor/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Download failed for ${courseId} (${format}): ${response.status} ${response.statusText}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(filePath, bytes)

  return {
    status: 'downloaded',
    path: relativePath,
    bytes: bytes.byteLength,
  }
}

async function writeManifestFiles(outputDir, manifestBaseName, entries, options) {
  await mkdir(outputDir, { recursive: true })

  const manifest = buildManifest(entries, options)
  const jsonPath = path.join(outputDir, `${manifestBaseName}.json`)
  const csvPath = path.join(outputDir, `${manifestBaseName}.csv`)

  await writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(csvPath, `${manifestToCsv(entries)}\n`)
}

function normalizeFormats(value) {
  const parts = String(value)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  if (parts.length === 0) {
    return []
  }

  for (const part of parts) {
    if (!VALID_FORMATS.has(part)) {
      throw new Error(`Unsupported format: ${part}`)
    }
  }

  return [...new Set(parts)]
}

function parseInteger(value, flagName) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected an integer for ${flagName}, got: ${value}`)
  }
  return parsed
}

export function parseArgs(argv) {
  const options = {
    start: null,
    end: null,
    stopAfterMisses: null,
    formats: [...DEFAULT_FORMATS],
    outputDir: DEFAULT_OUTPUT_DIR,
    manifestBaseName: 'manifest',
    baseUrl: DEFAULT_BASE_URL,
    delayMs: 0,
    force: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }

    if (argument === '--force') {
      options.force = true
      continue
    }

    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }

    const [rawFlag, inlineValue] = argument.split('=', 2)
    const flag = rawFlag.slice(2)
    const nextValue = inlineValue ?? argv[index + 1]

    if (inlineValue == null && nextValue == null) {
      throw new Error(`Missing value for --${flag}`)
    }

    const consumeNext = () => {
      if (inlineValue == null) {
        index += 1
      }
      return nextValue
    }

    switch (flag) {
      case 'start':
        options.start = parseInteger(consumeNext(), '--start')
        break
      case 'end':
        options.end = parseInteger(consumeNext(), '--end')
        break
      case 'stop-after-misses':
        options.stopAfterMisses = parseInteger(consumeNext(), '--stop-after-misses')
        break
      case 'formats':
        options.formats = normalizeFormats(consumeNext())
        break
      case 'output-dir':
        options.outputDir = consumeNext()
        break
      case 'manifest-name':
        options.manifestBaseName = consumeNext()
        break
      case 'base-url':
        options.baseUrl = consumeNext().replace(/\/+$/g, '')
        break
      case 'delay-ms':
        options.delayMs = parseInteger(consumeNext(), '--delay-ms')
        break
      default:
        throw new Error(`Unknown flag: --${flag}`)
    }
  }

  if (options.help) {
    return options
  }

  if (options.start == null) {
    throw new Error('Missing required flag: --start')
  }

  if (options.end != null && options.end < options.start) {
    throw new Error('--end must be greater than or equal to --start')
  }

  if (options.end == null && (options.stopAfterMisses == null || options.stopAfterMisses <= 0)) {
    throw new Error('When --end is omitted, provide --stop-after-misses with a positive integer')
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/ridingazua-download.mjs --start 200000 --end 200138
  node scripts/ridingazua-download.mjs --start 200000 --stop-after-misses 50 --formats gpx

Options:
  --start <id>               Inclusive numeric course ID to start scanning from
  --end <id>                 Inclusive numeric course ID to stop at
  --stop-after-misses <n>    Stop after n consecutive missing IDs (when --end is omitted)
  --formats <list>           Comma-separated subset of: gpx,tcx (default: gpx,tcx)
  --output-dir <path>        Download and manifest directory (default: courses/ridingazua)
  --manifest-name <name>     Base name for manifest files (default: manifest)
  --delay-ms <n>             Delay between course requests in milliseconds
  --force                    Overwrite existing downloaded files
  --base-url <url>           Override the site base URL (default: https://ridingazua.cc)
  --help                     Show this help message`)
}

async function maybeDelay(delayMs) {
  if (delayMs <= 0) {
    return
  }
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

export async function runDownload(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const log = dependencies.log ?? console
  const entries = []
  let consecutiveMissing = 0
  let sawPublicCourse = false

  for (let courseId = options.start; ; courseId += 1) {
    if (options.end != null && courseId > options.end) {
      break
    }

    const courseUrl = `${options.baseUrl}/c/${courseId}`
    log.info(`Scanning ${courseUrl}`)

    let entry

    try {
      const html = await fetchText(courseUrl, fetchImpl)
      const parsed = parseCoursePage(html, courseUrl)

      entry = {
        courseId,
        courseUrl,
        title: parsed.title,
        visibility: parsed.visibility,
        errorMessage: parsed.errorMessage,
        downloads: {},
      }

      if (parsed.visibility === 'public') {
        sawPublicCourse = true
        consecutiveMissing = 0

        for (const format of options.formats) {
          try {
            entry.downloads[format] = await downloadCourseFormat({
              baseUrl: options.baseUrl,
              encodedCourse: parsed.encodedCourse,
              courseId,
              title: parsed.title ?? '',
              format,
              outputDir: options.outputDir,
              force: options.force,
              fetchImpl,
            })
          } catch (error) {
            entry.downloads[format] = {
              status: 'failed',
              path: null,
              bytes: null,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }
      } else if (parsed.visibility === 'missing') {
        consecutiveMissing += 1
        for (const format of options.formats) {
          entry.downloads[format] = {
            status: 'not_public',
            path: null,
            bytes: null,
          }
        }
      } else {
        consecutiveMissing = 0
        for (const format of options.formats) {
          entry.downloads[format] = {
            status: 'not_public',
            path: null,
            bytes: null,
          }
        }
      }
    } catch (error) {
      consecutiveMissing = 0
      entry = {
        courseId,
        courseUrl,
        title: null,
        visibility: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        downloads: {},
      }
      for (const format of options.formats) {
        entry.downloads[format] = {
          status: 'failed',
          path: null,
          bytes: null,
        }
      }
      log.warn(`Failed to process ${courseUrl}: ${entry.errorMessage}`)
    }

    entries.push(entry)
    await writeManifestFiles(options.outputDir, options.manifestBaseName, entries, options)

    if (
      options.end == null &&
      sawPublicCourse &&
      options.stopAfterMisses != null &&
      consecutiveMissing >= options.stopAfterMisses
    ) {
      log.info(`Stopping after ${consecutiveMissing} consecutive missing IDs.`)
      break
    }

    await maybeDelay(options.delayMs)
  }

  return buildManifest(entries, options)
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      printHelp()
      return
    }

    const manifest = await runDownload(options)
    console.log(
      JSON.stringify(
        {
          generatedAt: manifest.generatedAt,
          counts: manifest.counts,
          outputDir: options.outputDir,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
