export function shouldUseHandleOnlySheet(hasSelectedCourse: boolean) {
  return hasSelectedCourse
}

export function getSheetGestureHint(hasSelectedCourse: boolean) {
  if (!hasSelectedCourse) {
    return null
  }

  return '손잡이를 끌어 시트를 닫고, 지도에서는 확대/이동을 그대로 사용할 수 있습니다.'
}
