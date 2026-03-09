import { NextResponse } from 'next/server'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import { extractPoiPhotoPath, POI_PHOTO_BUCKET } from '@/lib/poi-photo-storage'
import { normalizePoiCategory } from '@/lib/poi'
import { createAnonServerClient, createServiceRoleClient } from '@/lib/supabase-server'

type RouteContext = {
  params: Promise<{ id: string }>
}

type CreatePoiPayload = {
  name?: string
  category?: string | null
  description?: string | null
  photoPath?: string | null
  photoUrl?: string | null
  lat?: number | null
  lng?: number | null
}

type ExistingCourseRow = {
  id: string
  created_by: string | null
}

type ExistingPoiRow = {
  id: string
  name: string
  lat: number
  lng: number
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function readBearerToken(authorization: string | null) {
  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return authorization.slice('Bearer '.length).trim() || null
}

function isValidCoordinate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isDuplicatePoi(existingPois: ExistingPoiRow[], name: string, lat: number, lng: number) {
  return existingPois.some((poi) =>
    poi.name.trim() === name
    && Math.abs(poi.lat - lat) < 0.00005
    && Math.abs(poi.lng - lng) < 0.00005,
  )
}

export async function POST(request: Request, context: RouteContext) {
  const { id: courseId } = await context.params
  const accessToken = readBearerToken(request.headers.get('authorization'))

  if (!accessToken) {
    return jsonError('인증 토큰이 필요합니다.', 401)
  }

  let body: CreatePoiPayload
  try {
    body = await request.json()
  } catch {
    return jsonError('잘못된 요청 본문입니다.', 400)
  }

  const name = body.name?.trim() || ''
  const description = body.description?.trim() || null
  const photoPath = body.photoPath?.trim() || null
  const photoUrl = body.photoUrl?.trim() || null
  const lat = body.lat
  const lng = body.lng

  if (!name) {
    return jsonError('POI 이름이 필요합니다.', 400)
  }

  if (!isValidCoordinate(lat) || !isValidCoordinate(lng)) {
    return jsonError('유효한 POI 좌표가 필요합니다.', 400)
  }

  const poiLat = lat as number
  const poiLng = lng as number

  const authClient = createAnonServerClient()
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken)

  if (userError || !user) {
    return jsonError('세션이 만료되었습니다. 다시 로그인해주세요.', 401)
  }

  const courseResponse = await authClient
    .from('courses')
    .select('id, created_by')
    .eq('id', courseId)
    .single()

  if (courseResponse.error || !courseResponse.data) {
    return jsonError('POI를 추가할 코스를 찾을 수 없습니다.', 404)
  }

  const existingCourse = courseResponse.data as ExistingCourseRow
  const isAdmin = isAdminUser(user)
  const allowed = canEditCourse({
    courseOwnerId: existingCourse.created_by,
    userId: user.id,
    isAdmin,
  })

  if (!allowed) {
    return jsonError('이 코스에 POI를 추가할 권한이 없습니다.', 403)
  }

  if (photoPath || photoUrl) {
    if (!photoPath || !photoUrl) {
      return jsonError('POI 사진 경로 정보가 완전하지 않습니다.', 400)
    }

    const publicUrlPath = extractPoiPhotoPath(photoUrl)
    if (publicUrlPath !== photoPath) {
      return jsonError('POI 사진 경로가 올바르지 않습니다.', 400)
    }

    if (photoPath.split('/')[0] !== user.id) {
      return jsonError('본인 소유 경로의 POI 사진만 등록할 수 있습니다.', 403)
    }

    const lastSlash = photoPath.lastIndexOf('/')
    const storageFolder = photoPath.slice(0, lastSlash)
    const storageFileName = photoPath.slice(lastSlash + 1)
    const { data: storageFiles, error: storageListError } = await authClient
      .storage
      .from(POI_PHOTO_BUCKET)
      .list(storageFolder, { search: storageFileName, limit: 1 })

    if (storageListError || !storageFiles?.some((file) => file.name === storageFileName)) {
      return jsonError('업로드된 POI 사진 파일을 찾을 수 없습니다.', 400)
    }
  }

  const existingPoiResponse = await authClient
    .from('pois_with_coords')
    .select('id, name, lat, lng')
    .eq('course_id', courseId)

  if (existingPoiResponse.error) {
    return jsonError(`기존 POI 조회 실패: ${existingPoiResponse.error.message}`, 400)
  }

  if (isDuplicatePoi((existingPoiResponse.data ?? []) as ExistingPoiRow[], name, poiLat, poiLng)) {
    return jsonError('같은 위치의 동일한 POI가 이미 등록되어 있습니다.', 409)
  }

  let writeClient = createAnonServerClient(accessToken)
  if (isAdmin && existingCourse.created_by !== user.id) {
    const serviceRoleClient = createServiceRoleClient()
    if (!serviceRoleClient) {
      return jsonError(
        '관리자 대리 추가에는 SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.',
        503,
      )
    }
    writeClient = serviceRoleClient
  }

  const insertResponse = await writeClient
    .from('pois')
    .insert({
      course_id: courseId,
      name,
      category: normalizePoiCategory(body.category),
      description,
      photo_url: photoUrl,
      location: `SRID=4326;POINT(${poiLng} ${poiLat})`,
    })
    .select('id, course_id, name, category, description, photo_url')
    .single()

  if (insertResponse.error || !insertResponse.data) {
    return jsonError(`POI 저장 실패: ${insertResponse.error?.message ?? 'unknown error'}`, 400)
  }

  return NextResponse.json({
    poi: {
      ...insertResponse.data,
      lat: poiLat,
      lng: poiLng,
      photo_url: insertResponse.data.photo_url ?? null,
    },
  })
}
