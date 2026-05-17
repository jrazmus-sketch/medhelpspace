# MedHelpSpace — New Session Handoff

## Project
Brazilian medical exam prep site (Revalida). Migrating from WordPress to Next.js 16 + Supabase.
Working directory: `C:\Users\jrazm\claudebuilds\medhelpspace\`
Next.js app lives in `app/` subfolder.
Full project context is in `CLAUDE.md` at the repo root — read it first.

## Current state
- Site is **live at https://medhelpspace.vercel.app**
- GitHub repo: `github.com/jrazmus-sketch/medhelpspace` (branch: `main`)
- Vercel auto-deploys on push to `main`
- Environment variables are set in Vercel (Supabase URL + anon key imported from `.env.local`)
- Supabase redirect URL for `https://medhelpspace.vercel.app` has been added
- Local dev server runs from `app/` with `npm run dev`

## Completed frontend phases
- Auth, routing, middleware (proxy.ts — Next.js 16 uses `proxy.ts` not `middleware.ts`)
- Dashboard (`/app`) — full design pass done, placeholder data
- Plain-content renderer (`/app/[specialty]/[slug]` for plain-content pages)
- Text-lesson renderer with audio player per section
- H5P quiz player
- Flashcard player
- Memorecards carousel
- Blurb-nav-hub renderer
- Admin panel (dashboard, members, cohorts, modules, audit log, content stubs)

## Key technical notes
- **Next.js 16.2.6** — has breaking changes; always read `app/node_modules/next/dist/docs/` before writing Next.js code
- **Proxy not middleware**: route protection lives in `app/src/proxy.ts` (exports `proxy` function, not `middleware`)
- **shadcn v4 uses Base UI not Radix** — no `asChild` prop; use `buttonVariants()` + `<Link>` instead of `<Button asChild><Link>`
- **All Supabase reads must use server components** — browser client hangs indefinitely; use `createClient()` from `lib/supabase/server.ts`
- **Mock mode**: app runs with placeholder data when `NEXT_PUBLIC_SUPABASE_URL` is absent or `NEXT_PUBLIC_USE_MOCK_DATA=true`
- **Theme**: CSS tokens in `app/src/app/globals.css`; brand purple `#7a1d91` light / `#8b7bff` dark

## What's next
The site is live and ready for Karina (partner) to review the design. Likely next tasks:
- Wire up real data to the dashboard (replace mock data with live Supabase queries)
- Phase G — Audiocards (same as MedVoice, blocked on Bunny CDN uploads)
- Karina account: have her sign up at medhelpspace.vercel.app, then promote to `super_admin` via admin panel
- Any design feedback from Karina
