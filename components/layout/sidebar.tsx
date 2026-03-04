import { Badge } from "@/components/ui/badge";

interface CourseCardProps {
  name: string;
  distance: string;
  elevation: string;
  difficulty: "초급" | "중급" | "상급";
}

const difficultyVariant: Record<
  CourseCardProps["difficulty"],
  "default" | "secondary" | "destructive"
> = {
  초급: "secondary",
  중급: "default",
  상급: "destructive",
};

function CourseCard({ name, distance, elevation, difficulty }: CourseCardProps) {
  return (
    <div className="rounded-lg border p-3 hover:bg-accent/50 transition-colors cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-tight">{name}</h3>
        <Badge variant={difficultyVariant[difficulty]} className="shrink-0">
          {difficulty}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{distance}</span>
        <span>&#8593; {elevation}</span>
      </div>
    </div>
  );
}

const fakeCourses: CourseCardProps[] = [
  {
    name: "아산 온천대공원 순환코스",
    distance: "12.3 km",
    elevation: "145 m",
    difficulty: "초급",
  },
  {
    name: "곡교천 자전거길",
    distance: "24.7 km",
    elevation: "320 m",
    difficulty: "중급",
  },
  {
    name: "영인산 힐클라임 코스",
    distance: "38.1 km",
    elevation: "780 m",
    difficulty: "상급",
  },
];

export function CourseList() {
  return (
    <div className="flex flex-col gap-2">
      {fakeCourses.map((course) => (
        <CourseCard key={course.name} {...course} />
      ))}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-[280px] border-r bg-background">
      <div className="overflow-y-auto h-full p-4">
        {/* Filter section */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">필터</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground">출발 기점</label>
              <div className="mt-1 h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm text-muted-foreground">
                전체
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">난이도</label>
              <div className="mt-1 flex gap-1.5">
                <Badge variant="secondary">초급</Badge>
                <Badge variant="default">중급</Badge>
                <Badge variant="destructive">상급</Badge>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">거리</label>
              <div className="mt-1 h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm text-muted-foreground">
                전체
              </div>
            </div>
          </div>
        </div>

        {/* Course list */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            코스 목록
          </h2>
          <CourseList />
        </div>
      </div>
    </aside>
  );
}
