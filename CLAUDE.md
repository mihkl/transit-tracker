# Transit Tracker

Real-time public transit tracker for Tallinn, Estonia. PWA with live vehicle map, route planning, and push notification reminders.

## Agent Rules

- **Mistakes.** Whenever you make mistakes during working, add the solution to those mistakes to this file to prevent yourself from making the same mistakes in the future.
- **Keep this file up to date.** Whenever you add, remove, or change files, dependencies, commands, architecture, or conventions — update the relevant sections of this file so future agents have accurate context.
- **Fix inaccuracies.** If you discover anything in this file that is wrong or outdated, correct it immediately.
- **Commits:** Title only — no description body, no `Co-Authored-By` lines. Commit only when asked to.
- **Fix the root cause.** Do not fix symptons, always look for route cause.
- **New features.** When adding new features evaluate if this is the most elegant approach? Often times a better approach might present itself after experimenting a bit. Do not always go for the first idea.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Server Components, Server Actions)
- **Language:** TypeScript (strict mode)
- **UI:** React 19, Tailwind CSS v4, shadcn/ui (Radix UI), Lucide icons
- **Maps:** MapLibre GL + react-map-gl
- **State:** Zustand
- **Validation:** Zod
- **DB:** Drizzle ORM + LibSQL/SQLite (push notifications only)
- **Cache:** Redis
- **Monitoring:** Sentry
- **Testing:** Playwright (E2E)
- **Package Manager:** pnpm

## Commands

```bash
nvm use 25              # Change to node 25      
pnpm dev              # Dev server
pnpm build            # Production build (runs prebuild: GTFS + SW)
pnpm start            # Production server
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
pnpm check            # lint + typecheck
pnpm test:e2e         # Playwright E2E tests
pnpm test:e2e:headed  # Playwright with browser UI
pnpm db:generate      # Drizzle migrations
pnpm db:studio        # Drizzle Studio UI
pnpm build:sw         # Build service worker only
```

## Project Structure

```
src/
  actions/       Server actions (route planning, stops, places, delays, traffic)
  app/           Next.js app dir, API routes (/api/vehicles/stream SSE, /api/push)
  components/    React components
    ui/          shadcn/ui primitives
    home/        Home page layer components
    map/         Map rendering, vehicle display, overlays
    search/      Place/stop/route search UI
  hooks/         ~20 custom hooks (vehicle streaming, route planning, reminders, etc.)
  lib/           Utilities, types, constants, schemas, domain logic
  server/        Server services (transit state, vehicle tracker, SIRI, Google Routes)
  store/         Zustand store (use-transit-store.ts)
  sw.ts          Service worker (push notifications, caching)
tests/e2e/       Playwright tests (mobile/ and desktop/ directories)
data/            GTFS data storage
drizzle/         DB schema and migrations
scripts/         Build scripts (GTFS preprocessing)
```

## Architecture

### Data Flow
- **GPS feed** from Tallinn public API polled every 10s → vehicle positions matched to GTFS routes
- **SIRI XML feed** for live stop departures (5s cache)
- **Google Routes API** for route planning
- **TomTom API** for traffic flow/incidents
- **SSE streaming** (`/api/vehicles/stream`) pushes real-time updates to connected clients
- **Push notifications** via web-push with SQLite-backed queue

### Key Patterns
- **Transit state singleton** (`src/server/transit-state.ts`) manages all real-time data server-side
- **Vehicle tracker** matches GPS readings to GTFS route patterns with interpolation
- **Server Actions** in `src/actions/` for type-safe client→server mutations
- **Mobile-first** UI: bottom sheets, bottom navigation, drag-to-dismiss
- **Desktop** gets sidebar layout via `md:` breakpoint (768px)
- `useIsDesktop()` hook uses `matchMedia` for JS-side responsive logic
- **Hash-based routing** for overlays (directions, route-detail, search, nearby)

### State Management
- `useTransitStore` (Zustand): vehicles, stops, route plans, overlays, planner state
- Domain hooks compose store state with side effects (reminders, transfer checks, etc.)

## Conventions

- Path alias: `@/*` → `./src/*`
- Tailwind v4 with `@import "tailwindcss"` (no tailwind.config, uses CSS-based config in globals.css)
- shadcn/ui style: new-york, neutral base color
- Components use `"use client"` directive where needed
- Server components are the default
- Responsive: mobile-first with `md:` for desktop (768px breakpoint)
- `hidden md:flex` = desktop only, `md:hidden` = mobile only
- Prefer inferred return types on TS functions

## Environment Variables

See `.env.example` for full list. Key ones:
- `TOMTOM_API_KEY` / `TOMTOM_SERVER_API_KEY` - Traffic
- `GOOGLE_ROUTES_API_KEY` - Route planning
- `REDIS_URL` - Caching
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` - Push notifications
- `PUSH_DB_PATH` - SQLite path for push queue
- `APP_ORIGIN` - CORS origin

## Deployment

- Docker multi-stage build (Node 25, Alpine, pnpm)
- Next.js standalone output
- GTFS data preprocessed at build time
- Deployed to Railway
