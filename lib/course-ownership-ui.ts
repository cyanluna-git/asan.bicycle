type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'

export type CourseOwnershipDiagnosis = {
  badgeLabel: string
  badgeVariant: BadgeVariant
  statusLabel: string
  description: string
  canEdit: boolean
}

export function getCourseOwnershipDiagnosis({
  canEdit,
  courseOwnerId,
  userId,
  isAdmin,
  uploaderName,
}: {
  canEdit: boolean
  courseOwnerId: string | null | undefined
  userId: string | null | undefined
  isAdmin: boolean
  uploaderName?: string | null
}): CourseOwnershipDiagnosis {
  const ownerName = uploaderName?.trim() || '다른 라이더'

  if (canEdit) {
    if (userId && courseOwnerId && courseOwnerId === userId) {
      return {
        badgeLabel: '내 코스',
        badgeVariant: 'default',
        statusLabel: '수정 가능',
        description: '내가 등록한 코스입니다. 메타데이터와 POI를 바로 수정할 수 있습니다.',
        canEdit: true,
      }
    }

    if (userId && isAdmin && courseOwnerId && courseOwnerId !== userId) {
      return {
        badgeLabel: '관리자 권한',
        badgeVariant: 'secondary',
        statusLabel: '수정 가능',
        description: `${ownerName}가 등록한 코스지만 관리자 권한으로 수정할 수 있습니다.`,
        canEdit: true,
      }
    }

    return {
      badgeLabel: '수정 가능',
      badgeVariant: 'secondary',
      statusLabel: '권한 확인됨',
      description: '현재 계정으로 이 코스를 수정할 수 있습니다.',
      canEdit: true,
    }
  }

  if (!userId) {
    return {
      badgeLabel: '로그인 필요',
      badgeVariant: 'outline',
      statusLabel: '수정 불가',
      description: '로그인하면 이 코스가 내 코스인지 확인할 수 있고, 소유한 코스만 수정할 수 있습니다.',
      canEdit: false,
    }
  }

  if (!courseOwnerId) {
    return {
      badgeLabel: '소유 정보 없음',
      badgeVariant: 'outline',
      statusLabel: '수정 불가',
      description: '아직 소유자 정보가 연결되지 않은 코스입니다. 권한 정리가 필요합니다.',
      canEdit: false,
    }
  }

  return {
    badgeLabel: '다른 라이더 코스',
    badgeVariant: 'outline',
    statusLabel: '수정 불가',
    description: `${ownerName}가 등록한 코스라 수정할 수 없습니다.`,
    canEdit: false,
  }
}
