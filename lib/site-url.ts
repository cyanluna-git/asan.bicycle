export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (!raw) {
    return 'https://asan-bicycle.vercel.app'
  }

  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}
