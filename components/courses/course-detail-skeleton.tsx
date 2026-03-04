export function CourseDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {/* Title bar */}
      <div className="flex items-start justify-between gap-2">
        <div className="h-5 w-3/4 rounded bg-muted/50" />
        <div className="h-8 w-8 rounded bg-muted/50 shrink-0" />
      </div>

      {/* Difficulty badge */}
      <div className="h-5 w-12 rounded-full bg-muted/50" />

      {/* Stats row */}
      <div className="flex gap-4">
        <div className="h-4 w-20 rounded bg-muted/50" />
        <div className="h-4 w-24 rounded bg-muted/50" />
      </div>

      {/* Duration section */}
      <div className="rounded-lg border p-3">
        <div className="h-3 w-20 rounded bg-muted/50 mb-2" />
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-12 rounded bg-muted/50" />
              <div className="h-4 w-16 rounded bg-muted/50" />
            </div>
          ))}
        </div>
      </div>

      {/* Description lines */}
      <div className="flex flex-col gap-1.5">
        <div className="h-3 w-full rounded bg-muted/50" />
        <div className="h-3 w-5/6 rounded bg-muted/50" />
        <div className="h-3 w-2/3 rounded bg-muted/50" />
      </div>

      {/* Download button */}
      <div className="h-9 w-full rounded-md bg-muted/50" />
    </div>
  )
}
