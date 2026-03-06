'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomSheet } from '@/components/layout/bottom-sheet'
import KakaoMap from '@/components/map/kakao-map'
import { ElevationPanel } from '@/components/map/elevation-panel'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import { supabase } from '@/lib/supabase'
import type {
  CourseDetail,
  CourseListItem,
  CourseMapItem,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'
import type { User } from '@supabase/supabase-js'

interface ExploreShellProps {
  courses: CourseListItem[]
  courseRoutes: CourseMapItem[]
  startPoints: { id: string; name: string }[]
  themes: string[]
  hasActiveFilters: boolean
  selectedCourseId: string | null
  selectedCourse: CourseDetail | null
  pois: PoiMapItem[]
  uphillSegments: UphillSegment[]
}

export function ExploreShell({
  courses,
  courseRoutes,
  startPoints,
  themes,
  hasActiveFilters,
  selectedCourseId,
  selectedCourse,
  pois,
  uphillSegments,
}: ExploreShellProps) {
  const [user, setUser] = useState<User | null>(null)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    }).catch(() => {})

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setSelectedPoiId(null)
  }, [selectedCourseId])

  useEffect(() => {
    if (selectedPoiId && !pois.some((poi) => poi.id === selectedPoiId)) {
      setSelectedPoiId(null)
    }
  }, [pois, selectedPoiId])

  const canEditSelectedCourse = selectedCourse
    ? canEditCourse({
        courseOwnerId: selectedCourse.created_by,
        userId: user?.id,
        isAdmin: isAdminUser(user),
      })
    : false

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <Sidebar
        courses={courses}
        startPoints={startPoints}
        themes={themes}
        hasActiveFilters={hasActiveFilters}
        selectedCourse={selectedCourse}
        pois={pois}
        selectedPoiId={selectedPoiId}
        onSelectPoi={setSelectedPoiId}
        uphillSegments={uphillSegments}
        canEditSelectedCourse={canEditSelectedCourse}
      />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="relative flex-1 min-h-0">
          <KakaoMap
            courses={courseRoutes}
            selectedCourseId={selectedCourseId}
            pois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={setSelectedPoiId}
          />
          <BottomSheet
            courses={courses}
            startPoints={startPoints}
            themes={themes}
            hasActiveFilters={hasActiveFilters}
            selectedCourse={selectedCourse}
            pois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={setSelectedPoiId}
            uphillSegments={uphillSegments}
            canEditSelectedCourse={canEditSelectedCourse}
          />
        </div>
        {selectedCourse && (
          <ElevationPanel
            routeGeoJSON={selectedCourse.route_geojson}
            uphillSegments={uphillSegments}
            courseTitle={selectedCourse.title}
          />
        )}
      </main>
    </div>
  )
}
