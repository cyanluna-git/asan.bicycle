const POI_PHOTO_BUCKET = 'poi-photos'
const PUBLIC_BUCKET_PATH = `/storage/v1/object/public/${POI_PHOTO_BUCKET}/`

type ExistingPoiPhotoRef = {
  id: string
  photo_url: string | null
}

type SubmittedPoiPhotoRef = {
  id?: string | null
  photo_url?: string | null
}

export function extractPoiPhotoPath(photoUrl: string | null | undefined) {
  if (!photoUrl) {
    return null
  }

  try {
    const url = new URL(photoUrl)
    const markerIndex = url.pathname.indexOf(PUBLIC_BUCKET_PATH)
    if (markerIndex === -1) {
      return null
    }

    const path = url.pathname.slice(markerIndex + PUBLIC_BUCKET_PATH.length)
    return path ? decodeURIComponent(path) : null
  } catch {
    return null
  }
}

export function getStalePoiPhotoPaths(
  existingPois: ExistingPoiPhotoRef[],
  submittedPois: SubmittedPoiPhotoRef[],
) {
  const submittedById = new Map(
    submittedPois
      .filter((poi): poi is Required<Pick<SubmittedPoiPhotoRef, 'id'>> & SubmittedPoiPhotoRef => Boolean(poi.id))
      .map((poi) => [poi.id, poi]),
  )
  const finalUrls = new Set(
    submittedPois
      .map((poi) => poi.photo_url?.trim() || null)
      .filter((url): url is string => Boolean(url)),
  )
  const stalePaths = new Set<string>()

  for (const existingPoi of existingPois) {
    const oldUrl = existingPoi.photo_url?.trim() || null
    if (!oldUrl) {
      continue
    }

    const nextPoi = submittedById.get(existingPoi.id)
    if (nextPoi?.photo_url?.trim() === oldUrl) {
      continue
    }

    if (finalUrls.has(oldUrl)) {
      continue
    }

    const path = extractPoiPhotoPath(oldUrl)
    if (path) {
      stalePaths.add(path)
    }
  }

  return [...stalePaths]
}

export { POI_PHOTO_BUCKET }
