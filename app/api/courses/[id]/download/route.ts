import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase-server'
import { buildCourseDownloadFilename } from '@/lib/gpx-download'

type RouteContext = {
  params: Promise<{ id: string }>
}

type DownloadCourseRow = {
  id: string
  title: string
  gpx_url: string | null
  created_at: string
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = createAnonServerClient()

  const { data, error } = await supabase
    .from('courses')
    .select('id, title, gpx_url, created_at')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '코스를 찾을 수 없습니다.' }, { status: 404 })
  }

  const course = data as DownloadCourseRow
  if (!course.gpx_url) {
    return NextResponse.json({ error: '다운로드할 GPX 파일이 없습니다.' }, { status: 404 })
  }

  const upstream = await fetch(course.gpx_url)
  if (!upstream.ok) {
    return NextResponse.json({ error: 'GPX 파일을 불러오지 못했습니다.' }, { status: 502 })
  }

  // Best-effort counter update via security-definer RPC. Download should still work if this fails.
  void supabase.rpc('increment_course_download_count', { p_course_id: id }).then(({ error: rpcError }) => {
    if (rpcError) {
      console.error('[download] increment_course_download_count failed:', rpcError.message)
    }
  })

  const filename = buildCourseDownloadFilename(course.title, course.created_at)
  const buffer = await upstream.arrayBuffer()

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/gpx+xml',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
