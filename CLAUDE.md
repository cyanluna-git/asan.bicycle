# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

Asan.Bicycle — Cycling ride data processing and visualization platform. Provides a RidingAzua dataset pipeline, Kakao Maps-based route visualization, and ride statistics dashboard built with Next.js 15.

## Repository Structure

- `src/app/` — Next.js App Router pages
- `src/components/` — React components
- `src/lib/` — Utilities, API client
- `scripts/` — Python data processing pipeline (RidingAzua)
- `public/` — Static files

## Tech Stack

**Frontend**: Next.js 15 (Turbopack), React 19, TypeScript 5, Tailwind CSS 4
**Maps**: Kakao Maps SDK
**Charts**: Recharts
**Auth/DB**: Supabase (Auth + PostgreSQL)
**Data Processing**: Python 3 scripts (EXIF, GeoJSON, surface analysis)
**UI**: Radix UI, Shadcn

## Architecture

```
Browser → Next.js 15 (App Router)
       → Supabase (Auth + DB)
       → Kakao Maps API
```

### Data Pipeline (Python)
```
RidingAzua Download → Stage → Match → Fingerprint → Curation → Export
```

## Commands

```bash
# Development
pnpm dev                   # Turbopack dev server
pnpm build                 # Production build
pnpm lint                  # ESLint

# Data Pipeline (Python)
cd scripts
python staging.py          # Data staging
python matching.py         # Route matching
python fingerprinting.py   # Fingerprinting
python curation.py         # Curation
```

## Dependency Direction

```
Pages → Components → Hooks → Lib (API/Utils)
                           → Supabase Client
```

- Clearly separate Server Component and Client Component boundaries
- `'use client'` directive only on interactive components
- Kakao Maps loaded client-side only (dynamic import)

## Forbidden Patterns

- ❌ Accessing browser APIs (window, document) in Server Components
- ❌ Loading Kakao Maps SDK during SSR
- ❌ Exposing personal information from EXIF data (beyond GPS coordinates)
- ❌ Processing large GeoJSON data directly on the client

## Required Patterns

- ✅ Map components must use `dynamic(() => import(...), { ssr: false })`
- ✅ Ride data must be aggregated server-side before sending to client
- ✅ Image EXIF processing done in Python scripts (not frontend)
- ✅ Korean data (road names, place names) must verify UTF-8 encoding
