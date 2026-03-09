import { describe, expect, it } from 'vitest'
import { getCourseOwnershipDiagnosis } from '@/lib/course-ownership-ui'

describe('getCourseOwnershipDiagnosis', () => {
  it('marks the viewer as owner when the course belongs to the signed-in user', () => {
    expect(
      getCourseOwnershipDiagnosis({
        canEdit: true,
        courseOwnerId: 'user-1',
        userId: 'user-1',
        isAdmin: false,
        uploaderName: '아산라이더',
      }),
    ).toMatchObject({
      badgeLabel: '내 코스',
      statusLabel: '수정 가능',
      canEdit: true,
    })
  })

  it('marks an admin override clearly', () => {
    expect(
      getCourseOwnershipDiagnosis({
        canEdit: true,
        courseOwnerId: 'user-1',
        userId: 'admin-1',
        isAdmin: true,
        uploaderName: '홍길동',
      }),
    ).toMatchObject({
      badgeLabel: '관리자 권한',
      statusLabel: '수정 가능',
      canEdit: true,
    })
  })

  it('asks guests to log in before checking ownership', () => {
    expect(
      getCourseOwnershipDiagnosis({
        canEdit: false,
        courseOwnerId: 'user-1',
        userId: null,
        isAdmin: false,
        uploaderName: '홍길동',
      }),
    ).toMatchObject({
      badgeLabel: '로그인 필요',
      statusLabel: '수정 불가',
      canEdit: false,
    })
  })

  it('explains when a course belongs to another rider', () => {
    const diagnosis = getCourseOwnershipDiagnosis({
      canEdit: false,
      courseOwnerId: 'user-1',
      userId: 'user-2',
      isAdmin: false,
      uploaderName: '홍길동',
    })

    expect(diagnosis).toMatchObject({
      badgeLabel: '다른 라이더 코스',
      statusLabel: '수정 불가',
      canEdit: false,
    })
    expect(diagnosis.description).toContain('홍길동')
  })

  it('explains when ownership has not been assigned yet', () => {
    expect(
      getCourseOwnershipDiagnosis({
        canEdit: false,
        courseOwnerId: null,
        userId: 'user-2',
        isAdmin: false,
        uploaderName: null,
      }),
    ).toMatchObject({
      badgeLabel: '소유 정보 없음',
      statusLabel: '수정 불가',
      canEdit: false,
    })
  })
})
