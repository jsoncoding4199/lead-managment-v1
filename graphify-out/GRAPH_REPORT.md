# Graph Report - .  (2026-07-26)

## Corpus Check
- 89 files · ~60,362 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 478 nodes · 949 edges · 34 communities (27 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Lead Server Actions
- Dashboard Tabs & Rendering
- API Routes & Notifications
- Dev Dependencies
- Admin & User Management
- TypeScript Config
- Runtime Dependencies
- CSV Import & Tooling
- Lead Card & Contact Rows
- Shared UI Components
- Lead Composer & Sources
- Auth & Login
- Status & Stats
- Reset Requests & Utils
- Forgot Password
- App Root & SW Registrar
- Vercel Config
- Dedupe Script
- Tab Bar
- Notifier Toasts
- Reset Password Script
- Service Worker
- Phone Backfill Script
- DB Seed
- Inbox Sender Backfill
- Push Enable Button
- Push Nudge Banner
- Next Config
- Next Env Types
- Tailwind Config

## God Nodes (most connected - your core abstractions)
1. `requireUser()` - 42 edges
2. `cn()` - 36 edges
3. `LeadCard()` - 21 edges
4. `requireMaster()` - 18 edges
5. `loadAccessibleLeadMeta()` - 16 edges
6. `compilerOptions` - 16 edges
7. `sendPushToUsers()` - 13 edges
8. `notifyLeadCreator()` - 12 edges
9. `formatDateTime()` - 12 edges
10. `scripts` - 11 edges

## Surprising Connections (you probably didn't know these)
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/backfill-recycled.ts → package.json
- `LeadComposer()` --references--> `ALL_LABELS`  [EXTRACTED]
  src/components/LeadComposer.tsx → scripts/backfill-lead-names.ts
- `main()` --calls--> `normalizeHeader()`  [EXTRACTED]
  scripts/csv-minus-existing.ts → src/lib/sheet.ts
- `main()` --calls--> `normalizePhone()`  [EXTRACTED]
  scripts/csv-minus-existing.ts → src/lib/sheet.ts
- `main()` --calls--> `parseCsv()`  [EXTRACTED]
  scripts/csv-minus-existing.ts → src/lib/sheet.ts

## Import Cycles
- None detected.

## Communities (34 total, 7 thin omitted)

### Community 0 - "Lead Server Actions"
Cohesion: 0.07
Nodes (62): GET(), ackLeadAction(), addLeadRemarkAction(), AddRemarkSchema, changeStatusAction(), ChangeStatusSchema, ContactStateValues, createLeadAction() (+54 more)

### Community 1 - "Dashboard Tabs & Rendering"
Cohesion: 0.06
Nodes (42): ageBoundaryDate(), ArchiveByAssignee(), ChannelLeadList(), DashboardPage(), DashStaticTab, DashTab, freshOrMarketVisibility(), globalLeadVisibility() (+34 more)

### Community 2 - "API Routes & Notifications"
Cohesion: 0.10
Nodes (23): Event, DashboardLayout(), LeadDetailPage(), deleteAllNotificationsAction(), deleteNotificationAction(), DeleteOneSchema, markNotificationReadAction(), markNotificationsReadAction() (+15 more)

### Community 3 - "Dev Dependencies"
Cohesion: 0.06
Nodes (35): autoprefixer, devDependencies, autoprefixer, postcss, prisma, tailwindcss, tsx, @types/bcryptjs (+27 more)

### Community 4 - "Admin & User Management"
Cohesion: 0.13
Nodes (24): MaxPickupSchema, updateMaxPickupAction(), createUserAction(), CreateUserSchema, deleteUserAction(), DeleteUserSchema, editUserAction(), EditUserSchema (+16 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 6 - "Runtime Dependencies"
Cohesion: 0.08
Nodes (25): bcryptjs, clsx, iron-session, lucide-react, next, dependencies, bcryptjs, clsx (+17 more)

### Community 7 - "CSV Import & Tooling"
Cohesion: 0.17
Nodes (18): RFC-4180, rows, main(), prisma, toCsv(), findOrCreateNamed(), importOwnLeadsAction(), ImportResult (+10 more)

### Community 8 - "Lead Card & Contact Rows"
Cohesion: 0.13
Nodes (15): listLeadLocationsAction(), listLeadRemarksAction(), listLeadSourcesAction(), CONTACT_STATE_OPTIONS, ContactRow(), contactStateLabel(), extractPhone(), Lead (+7 more)

### Community 9 - "Shared UI Components"
Cohesion: 0.13
Nodes (16): StageChip(), CollapsibleSection(), Props, ReassignSheet(), OPTIONS, Props, QUALITY_LABEL, QUALITY_TONE (+8 more)

### Community 10 - "Lead Composer & Sources"
Cohesion: 0.15
Nodes (15): ALL_LABELS, main(), NAME_LABELS, parseContact(), PHONE_LABELS, prisma, addLeadLocationAction(), addLeadSourceAction() (+7 more)

### Community 11 - "Auth & Login"
Cohesion: 0.24
Nodes (9): loginAction(), LoginSchema, LoginState, logoutAction(), initial, LoginForm(), getSession(), getSessionOptions() (+1 more)

### Community 12 - "Status & Stats"
Cohesion: 0.18
Nodes (9): StatusBadge(), MetricRow(), ORDER, TeamStatsTable(), UserStatsRow, SOFT_NEGATIVE_STATUSES, STATUS_GROUPS, STATUS_TONE (+1 more)

### Community 13 - "Reset Requests & Utils"
Cohesion: 0.39
Nodes (6): ResetsPage(), Body(), Request, ResetRow(), formatDateTime(), timeAgo()

### Community 14 - "Forgot Password"
Cohesion: 0.36
Nodes (5): requestResetAction(), RequestSchema, RequestState, ForgotPasswordForm(), initial

### Community 15 - "App Root & SW Registrar"
Cohesion: 0.33
Nodes (4): inter, metadata, viewport, ServiceWorkerRegistrar()

### Community 16 - "Vercel Config"
Cohesion: 0.33
Nodes (5): sin1, buildCommand, framework, regions, $schema

### Community 17 - "Dedupe Script"
Cohesion: 0.47
Nodes (5): main(), normalize(), prisma, report, say()

### Community 18 - "Tab Bar"
Cohesion: 0.33
Nodes (5): PrivateChannel, Props, TabBar(), TabItem, TabLink()

### Community 19 - "Notifier Toasts"
Cohesion: 0.40
Nodes (4): Event, EventKind, Notifier(), Toast

### Community 20 - "Reset Password Script"
Cohesion: 0.67
Nodes (3): main(), parseArgs(), prisma

### Community 21 - "Service Worker"
Cohesion: 0.67
Nodes (3): cacheFirst(), PRECACHE_URLS, revalidateInBackground()

### Community 22 - "Phone Backfill Script"
Cohesion: 0.67
Nodes (3): main(), prisma, toLocal()

## Knowledge Gaps
- **136 isolated node(s):** `config`, `name`, `version`, `private`, `dev` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requireUser()` connect `API Routes & Notifications` to `Lead Server Actions`, `Dashboard Tabs & Rendering`, `Admin & User Management`, `Lead Card & Contact Rows`, `Lead Composer & Sources`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `cn()` connect `Shared UI Components` to `Lead Server Actions`, `Dashboard Tabs & Rendering`, `API Routes & Notifications`, `Lead Card & Contact Rows`, `Lead Composer & Sources`, `Status & Stats`, `Reset Requests & Utils`, `Tab Bar`, `Notifier Toasts`, `Push Enable Button`, `Push Nudge Banner`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `requireMaster()` connect `Admin & User Management` to `Lead Server Actions`, `API Routes & Notifications`, `Reset Requests & Utils`, `CSV Import & Tooling`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `config`, `name`, `version` to the rest of the system?**
  _136 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lead Server Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.06584723441615452 - nodes in this community are weakly interconnected._
- **Should `Dashboard Tabs & Rendering` be split into smaller, more focused modules?**
  _Cohesion score 0.0593990216631726 - nodes in this community are weakly interconnected._
- **Should `API Routes & Notifications` be split into smaller, more focused modules?**
  _Cohesion score 0.09966777408637874 - nodes in this community are weakly interconnected._