import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'lat and lng are required' } },
      { status: 400 },
    )
  }

  const supabase = createAnonServerClient()

  const { data, error } = await supabase.rpc('detect_region_by_point', {
    p_lng: Number(lng),
    p_lat: Number(lat),
  })

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json(null)
  }

  const row = data[0] as { region_id: string; region_name: string; parent_name: string | null }

  return NextResponse.json({
    id: row.region_id,
    name: row.region_name,
    short_name: row.region_name,
  })
}
