export function canEnterMapFullscreen({
  hasSelectedCourse,
  activeSurfaceKind,
}: {
  hasSelectedCourse: boolean
  activeSurfaceKind: 'review' | 'album' | null
}) {
  return hasSelectedCourse && activeSurfaceKind === null
}

export function shouldExitMapFullscreen({
  hasSelectedCourse,
  activeSurfaceKind,
  isCourseSheetOpen,
}: {
  hasSelectedCourse: boolean
  activeSurfaceKind: 'review' | 'album' | null
  isCourseSheetOpen: boolean
}) {
  return !hasSelectedCourse || activeSurfaceKind !== null || isCourseSheetOpen
}

export function getCourseSheetTriggerLabel(hasSelectedCourse: boolean) {
  return hasSelectedCourse ? '코스 정보 보기' : '코스 목록 보기'
}
