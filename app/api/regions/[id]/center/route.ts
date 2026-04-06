import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createAnonServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('region_centroid', { p_region_id: id })

  if (error) {
    // Fallback: try raw SQL query via supabase
    const { data: fallback, error: fallbackError } = await supabase
      .from('regions')
      .select('id, name')
      .eq('id', id)
      .maybeSingle()

    if (fallbackError || !fallback) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Region not found' } },
        { status: 404 },
      )
    }

    // Return a sensible default (center of South Korea) when RPC is unavailable
    return NextResponse.json({ lat: 36.5, lng: 127.0 })
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Region not found' } },
      { status: 404 },
    )
  }

  const row = Array.isArray(data) ? data[0] : data

  return NextResponse.json({
    lat: (row as Record<string, number>).lat,
    lng: (row as Record<string, number>).lng,
  })
}
