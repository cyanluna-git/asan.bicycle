import type { Enums } from '@/types/database'

export const difficultyLabel: Record<Enums<'course_difficulty'>, string> = {
  easy: '초급',
  moderate: '중급',
  hard: '상급',
}

export const difficultyVariant: Record<
  Enums<'course_difficulty'>,
  'secondary' | 'default' | 'destructive'
> = {
  easy: 'secondary',
  moderate: 'default',
  hard: 'destructive',
}
