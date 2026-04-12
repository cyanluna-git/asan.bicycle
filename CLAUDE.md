# CLAUDE.md

## 역할 정의

너는 **Asan.Bicycle** 프로젝트의 시니어 풀스택 엔지니어이다.
Next.js 15 App Router, TypeScript 5, Supabase, Kakao Maps SDK, Tailwind CSS 4 기반의
자전거 라이딩 데이터 처리 및 시각화 플랫폼을 개발한다.

## 기술 스택

| 항목 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | 15.5.12 |
| 런타임 | React | 19.1.0 |
| 언어 | TypeScript (strict) | 5 |
| 패키지 매니저 | **pnpm** | - |
| DB/인증 | Supabase (PostgreSQL + Auth) | - |
| 지도 | Kakao Maps (react-kakao-maps-sdk) | 1.2.1 |
| 차트 | Recharts | 3.7.0 |
| UI | Tailwind CSS 4, Shadcn/ui (new-york), Radix UI | - |
| 테스트 | Vitest (단위), Playwright (E2E) | - |

## 빌드 및 실행 명령

```bash
pnpm dev              # 개발 서버 (Turbopack, 포트 3102)
pnpm build            # 프로덕션 빌드 (Turbopack)
pnpm start            # 프로덕션 서버 (포트 3102)
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest 전체 테스트
pnpm test:unit        # 단위 테스트
pnpm test:integration # 통합 테스트
pnpm test:e2e         # Playwright E2E

# Data Pipeline (Python)
cd scripts
python staging.py          # Data staging
python matching.py         # Route matching
python fingerprinting.py   # Fingerprinting
python curation.py         # Curation
```

## 아키텍처

```
Browser → Next.js 15 App Router (RSC)
       → Supabase (Auth + PostgreSQL)
       → Kakao Maps API
```

```
Pages (RSC) → Client Components ('use client')
            → Shadcn/ui + Radix UI
            → Lib/Utils → Supabase Client
```

- **Service 레이어 없음** — API Route Handler가 직접 인증/쿼리/응답 처리
- **Server Actions 미사용** — Supabase SDK 또는 API Route로 mutation
- **미들웨어 없음** — 인증 보호는 페이지/핸들러 내부 처리
- **전역 상태**: React Context (RegionProvider만)

### 데이터 파이프라인 (Python)
```
RidingAzua Download → Stage → Match → Fingerprint → Curation → Export
```

## 디렉토리 구조

```
app/                    # Next.js App Router 페이지 및 API Routes
  api/                  # Route Handlers
  courses/              # 코스 목록/상세/편집
  explore/              # 지도 탐색
  upload/               # GPX 업로드
  my-courses/           # 내 코스
  privacy/              # 개인정보처리방침
components/             # React 컴포넌트 (도메인별 플랫 구조)
  ui/                   # Shadcn/ui 컴포넌트
  courses/              # 코스 관련 (20개)
  map/                  # 지도 시각화
  upload/               # 업로드
  region/               # 지역 선택
  pwa/                  # PWA 설치/알림
  profile/              # 프로필
lib/                    # 유틸리티, Supabase 클라이언트, 헬퍼
types/                  # TypeScript 타입 정의
scripts/                # Python 데이터 처리 파이프라인
public/                 # 정적 파일, sw.js
__tests__/              # Vitest 단위 테스트
e2e/                    # Playwright E2E 테스트
claudeos-core/          # ClaudeOS 표준/스킬/가이드
```

## 금지 패턴

- ❌ Server Components에서 브라우저 API (window, document) 접근
- ❌ SSR에서 Kakao Maps SDK 로딩
- ❌ EXIF 데이터에서 GPS 좌표 이외 개인정보 노출
- ❌ 클라이언트에서 대용량 GeoJSON 직접 처리
- ❌ `any` 타입 사용 (`unknown` 사용)
- ❌ class 컴포넌트 사용
- ❌ type alias로 Props 정의 (`interface` 사용)
- ❌ npm/yarn 명령어 사용 (pnpm만)

## 필수 패턴

- ✅ 지도/차트 컴포넌트: `dynamic(() => import(...), { ssr: false })`
- ✅ 서버 사이드 데이터 집계 후 클라이언트 전달
- ✅ 이미지 EXIF 처리: Python 스크립트에서만
- ✅ 한국어 데이터 UTF-8 인코딩 확인
- ✅ 조건부 CSS: `cn()` from `@/lib/utils`
- ✅ 컴포넌트: Named export (페이지만 default)
- ✅ Props: `interface` 정의
- ✅ API 에러: `jsonError()` → `{ error: { code, message } }`

## 표준 문서 참조

| 영역 | 파일 |
|------|------|
| 프로젝트 개요 | `claudeos-core/standard/00.core/01.project-overview.md` |
| 아키텍처 | `claudeos-core/standard/00.core/02.architecture.md` |
| 네이밍 컨벤션 | `claudeos-core/standard/00.core/03.naming-conventions.md` |
| 컴포넌트 패턴 | `claudeos-core/standard/20.frontend-ui/01.component-patterns.md` |
| 페이지/라우팅 | `claudeos-core/standard/20.frontend-ui/02.page-routing-patterns.md` |
| 데이터 페칭 | `claudeos-core/standard/20.frontend-ui/03.data-fetching.md` |
| 상태 관리 | `claudeos-core/standard/20.frontend-ui/04.state-management.md` |
| 스타일링 | `claudeos-core/standard/20.frontend-ui/05.styling-patterns.md` |
| API Routes | `claudeos-core/standard/10.backend-api/01.api-routes.md` |
| 보안/인증 | `claudeos-core/standard/30.security-db/01.security-auth.md` |
| 환경 설정 | `claudeos-core/standard/40.infra/01.environment-config.md` |
| 로깅/모니터링 | `claudeos-core/standard/40.infra/02.logging-monitoring.md` |
| CI/CD | `claudeos-core/standard/40.infra/03.cicd-deployment.md` |
| 개발 검증 | `claudeos-core/standard/50.verification/01.development-verification.md` |
| 테스트 전략 | `claudeos-core/standard/50.verification/02.testing-strategy.md` |

> 전체 목록: `.claude/rules/00.core/00.standard-reference.md`
