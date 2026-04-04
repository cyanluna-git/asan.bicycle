import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase-server'

type RegionRow = {
  id: string
  name: string
  short_name: string
  code: string
  level: 'sido' | 'sigungu'
  parent_id: string | null
}

const REGION_SELECT = 'id, name, short_name, code, level, parent_id'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const parentId = searchParams.get('parent_id')

  const supabase = createAnonServerClient()

  if (parentId) {
    const { data, error } = await supabase
      .from('regions')
      .select(REGION_SELECT)
      .eq('parent_id', parentId)
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 },
      )
    }

    return NextResponse.json(data as RegionRow[])
  }

  if (level === 'sido' || level === 'sigungu') {
    const { data, error } = await supabase
      .from('regions')
      .select(REGION_SELECT)
      .eq('level', level)
      .order('code', { ascending: true })

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 },
      )
    }

    return NextResponse.json(data as RegionRow[])
  }

  return NextResponse.json(
    { error: { code: 'BAD_REQUEST', message: 'Provide ?level=sido|sigungu or ?parent_id=<uuid>' } },
    { status: 400 },
  )
}
