import { Sidebar } from '@/components/layout/sidebar'
import KakaoMap from '@/components/map/kakao-map'
import { BottomSheet } from '@/components/layout/bottom-sheet'
import { supabase } from '@/lib/supabase'
import type { CourseListItem } from '@/types/course'

export default async function Home() {
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, difficulty, distance_km, elevation_gain_m, theme, tags')
    .order('created_at', { ascending: false })

  const courseList: CourseListItem[] = courses ?? []

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <Sidebar courses={courseList} />
      <main className="flex-1 relative flex">
        <KakaoMap />
        <BottomSheet courses={courseList} />
      </main>
    </div>
  )
}
