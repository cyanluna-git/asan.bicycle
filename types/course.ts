import type { Tables } from '@/types/database'

export type CourseListItem = Pick<
  Tables<'courses'>,
  'id' | 'title' | 'difficulty' | 'distance_km' | 'elevation_gain_m' | 'theme' | 'tags'
>
