import { Sidebar } from "@/components/layout/sidebar";
import { MapPlaceholder } from "@/components/layout/map-placeholder";
import { BottomSheet } from "@/components/layout/bottom-sheet";

export default function Home() {
  return (
    <div className="flex h-[calc(100vh-64px)]">
      <Sidebar />
      <main className="flex-1 relative flex">
        <MapPlaceholder />
        <BottomSheet />
      </main>
    </div>
  );
}
