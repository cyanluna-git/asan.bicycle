/**
 * Vitest setup file: load environment variables from .env.local and
 * .env.test.local manually (without pulling in dotenv as a dep).
 *
 * Only fills variables that are not already set, so CI-provided secrets
 * still take precedence. Does nothing if neither file exists.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  const out: Record<string, string> = {}

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()

    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    out[key] = value
  }

  return out
}

function applyEnv(path: string): void {
  const parsed = parseEnvFile(path)
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

const root = resolve(__dirname, '..', '..')
applyEnv(resolve(root, '.env.local'))
applyEnv(resolve(root, '.env.test.local'))
