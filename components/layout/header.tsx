"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "코스 찾기", href: "/explore", active: false },
  { label: "코스 올리기", href: "/upload", active: false },
] as const;

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center border-b bg-background px-4 md:px-6">
      {/* Logo */}
      <Link href="/" className="mr-6 flex items-center gap-1.5">
        <span className="text-lg font-bold tracking-tight">
          asan<span className="text-orange-500">.bicycle</span>
        </span>
      </Link>

      {/* Desktop Nav */}
      <nav className="hidden items-center gap-1 md:flex">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              link.active
                ? "rounded-md px-3 py-2 text-sm font-medium text-foreground"
                : "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search (desktop) */}
      <div className="relative hidden items-center md:flex">
        <Search className="absolute left-2.5 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="코스 검색..."
          className="h-9 w-[200px] rounded-md border bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring lg:w-[280px]"
        />
      </div>

      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
      >
        {mobileMenuOpen ? <X /> : <Menu />}
      </Button>

      {/* Mobile dropdown nav */}
      {mobileMenuOpen && (
        <div className="absolute left-0 right-0 top-16 border-b bg-background p-4 md:hidden">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="코스 검색..."
              className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  link.active
                    ? "rounded-md px-3 py-2 text-sm font-medium text-foreground"
                    : "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
