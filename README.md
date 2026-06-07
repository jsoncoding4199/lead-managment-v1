# Leadboard — Lead Management

A focused, beautifully-designed lead pipeline for small teams. Everyone on the
team can drop new leads in; only the **master** user can assign them, manage
users, and approve password resets. Built as a single Next.js app — one
deployment to Vercel, no separate backend.

## Features

- **Login + Forgot password** — username/password sign-in; users can request a
  reset that lands in the master's queue.
- **Two-tab dashboard** — *Open* (active pipeline) and *Archive* (closed,
  rejected, spam, etc.).
- **Paste-to-create leads** — any user opens a composer, pastes raw text, hits
  *Add to pipeline*. Status defaults to **New**.
- **Status pipeline** with grouped sub-options exactly per spec:
  - Contact → Able / Not able
  - Documents → Able to get / Not able to get
  - Appointment → Able / Not able
  - Spam or Missing
  - Reject
  - Approve
  Statuses that are *not able* / *spam* / *rejected* / *approved* flow into the
  Archive tab automatically.
- **Master-only powers**
  - Assign / unassign leads to any team member.
  - Add new users, disable/enable them, reset their passwords.
  - Resolve password-reset requests.
- **Audit trail** — every status change is recorded with who/when/from→to and
  rendered as a timeline on each lead's detail page.

## Stack

| Layer       | Tech                                 |
|-------------|--------------------------------------|
| Framework   | Next.js 15 (App Router, Server Actions) |
| UI          | React 19, Tailwind CSS, lucide-react |
| Auth        | iron-session (encrypted cookie)      |
| Database    | PostgreSQL via Prisma                |
| Validation  | Zod                                  |
| Hosting     | Vercel                               |

## Local setup

```bash
cd lead-management-v2
cp .env.example .env
# Fill in DATABASE_URL, SESSION_PASSWORD, MASTER_USERNAME, MASTER_PASSWORD

npm install
npx prisma db push           # apply schema to your database
npm run seed                 # create the initial master user
npm run dev                  # http://localhost:3000
```

Sign in with the master username + password you set in `.env`. The master can
then add team users from **Team** in the sidebar.

### Generating a session secret

```bash
# any 32+ char random string works
openssl rand -base64 32
```

## Deploying to Vercel

1. **Provision a Postgres database.** [Neon](https://neon.tech) is free and works
   beautifully on Vercel. Copy the **pooled** connection string — that's the
   one with `-pooler` in the host. Append `?sslmode=require` if it's not there.
2. **Push this project to GitHub** (or import directly into Vercel).
3. **Create a new Vercel project** pointing at this folder. Framework preset:
   *Next.js*. No special build command is needed — `npm run build` runs
   `prisma generate && next build`.
4. **Environment variables (Production):**
   - `DATABASE_URL` — your Neon pooled connection string.
   - `SESSION_PASSWORD` — 32+ char random string (see above).
   - `MASTER_USERNAME` / `MASTER_PASSWORD` / `MASTER_DISPLAY_NAME` —
     only used the first time you run `npm run seed`.
5. **Apply the schema:** the cleanest path is to run, from your local machine,
   pointed at the production database:

   ```bash
   DATABASE_URL="<your prod pooled url>" npx prisma db push
   DATABASE_URL="<your prod pooled url>" MASTER_PASSWORD="..." npm run seed
   ```

   (Once seeded, the master can manage all users from the UI.)
6. **Deploy.** That's it.

### A note on Prisma + serverless

This project relies on Neon's pooled connection so each cold lambda gets a
fast, pooled connection. If you switch to non-Neon Postgres, point
`DATABASE_URL` at a connection pooler (PgBouncer in transaction mode is fine)
or you'll exhaust connections under traffic.

## Project layout

```
src/
  app/
    login/                   # sign-in
    forgot-password/         # reset request
    dashboard/
      page.tsx               # Open/Archive tabs + lead grid
      leads/[id]/page.tsx    # lead detail + history timeline
      admin/                 # master-only: team + reset queue
      actions.ts             # createLead / changeStatus / assign
  components/                # presentational + interactive widgets
  lib/
    prisma.ts                # singleton Prisma client
    session.ts               # iron-session config
    auth.ts                  # currentUser / requireUser / requireMaster
    leadStatus.ts            # status labels, groups, tones
prisma/
  schema.prisma              # User, Lead, LeadStatusChange, PasswordResetRequest
  seed.ts                    # creates the initial master
```

## Permission model in one sentence

Any signed-in user can **create** leads, **view** any lead, and **move** any
lead's status. Only the master can **assign** leads, **manage** users, and
**resolve** password resets.
