import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createAnonServerClient()

  const { data, error } = await supabase
    .from('regions')
    .select('id, name, short_name, code, level, parent_id')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Region not found' } },
      { status: 404 },
    )
  }

  return NextResponse.json(data)
}
