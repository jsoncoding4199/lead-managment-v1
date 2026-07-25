# Leadboard — feature map

Purpose: for any change, open only the files (or the named functions inside the
big shared files) listed under that feature. Avoids re-scanning the whole app.

Three files are shared by many features — never read them whole, grep the named
symbol:
- `src/app/dashboard/page.tsx` (~1860 lines) — every tab's server query + renderer
- `src/app/dashboard/actions.ts` (~1660 lines) — every lead server action
- `src/components/LeadCard.tsx` (~2060 lines) — the lead card + all its sheets

Shared foundations (touch only when the concept itself changes):
- `src/lib/leadStatus.ts` — statuses, `STATUS_LABEL`, `STATUS_GROUPS`, `ACTIVE_STATUSES`, `ALWAYS_ARCHIVED_STATUSES`
- `src/lib/auth.ts` `session.ts` `channels.ts` — auth, iron-session, `canAccessLead`
- `src/lib/prisma.ts` `settings.ts` `utils.ts` — client, app settings, `waNumber`/date helpers
- `prisma/schema.prisma` — models; a column change is a migration, flag it

---

## Tabs, lists & filtering
The dashboard shell and every tab's query/renderer.
- `page.tsx`: `DashboardPage`, `LeadsSection` (dispatch by tab), `parseTab`, `parsePage`, `tabHref`, `StageRow`/`StageChip`, `Pager`, per-tab renderers (`OwnByDay`, `ArchiveByAssignee`, `ChannelLeadList`, `OpenGrouped`, `EmptyState`), `freshOrMarketVisibility`, `globalLeadVisibility`, `notInMasterPipeline`, `leadSelect`
- `components/TabBar.tsx`, `LeadFilterBar.tsx`, `LeadSearchBar.tsx`, `CollapsibleSection.tsx`
- Search/filter clause: `leadSearchFilter`, `leadFilterWhere` in `page.tsx`

## Sidebar & layout chrome
Left rail, header, per-status count badges, sign-out.
- `app/dashboard/layout.tsx` — computes `statusCounts` (groupBy), header
- `components/Sidebar.tsx` — nav, `NavGroup`/`NavLink`, `router.refresh()` on nav, logout
- Counts live in the LAYOUT: to refresh them a mutation must `revalidatePath("/dashboard", "layout")`

## Lead card & status actions
The card UI and the actions behind its buttons.
- `components/LeadCard.tsx` — `LeadCard`, `StatusMenu`, `ReassignSheet`, `ReminderSheet`, `LeadDetailsSheet`, `ContactRow`, `SourceRow`/`LocationRow`, `okPick`
- `actions.ts` — `changeStatusAction`, `pickUpLeadAction`, `setLeadAssignmentsAction`, `reassignPrivateLeadAction`, `resetToOpenMarketAction`, `updateLeadQualityAction`, `pingLeadAction`, `ackLeadAction`, `masterOkLeadAction`, `setContactStateAction`
- `components/StatusBadge.tsx`, `QualityPicker.tsx`

## Compose & contact fields (name/phone/source/location)
Adding leads by hand + the paste auto-detect.
- `components/LeadComposer.tsx` — form, paste parser, Detect button
- `actions.ts` — `createLeadAction`, `setLeadNameAction`, `setLeadPhoneAction`, `setLeadSourceAction`/`addLeadSourceAction`/`listLeadSourcesAction`, same trio for Location
- Phone/WhatsApp display: `waNumber` in `utils.ts`; `extractPhone` in `LeadCard.tsx`

## CSV / XLSX import (Own tab)
Bulk import + cross-reference dedup.
- `components/OwnLeadImport.tsx` — UI
- `actions.ts` — `importOwnLeadsAction`, `IMPORT_FIELDS`, `LOCATION_ALIASES`, `findOrCreateNamed`
- `lib/sheet.ts` — `parseSheet`/`parseCsv`/`readXlsx`, `normalizePhone`, `normalizeHeader`
- Offline/one-off tooling: `scripts/csv-minus-existing.ts`, `dedupe-leads.ts`, `check-sheet.ts`

## Remarks thread
Per-lead chat notes (page + inside the details sheet).
- `components/LeadRemarkThread.tsx`
- `actions.ts` — `addLeadRemarkAction`, `editLeadRemarkAction`, `listLeadRemarksAction`
- Rendered in `LeadDetailsSheet` (LeadCard) and `leads/[id]/page.tsx`

## Reminders
Per-lead follow-up alarms + the sweep.
- `LeadCard.tsx` `ReminderSheet`; `actions.ts` `setReminderAction`; `page.tsx` `loadMyReminders`
- `app/api/cron/reminders/route.ts` — due-sweep (needs an external scheduler; Vercel Hobby blocks sub-daily cron)

## Notifications & push
In-app history feed + Web Push.
- Feed: `app/dashboard/notifications/page.tsx` + `actions.ts` (mark read, delete, delete-all)
- Bell/badge: `components/NotificationsBell.tsx`, `Notifier.tsx`; count in `layout.tsx`
- Push plumbing: `lib/webPush.ts` (`sendPushToUsers`, 50-row prune), `app/api/push/*`, `components/PushEnableButton.tsx`, `PushNudgeBanner.tsx`, `ServiceWorkerRegistrar.tsx`, `public/sw.js`

## Own tab (master private list)
Master-only private pipeline.
- `page.tsx` — `tab.key === "own"` branch, `OwnByDay`
- Gated by `isOwn` on Lead; created via `createLeadAction` (`isOwn`) and `importOwnLeadsAction`

## Admin / team / settings
User management, stats, app settings, password resets.
- `app/dashboard/admin/page.tsx` + `admin/actions.ts`; `admin/resets/page.tsx`
- `components/CreateUserForm.tsx`, `UserRow.tsx`, `MaxPickupCard.tsx`, `MasterProfileCard.tsx`, `TeamStatsTable.tsx`, `ResetRow.tsx`
- `app/dashboard/settings/*`; `lib/settings.ts`

## Auth
- `app/login/*`, `forgot-password/*`, `lib/auth.ts`, `session.ts`
- `components/LoginForm.tsx`, `ChangePasswordForm.tsx`, `ForgotPasswordForm.tsx`

## PWA / offline
- `app/manifest.ts`, `app/offline/page.tsx`, `public/sw.js`, `components/InstallButton.tsx`, `ServiceWorkerRegistrar.tsx`
