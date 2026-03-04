import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CourseListItem } from '@/types/course'
import type { Enums } from '@/types/database'

const difficultyLabel: Record<Enums<'course_difficulty'>, string> = {
  easy: '초급',
  moderate: '중급',
  hard: '상급',
}

const difficultyVariant: Record<
  Enums<'course_difficulty'>,
  'secondary' | 'default' | 'destructive'
> = {
  easy: 'secondary',
  moderate: 'default',
  hard: 'destructive',
}

interface CourseCardProps {
  course: CourseListItem
  isSelected: boolean
  onClick: () => void
}

export function CourseCard({ course, isSelected, onClick }: CourseCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors cursor-pointer',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'hover:bg-accent/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-tight">{course.title}</h3>
        <Badge
          variant={difficultyVariant[course.difficulty]}
          className="shrink-0"
        >
          {difficultyLabel[course.difficulty]}
        </Badge>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{course.distance_km} km</span>
        <span>&#8593; {course.elevation_gain_m} m</span>
        {course.theme && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {course.theme}
          </Badge>
        )}
      </div>
    </button>
  )
}
