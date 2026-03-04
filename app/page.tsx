import { Sidebar } from "@/components/layout/sidebar";
import KakaoMap from "@/components/map/kakao-map";
import { BottomSheet } from "@/components/layout/bottom-sheet";

export default function Home() {
  return (
    <div className="flex h-[calc(100vh-64px)]">
      <Sidebar />
      <main className="flex-1 relative flex">
        <KakaoMap />
        <BottomSheet />
      </main>
    </div>
  );
}
