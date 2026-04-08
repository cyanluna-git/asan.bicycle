import { NextResponse } from 'next/server'
import { computeAndSaveUphillChartPositions } from '@/lib/uphill-chart-positions'

type Context = { params: Promise<{ id: string }> }

/**
 * POST /api/courses/[id]/chart-uphills
 *
 * Compute and persist chart km positions for all famous uphills matched to
 * this course.  Called after `match_course_uphills` RPC completes.
 * Requires SUPABASE_SERVICE_ROLE_KEY — no auth check needed (non-sensitive write).
 */
export async function POST(_req: Request, { params }: Context) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'missing course id' }, { status: 400 })
  }

  try {
    await computeAndSaveUphillChartPositions(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[chart-uphills] error:', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
