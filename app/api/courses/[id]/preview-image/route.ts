import { NextResponse } from 'next/server'
import { createAnonServerClient, createServiceRoleClient } from '@/lib/supabase-server'
import {
  generatePreviewImageResponse,
  PREVIEW_BUCKET,
  previewStoragePath,
} from '@/lib/course-preview-image'
import type { RoutePreviewPoint } from '@/types/course'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

export async function POST(request: Request, context: RouteContext) {
  const { id: courseId } = await context.params

  const token = readBearerToken(request)
  if (!token) {
    return jsonError(401, 'UNAUTHORIZED', '인증이 필요합니다')
  }

  const supabase = createAnonServerClient(token)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return jsonError(401, 'UNAUTHORIZED', '유효하지 않은 토큰입니다')
  }

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, route_preview_points, created_by')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    return jsonError(404, 'NOT_FOUND', '코스를 찾을 수 없습니다')
  }

  const points = (course.route_preview_points ?? []) as RoutePreviewPoint[]
  if (points.length < 2) {
    return jsonError(400, 'INSUFFICIENT_POINTS', '루트 포인트가 2개 이상 필요합니다')
  }

  const imageResponse = generatePreviewImageResponse(points)
  const imageBuffer = await imageResponse.arrayBuffer()

  const serviceClient = createServiceRoleClient()
  if (!serviceClient) {
    return jsonError(500, 'SERVER_ERROR', '서버 설정 오류')
  }

  const storagePath = previewStoragePath(courseId)

  const { error: uploadError } = await serviceClient.storage
    .from(PREVIEW_BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (uploadError) {
    console.error('[api/courses/preview-image] upload failed:', uploadError.message)
    return jsonError(500, 'UPLOAD_ERROR', '이미지 업로드 실패')
  }

  const { data: publicUrlData } = serviceClient.storage
    .from(PREVIEW_BUCKET)
    .getPublicUrl(storagePath)

  const publicUrl = publicUrlData.publicUrl

  const { error: updateError } = await serviceClient
    .from('courses')
    .update({ preview_image_url: publicUrl })
    .eq('id', courseId)

  if (updateError) {
    console.error('[api/courses/preview-image] DB update failed:', updateError.message)
    return jsonError(500, 'DB_ERROR', 'DB 업데이트 실패')
  }

  return NextResponse.json({ preview_image_url: publicUrl })
}
