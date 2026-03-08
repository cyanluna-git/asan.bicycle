"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Menu, X, LogOut, Settings2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { signInWithGoogle } from "@/lib/auth";
import { resolveProfileEmoji } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { getUploaderDisplayName } from "@/lib/user-display-name";
import type { User } from "@supabase/supabase-js";

const navLinks = [
  { label: "코스 찾기", href: "/explore", active: false },
  { label: "코스 올리기", href: "/upload", active: false },
] as const;

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const visibleLinks = user
    ? [...navLinks, { label: "내 코스", href: "/my-courses", active: false }]
    : navLinks;

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
        {visibleLinks.map((link) => (
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

      {/* User actions (desktop) */}
      {user ? (
        <div className="hidden items-center gap-2 ml-3 md:flex">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition hover:bg-accent"
          >
            <span className="text-lg leading-none">{resolveProfileEmoji(user)}</span>
            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
              {getUploaderDisplayName(user)}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setProfileOpen(true)}
            aria-label="프로필 설정"
            title="프로필 설정"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => supabase.auth.signOut()}
            aria-label="로그아웃"
            title="로그아웃"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="hidden items-center gap-2 ml-3 md:flex">
          <Button
            onClick={async () => {
              await signInWithGoogle()
            }}
          >
            <LogIn className="mr-2 h-4 w-4" />
            로그인
          </Button>
        </div>
      )}

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
            {visibleLinks.map((link) => (
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
          {user ? (
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">{resolveProfileEmoji(user)}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {getUploaderDisplayName(user)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setProfileOpen(true)
                  }}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  프로필
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => supabase.auth.signOut()}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  로그아웃
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 border-t pt-3">
              <Button
                className="w-full"
                onClick={async () => {
                  await signInWithGoogle()
                }}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Google로 로그인
              </Button>
            </div>
          )}
        </div>
      )}

      {user && (
        <ProfileEditor
          user={user}
          mode="modal"
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}
    </header>
  );
}
