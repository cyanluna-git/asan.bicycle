export type ReviewSurfaceSource = 'sidebar' | 'bottom-sheet' | null

export type ReviewSurfaceViewerState =
  | 'guest'
  | 'member'
  | 'own-review'

export function getReviewSurfaceViewerState({
  isLoggedIn,
  hasOwnReview,
}: {
  isLoggedIn: boolean
  hasOwnReview: boolean
}): ReviewSurfaceViewerState {
  if (!isLoggedIn) return 'guest'
  if (hasOwnReview) return 'own-review'
  return 'member'
}

export function getReviewSurfaceIntroCopy({
  viewerState,
  reviewCount,
}: {
  viewerState: ReviewSurfaceViewerState
  reviewCount: number
}) {
  if (viewerState === 'guest') {
    return '로그인하면 직접 탄 느낌과 노면 메모를 바로 남길 수 있습니다.'
  }

  if (viewerState === 'own-review') {
    return '내 후기와 다른 라이더 반응을 한 흐름에서 비교하고 바로 다듬을 수 있습니다.'
  }

  if (reviewCount === 0) {
    return '아직 첫 라이더 후기가 없습니다. 첫 후기에서 코스 분위기를 만들어보세요.'
  }

  return '라이더들의 실제 체감 난이도와 노면 메모를 한 번에 확인하세요.'
}

export function getReviewEmptyStateCopy(viewerState: ReviewSurfaceViewerState) {
  if (viewerState === 'guest') {
    return '로그인하면 첫 라이더 후기를 남기고 이후 라이더에게 실전 정보를 전달할 수 있습니다.'
  }

  if (viewerState === 'own-review') {
    return '아직 다른 라이더 후기는 없습니다. 내 후기에서 코스 분위기를 먼저 만들어두었습니다.'
  }

  return '노면 상태, 체감 난이도, 쉬어가기 좋은 포인트를 남기면 다음 라이더에게 큰 도움이 됩니다.'
}

export function shouldRestoreCourseSheet({
  source,
  hasSelectedCourse,
}: {
  source: ReviewSurfaceSource
  hasSelectedCourse: boolean
}) {
  return source === 'bottom-sheet' && hasSelectedCourse
}
