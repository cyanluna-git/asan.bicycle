import type { Metadata } from 'next'
import { MyCoursesPageClient } from '@/components/courses/my-courses-page-client'

export const metadata: Metadata = {
  title: '내 코스 | asan.bicycle',
  robots: {
    index: false,
    follow: false,
  },
}

export default function MyCoursesPage() {
  return <MyCoursesPageClient />
}
