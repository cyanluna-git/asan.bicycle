import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/admin'
import { createAnonServerClient, createServiceRoleClient } from '@/lib/supabase-server'
import {
  extractCourseAlbumPhotoPath,
  MAX_COURSE_ALBUM_PHOTOS_PER_USER_PER_COURSE,
  normalizeCourseAlbumFetchLimit,
  type AlbumPhotoLocation,
} from '@/lib/course-album'
import type { Json } from '@/types/database'

type RouteContext = {
  params: Promise<{ id: string }>
}

type CreateAlbumPhotoPayload = {
  storagePath?: string
  publicUrl?: string
  lat?: number | null
  lng?: number | null
  takenAt?: string | null
  caption?: string | null
  width?: number | null
  height?: number | null
  sourceExifJson?: Json | null
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

function isValidLocation(lat: unknown, lng: unknown) {
  return (
    typeof lat === 'number'
    && Number.isFinite(lat)
    && typeof lng === 'number'
    && Number.isFinite(lng)
  )
}

function parseTakenAt(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export async function POST(request: Request, context: RouteContext) {
  const { id: courseId } = await context.params
  const accessToken = readBearerToken(request.headers.get('authorization'))

  if (!accessToken) {
    return jsonError('인증 토큰이 필요합니다.', 401)
  }

  let body: CreateAlbumPhotoPayload
  try {
    body = await request.json()
  } catch {
    return jsonError('잘못된 요청 본문입니다.', 400)
  }

  const storagePath = body.storagePath?.trim() || ''
  const publicUrl = body.publicUrl?.trim() || ''

  if (!storagePath || !publicUrl) {
    return jsonError('앨범 사진 파일 정보가 필요합니다.', 400)
  }

  const publicUrlPath = extractCourseAlbumPhotoPath(publicUrl)
  if (publicUrlPath !== storagePath) {
    return jsonError('앨범 사진 경로가 올바르지 않습니다.', 400)
  }

  const authClient = createAnonServerClient()
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken)

  if (userError || !user) {
    return jsonError('세션이 만료되었습니다. 다시 로그인해주세요.', 401)
  }

  if (storagePath.split('/')[0] !== user.id) {
    return jsonError('본인 소유 경로에만 업로드할 수 있습니다.', 403)
  }

  const courseResponse = await authClient
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .single()

  if (courseResponse.error || !courseResponse.data) {
    return jsonError('앨범을 등록할 코스를 찾을 수 없습니다.', 404)
  }

  const writeClient = createAnonServerClient(accessToken)
  const location: AlbumPhotoLocation | null = isValidLocation(body.lat, body.lng)
    ? { lat: body.lat as number, lng: body.lng as number }
    : null
  const existingCountResponse = await writeClient
    .from('course_album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('user_id', user.id)

  if (existingCountResponse.error) {
    return jsonError(`앨범 사진 개수 확인 실패: ${existingCountResponse.error.message}`, 400)
  }

  if ((existingCountResponse.count ?? 0) >= MAX_COURSE_ALBUM_PHOTOS_PER_USER_PER_COURSE) {
    return jsonError(
      `코스당 업로드 가능한 사진은 최대 ${MAX_COURSE_ALBUM_PHOTOS_PER_USER_PER_COURSE}장입니다.`,
      400,
    )
  }

  const insertResponse = await writeClient
    .from('course_album_photos')
    .insert({
      course_id: courseId,
      user_id: user.id,
      storage_path: storagePath,
      public_url: publicUrl,
      location: location ? `SRID=4326;POINT(${location.lng} ${location.lat})` : null,
      taken_at: parseTakenAt(body.takenAt),
      caption: body.caption?.trim() || null,
      width: typeof body.width === 'number' && Number.isFinite(body.width) ? body.width : null,
      height: typeof body.height === 'number' && Number.isFinite(body.height) ? body.height : null,
      source_exif_json: body.sourceExifJson ?? null,
    })
    .select('id, course_id, user_id, storage_path, public_url, taken_at, caption, width, height, source_exif_json, created_at, updated_at')
    .single()

  if (insertResponse.error || !insertResponse.data) {
    return jsonError(`앨범 사진 메타데이터 저장 실패: ${insertResponse.error?.message ?? 'unknown error'}`, 400)
  }

  return NextResponse.json({
    photo: {
      ...insertResponse.data,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
    },
  })
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: courseId } = await context.params
  const requestUrl = new URL(_request.url)
  const limit = normalizeCourseAlbumFetchLimit(requestUrl.searchParams.get('limit'))
  const supabase = createAnonServerClient()

  const response = await supabase
    .from('course_album_photos_with_coords')
    .select('id, course_id, user_id, storage_path, public_url, taken_at, caption, width, height, source_exif_json, created_at, updated_at, lat, lng')
    .eq('course_id', courseId)
    .order('taken_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (response.error) {
    return jsonError(`코스 앨범을 불러오지 못했습니다: ${response.error.message}`, 400)
  }

  return NextResponse.json({
    photos: response.data ?? [],
    limit,
  })
}

type DeleteAlbumPhotoPayload = {
  photoId?: string
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id: courseId } = await context.params
  const accessToken = readBearerToken(request.headers.get('authorization'))

  if (!accessToken) {
    return jsonError('인증 토큰이 필요합니다.', 401)
  }

  let body: DeleteAlbumPhotoPayload
  try {
    body = await request.json()
  } catch {
    return jsonError('잘못된 요청 본문입니다.', 400)
  }

  const photoId = body.photoId?.trim() || ''
  if (!photoId) {
    return jsonError('삭제할 사진 식별자가 필요합니다.', 400)
  }

  const authClient = createAnonServerClient()
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken)

  if (userError || !user) {
    return jsonError('세션이 만료되었습니다. 다시 로그인해주세요.', 401)
  }

  const photoResponse = await authClient
    .from('course_album_photos')
    .select('id, user_id, storage_path')
    .eq('id', photoId)
    .eq('course_id', courseId)
    .single()

  if (photoResponse.error || !photoResponse.data) {
    return jsonError('삭제할 앨범 사진을 찾을 수 없습니다.', 404)
  }

  const isOwner = photoResponse.data.user_id === user.id
  const isAdmin = isAdminUser(user)

  if (!isOwner && !isAdmin) {
    return jsonError('이 앨범 사진을 삭제할 권한이 없습니다.', 403)
  }

  let writeClient = createAnonServerClient(accessToken)
  if (isAdmin && !isOwner) {
    const serviceRoleClient = createServiceRoleClient()
    if (!serviceRoleClient) {
      return jsonError('관리자 대리 삭제에는 SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.', 503)
    }

    writeClient = serviceRoleClient
  }
  const deleteResponse = await writeClient
    .from('course_album_photos')
    .delete()
    .eq('id', photoId)
    .eq('course_id', courseId)

  if (deleteResponse.error) {
    return jsonError(`앨범 사진 삭제 실패: ${deleteResponse.error.message}`, 400)
  }

  const storageResponse = await writeClient
    .storage
    .from('course-album-photos')
    .remove([photoResponse.data.storage_path])

  if (storageResponse.error) {
    console.error(
      '[course-album.delete] failed to cleanup storage object:',
      storageResponse.error.message,
      photoResponse.data.storage_path,
    )
  }

  return NextResponse.json({ success: true })
}
