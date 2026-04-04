import { NextResponse } from 'next/server'
import { buildRouteRenderMetadata } from '@/lib/course-render-metadata'
import { appendMetadataHistoryEntry, buildMetadataHistoryEntry } from '@/lib/course-upload'
import { buildCoursePoiDiffPlan } from '@/lib/course-poi-diff'
import { getStalePoiPhotoPaths, POI_PHOTO_BUCKET } from '@/lib/poi-photo-storage'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import { normalizePoiCategory } from '@/lib/poi'
import { resolveProfileEmoji } from '@/lib/profile'
import { createAnonServerClient, createServiceRoleClient } from '@/lib/supabase-server'
import { getUploaderDisplayName } from '@/lib/user-display-name'
import type { Json } from '@/types/database'

type PatchContext = {
  params: Promise<{ id: string }>
}

type PatchPayload = {
  title?: string
  description?: string | null
  difficulty?: 'easy' | 'moderate' | 'hard'
  theme?: string | null
  tags?: string[]
  startPointId?: string | null
  regionId?: string | null
  pois?: Array<{
    id?: string | null
    name?: string
    category?: string | null
    description?: string | null
    lat?: number | null
    lng?: number | null
    photo_url?: string | null
  }>
  uphillSegments?: Array<{
    name?: string | null
    start_km?: number
    end_km?: number
  }>
}

type ExistingCourseRow = {
  id: string
  created_by: string | null
  route_geojson?: Json | null
  uploader_name?: string | null
  uploader_emoji?: string | null
  metadata_history?: Json | null
}

type ExistingPoiRow = {
  id: string
  photo_url: string | null
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

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return []

  return tags
    .map((tag) => typeof tag === 'string' ? tag.trim() : '')
    .filter(Boolean)
}

export async function PATCH(request: Request, context: PatchContext) {
  const { id } = await context.params
  const accessToken = readBearerToken(request.headers.get('authorization'))

  if (!accessToken) {
    return jsonError('인증 토큰이 필요합니다.', 401)
  }

  let body: PatchPayload
  try {
    body = await request.json()
  } catch {
    return jsonError('잘못된 요청 본문입니다.', 400)
  }

  const title = body.title?.trim() ?? ''
  const difficulty = body.difficulty
  const tags = normalizeTags(body.tags)

  if (!title) {
    return jsonError('코스 이름은 필수입니다.', 400)
  }

  if (!difficulty || !['easy', 'moderate', 'hard'].includes(difficulty)) {
    return jsonError('유효한 난이도가 필요합니다.', 400)
  }

  const authClient = createAnonServerClient()
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken)

  if (userError || !user) {
    return jsonError('세션이 만료되었습니다. 다시 로그인해주세요.', 401)
  }

  let courseQuery = await authClient
    .from('courses')
    .select('id, created_by, route_geojson, uploader_name, uploader_emoji, metadata_history')
    .eq('id', id)
    .single()

  if (
    courseQuery.error
    && /(uploader_name|uploader_emoji|metadata_history|route_render_metadata)/i.test(courseQuery.error.message)
  ) {
    courseQuery = await authClient
      .from('courses')
      .select('id, created_by, route_geojson')
      .eq('id', id)
      .single()
  }

  if (courseQuery.error || !courseQuery.data) {
    return jsonError('수정할 코스를 찾을 수 없습니다.', 404)
  }

  const existingCourse = courseQuery.data as ExistingCourseRow
  const admin = isAdminUser(user)
  const allowed = canEditCourse({
    courseOwnerId: existingCourse.created_by,
    userId: user.id,
    isAdmin: admin,
  })

  if (!allowed) {
    return jsonError('이 코스를 수정할 권한이 없습니다.', 403)
  }

  let writeClient = createAnonServerClient(accessToken)
  if (admin && existingCourse.created_by !== user.id) {
    const serviceRoleClient = createServiceRoleClient()
    if (!serviceRoleClient) {
      return jsonError(
        '관리자 대리 수정에는 SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.',
        503,
      )
    }

    writeClient = serviceRoleClient
  }

  const actorDisplayName = getUploaderDisplayName(user)
  const baseUpdate = {
    title,
    description: body.description?.trim() || null,
    difficulty,
    theme: body.theme?.trim() || null,
    tags,
    start_point_id: body.startPointId || null,
    region_id: body.regionId || null,
    updated_at: new Date().toISOString(),
    route_render_metadata: buildRouteRenderMetadata(
      (existingCourse.route_geojson as Parameters<typeof buildRouteRenderMetadata>[0]) ?? null,
    ) as unknown as Json,
  }

  const uploaderName = existingCourse.uploader_name
    ?? (existingCourse.created_by === user.id ? actorDisplayName : null)
  const uploaderEmoji = existingCourse.uploader_emoji
    ?? (existingCourse.created_by === user.id ? resolveProfileEmoji(user) : null)

  let updateResponse = await writeClient
    .from('courses')
    .update({
      ...baseUpdate,
      uploader_name: uploaderName,
      uploader_emoji: uploaderEmoji,
      metadata_history: appendMetadataHistoryEntry(
        existingCourse.metadata_history,
        buildMetadataHistoryEntry({
          actorDisplayName,
          actorUserId: user.id,
          form: {
            title,
            description: body.description?.trim() || '',
            difficulty,
            theme: body.theme?.trim() || '',
            tags: tags.join(','),
            startPointId: body.startPointId || '',
          },
          tags,
          type: 'edit',
        }),
      ),
    })
    .eq('id', id)
    .select('id')
    .single()

  if (
    updateResponse.error
    && /(uploader_name|uploader_emoji|metadata_history|route_render_metadata)/i.test(updateResponse.error.message)
  ) {
    updateResponse = await writeClient
      .from('courses')
      .update({
        ...baseUpdate,
        route_render_metadata: undefined,
      })
      .eq('id', id)
      .select('id')
      .single()
  }

  if (updateResponse.error) {
    return jsonError(`코스 저장 실패: ${updateResponse.error.message}`, 400)
  }

  const existingPoiResponse = await authClient
    .from('pois')
    .select('id, photo_url')
    .eq('course_id', id)

  if (existingPoiResponse.error) {
    return jsonError(`기존 POI 조회 실패: ${existingPoiResponse.error.message}`, 400)
  }

  const completePois = (body.pois ?? []).filter(
    (poi) =>
      typeof poi.name === 'string'
      && poi.name.trim().length > 0
      && typeof poi.lat === 'number'
      && Number.isFinite(poi.lat)
      && typeof poi.lng === 'number'
      && Number.isFinite(poi.lng),
  )

  const poiDiff = buildCoursePoiDiffPlan(
    (existingPoiResponse.data ?? []) as ExistingPoiRow[],
    completePois.map((poi) => ({
      id: poi.id ?? null,
      name: poi.name!.trim(),
      category: normalizePoiCategory(poi.category),
      description: poi.description?.trim() || null,
      photo_url: poi.photo_url ?? null,
      lat: poi.lat!,
      lng: poi.lng!,
    })),
  )

  if (poiDiff.invalidIds.length > 0) {
    return jsonError('유효하지 않은 POI 식별자가 포함되어 있습니다.', 400)
  }

  if (poiDiff.duplicateIds.length > 0) {
    return jsonError('중복된 POI 식별자가 포함되어 있습니다.', 400)
  }

  const stalePoiPhotoPaths = getStalePoiPhotoPaths(
    (existingPoiResponse.data ?? []) as ExistingPoiRow[],
    completePois.map((poi) => ({
      id: poi.id ?? null,
      photo_url: poi.photo_url ?? null,
    })),
  )

  for (const poi of poiDiff.toUpdate) {
    const updatePoiResponse = await writeClient
      .from('pois')
      .update({
        name: poi.name,
        category: normalizePoiCategory(poi.category),
        description: poi.description?.trim() || null,
        photo_url: poi.photo_url ?? null,
        location: `SRID=4326;POINT(${poi.lng} ${poi.lat})`,
      })
      .eq('id', poi.id)
      .eq('course_id', id)

    if (updatePoiResponse.error) {
      return jsonError(`POI 수정 실패: ${updatePoiResponse.error.message}`, 400)
    }
  }

  if (poiDiff.toInsert.length > 0) {
    const insertPoiResponse = await writeClient
      .from('pois')
      .insert(
        poiDiff.toInsert.map((poi) => ({
          course_id: id,
          name: poi.name,
          category: normalizePoiCategory(poi.category),
          description: poi.description?.trim() || null,
          photo_url: poi.photo_url ?? null,
          location: `SRID=4326;POINT(${poi.lng} ${poi.lat})`,
        })),
      )

    if (insertPoiResponse.error) {
      return jsonError(`POI 저장 실패: ${insertPoiResponse.error.message}`, 400)
    }
  }

  if (poiDiff.toDeleteIds.length > 0) {
    const deletePoiResponse = await writeClient
      .from('pois')
      .delete()
      .eq('course_id', id)
      .in('id', poiDiff.toDeleteIds)

    if (deletePoiResponse.error) {
      return jsonError(`기존 POI 정리 실패: ${deletePoiResponse.error.message}`, 400)
    }
  }

  const deleteUphillResponse = await writeClient
    .from('uphill_segments')
    .delete()
    .eq('course_id', id)

  if (deleteUphillResponse.error) {
    return jsonError(`기존 업힐 구간 정리 실패: ${deleteUphillResponse.error.message}`, 400)
  }

  const validUphillSegments = (body.uphillSegments ?? []).filter(
    (segment) =>
      typeof segment.start_km === 'number'
      && typeof segment.end_km === 'number'
      && Number.isFinite(segment.start_km)
      && Number.isFinite(segment.end_km)
      && segment.start_km < segment.end_km,
  )

  if (validUphillSegments.length > 0) {
    const insertUphillResponse = await writeClient
      .from('uphill_segments')
      .insert(
        validUphillSegments.map((segment) => ({
          course_id: id,
          name: segment.name?.trim() || null,
          start_km: segment.start_km!,
          end_km: segment.end_km!,
        })),
      )

    if (insertUphillResponse.error) {
      return jsonError(`업힐 구간 저장 실패: ${insertUphillResponse.error.message}`, 400)
    }
  }

  if (stalePoiPhotoPaths.length > 0) {
    const cleanupStorageClient = createServiceRoleClient() ?? createAnonServerClient(accessToken)
    const { error: storageCleanupError } = await cleanupStorageClient
      .storage
      .from(POI_PHOTO_BUCKET)
      .remove(stalePoiPhotoPaths)

    if (storageCleanupError) {
      console.error(
        '[courses.patch] failed to cleanup stale poi photos:',
        storageCleanupError.message,
        stalePoiPhotoPaths,
      )
    }
  }

  return NextResponse.json({ ok: true })
}
