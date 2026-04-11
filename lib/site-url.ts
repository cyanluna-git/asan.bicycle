const DEFAULT_SITE_URL = 'https://www.gulrim.com'

function normalizeSiteUrl(value: string | undefined) {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    return new URL(normalized).toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getSiteUrl() {
  return (
    normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeSiteUrl(process.env.VERCEL_URL) ??
    DEFAULT_SITE_URL
  )
}
