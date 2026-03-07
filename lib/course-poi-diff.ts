export type ExistingCoursePoi = {
  id: string
}

export type SubmittedCoursePoi = {
  id?: string | null
  name: string
  category?: string | null
  description?: string | null
  lat: number
  lng: number
  photo_url?: string | null
}

export type CoursePoiDiffPlan = {
  toInsert: Array<Omit<SubmittedCoursePoi, 'id'>>
  toUpdate: Array<{ id: string } & Omit<SubmittedCoursePoi, 'id'>>
  toDeleteIds: string[]
  invalidIds: string[]
  duplicateIds: string[]
}

export function buildCoursePoiDiffPlan(
  existingPois: ExistingCoursePoi[],
  submittedPois: SubmittedCoursePoi[],
): CoursePoiDiffPlan {
  const existingIds = new Set(existingPois.map((poi) => poi.id))
  const keptIds = new Set<string>()
  const duplicateIds = new Set<string>()
  const invalidIds = new Set<string>()
  const toInsert: CoursePoiDiffPlan['toInsert'] = []
  const toUpdate: CoursePoiDiffPlan['toUpdate'] = []

  for (const poi of submittedPois) {
    if (poi.id) {
      if (!existingIds.has(poi.id)) {
        invalidIds.add(poi.id)
        continue
      }

      if (keptIds.has(poi.id)) {
        duplicateIds.add(poi.id)
        continue
      }

      keptIds.add(poi.id)
      toUpdate.push({
        id: poi.id,
        name: poi.name,
        category: poi.category,
        description: poi.description,
        lat: poi.lat,
        lng: poi.lng,
        photo_url: poi.photo_url,
      })
      continue
    }

    toInsert.push({
      name: poi.name,
      category: poi.category,
      description: poi.description,
      lat: poi.lat,
      lng: poi.lng,
      photo_url: poi.photo_url,
    })
  }

  const toDeleteIds = existingPois
    .map((poi) => poi.id)
    .filter((id) => !keptIds.has(id))

  return {
    toInsert,
    toUpdate,
    toDeleteIds,
    invalidIds: [...invalidIds],
    duplicateIds: [...duplicateIds],
  }
}
