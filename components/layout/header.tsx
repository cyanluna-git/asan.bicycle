"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Menu, X, LogOut, Settings2, LogIn, MapPin, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { RegionMapModal } from "@/components/region/region-map-modal";
import { type RegionSelection } from "@/components/region/region-picker";
import { signInWithGoogle, signInWithKakao } from "@/lib/auth";
import { resolveProfileEmoji } from "@/lib/profile";
import { useRegionContext } from "@/lib/region-context";
import { supabase } from "@/lib/supabase";
import { getUploaderDisplayName } from "@/lib/user-display-name";
import type { User } from "@supabase/supabase-js";

const navLinks = [
  { label: "Courses", href: "/courses" },
  { label: "Map", href: "/explore" },
  { label: "Community", href: "/community" },
] as const;

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentRegionName, setTemporaryRegion } = useRegionContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [regionMapOpen, setRegionMapOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (pathname === "/courses") {
      setSearchValue(searchParams.get("q") ?? "");
      return;
    }

    setSearchValue("");
  }, [pathname, searchParams]);

  const visibleLinks = user
    ? [...navLinks, { label: "My Courses", href: "/my-courses" }]
    : navLinks;

  const handleRegionSelect = (region: RegionSelection) => {
    setTemporaryRegion(region.id, region.name);
    router.push(`/courses?region=${region.id}`);
  };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = searchValue.trim();
    router.push(normalized ? `/courses?q=${encodeURIComponent(normalized)}` : "/courses");
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center border-b bg-stitch-surface/90 backdrop-blur-md px-4 md:px-6">
      {/* Logo */}
      <Link href="/" className="mr-4 flex items-center gap-1.5">
        <span className="font-headline text-2xl font-black tracking-tighter">
          굴림
        </span>
      </Link>

      {/* Region Button */}
      <button
        type="button"
        onClick={() => setRegionMapOpen(true)}
        className={
          currentRegionName
            ? "mr-4 flex min-h-[36px] items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            : "mr-4 flex min-h-[36px] items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
        }
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[120px] truncate">
          {currentRegionName ?? (user ? "지역 설정" : "지역 선택")}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {/* Desktop Nav */}
      <nav className="hidden items-center gap-1 md:flex">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname === link.href
                ? "rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary border-b-2 border-primary"
                : "rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search (desktop) */}
      <form onSubmit={submitSearch} className="relative hidden items-center md:flex">
        <Search className="absolute left-2.5 size-4 text-muted-foreground" />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="코스 검색..."
          className="h-9 w-[200px] rounded-md border bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring lg:w-[280px]"
        />
      </form>

      {/* Upload CTA + User actions (desktop) */}
      <div className="hidden items-center gap-2 ml-3 md:flex">
        <Link
          href="/upload"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
        >
          코스 올리기
        </Link>
        {user ? (
          <>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition hover:bg-accent"
            >
              <span className="text-lg leading-none">{resolveProfileEmoji(user)}</span>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
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
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setLoginModalOpen(true)}>
            <LogIn className="mr-2 h-4 w-4" />
            로그인
          </Button>
        )}
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
          {pathname !== "/courses" ? (
            <form onSubmit={submitSearch} className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="코스 검색..."
                className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </form>
          ) : (
            <div className="mb-3 rounded-2xl border border-black/8 bg-[#f7f4ec] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              코스 검색과 필터는 화면 상단의
              {' '}
              <span className="font-medium text-foreground">검색·필터</span>
              {' '}
              버튼에서 여세요.
            </div>
          )}
          <nav className="flex flex-col gap-1">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={
                  pathname === link.href
                    ? "rounded-md px-3 py-2 text-sm font-semibold text-primary"
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
                variant="outline"
                className="w-full"
                onClick={() => { setMobileMenuOpen(false); setLoginModalOpen(true); }}
              >
                <LogIn className="mr-2 h-4 w-4" />
                로그인
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

      <RegionMapModal
        open={regionMapOpen}
        onOpenChange={setRegionMapOpen}
        onSelect={handleRegionSelect}
        userId={user?.id}
      />

      {/* Login modal */}
      {loginModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setLoginModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold">로그인</h2>
            <p className="mb-6 text-sm text-muted-foreground">소셜 계정으로 간편하게 시작하세요</p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={async () => { setLoginModalOpen(false); await signInWithKakao(); }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#FDD800]"
              >
                카카오로 시작하기
              </button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl text-sm font-semibold"
                onClick={async () => { setLoginModalOpen(false); await signInWithGoogle(); }}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Google로 시작하기
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setLoginModalOpen(false)}
              className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
