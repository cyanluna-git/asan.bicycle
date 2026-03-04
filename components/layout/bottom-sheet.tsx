"use client";

import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { CourseList } from "@/components/layout/sidebar";

export function BottomSheet() {
  return (
    <div className="md:hidden">
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 shadow-lg"
            size="lg"
          >
            <List />
            코스 목록 보기
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>코스 목록</DrawerTitle>
            <DrawerDescription>
              아산시 자전거 코스를 탐색하세요
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <CourseList />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
