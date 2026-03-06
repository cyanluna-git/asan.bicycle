function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function formatDatePart(dateSource: string | Date) {
  const date = typeof dateSource === 'string' ? new Date(dateSource) : dateSource
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function buildCourseDownloadFilename(title: string, dateSource: string | Date) {
  const safeTitle = sanitizeFilenamePart(title) || 'course'
  const datePart = formatDatePart(dateSource)
  return `${safeTitle}_${datePart}.gpx`
}
