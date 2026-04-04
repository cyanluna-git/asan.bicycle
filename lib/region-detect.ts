import { supabase } from '@/lib/supabase'

export type RegionInfo = {
  id: string
  name: string
  parentName: string | null
}

type DetectRegionRow = {
  region_id: string
  region_name: string
  parent_name: string | null
}

export async function detectRegionByPoint(
  lat: number,
  lng: number,
): Promise<RegionInfo | null> {
  const { data, error } = await supabase.rpc('detect_region_by_point', {
    p_lng: lng,
    p_lat: lat,
  })

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return null
  }

  const row = data[0] as DetectRegionRow
  return {
    id: row.region_id,
    name: row.region_name,
    parentName: row.parent_name,
  }
}
