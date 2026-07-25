# Leadboard

Before making changes, read `docs/ARCHITECTURE.md` — it maps every feature to the
exact files (and the functions to grep inside the big shared ones). Open only the
slice for the feature you're changing; do not read `page.tsx`, `actions.ts`, or
`LeadCard.tsx` in full.

Deploy: `git push && vercel --prod --yes` straight to production (no preview).
Commits use `jsoncoding4199 <291261185+jsoncoding4199@users.noreply.github.com>`.
Type-check with `npx tsc --noEmit` before deploying.
