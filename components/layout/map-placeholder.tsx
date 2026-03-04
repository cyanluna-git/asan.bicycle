import { MapPin } from "lucide-react";

export function MapPlaceholder() {
  return (
    <div className="flex-1 bg-muted flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <MapPin className="size-12 opacity-40" />
        <p className="text-sm font-medium">
          지도 영역 (카카오맵 S2-2에서 연동)
        </p>
      </div>
    </div>
  );
}
