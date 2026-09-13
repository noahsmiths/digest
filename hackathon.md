# Hackathon log

- **Project:** digest
- **Event:** Convex All Gas Hackathon
- **What it does:** A Convex + React app that authenticates users, connects Instagram, X, and LinkedIn accounts, and scrapes their following or recent feeds into a shared post shape with persisted images.
- **Live app:** not deployed
- **Repo:** https://github.com/noahsmiths/digest
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/auth (core, password, username, OAuth)
- **Convex features:** schema, tables, indexes, queries, mutations, actions, realtime queries, file storage
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-02T09:44:09Z
- **Last updated:** 2026-09-13T04:01:34Z

## Log

### 2026-09-02 - 5caf6d8

Initialized the authenticated Convex + React starter with a persisted,
realtime number list backed by a schema, query, mutation, and action
(`convex/schema.ts`, `convex/myFunctions.ts`, `src/App.tsx`).

### 2026-09-04 - 3b7e3a9

Added the first linked-services table, keyed by authenticated user and service,
to prepare for storing connected accounts (`convex/schema.ts`).

### 2026-09-09 - 17fb6e5

Replaced the starter number demo with an Instagram connection flow using
authenticated Firecrawl browser sessions. Added actions plus indexed internal
queries and mutations to manage in-progress sessions and persist completed
connections (`convex/login.ts`, `convex/login/node.ts`, `convex/schema.ts`).

### 2026-09-10 - 5583882

Migrated authentication to Convex Auth v2 alpha with email/password and GitHub
OAuth. Registered the core, password, username, and OAuth components; added app
user records and reusable sign-in UI (`convex/auth.ts`, `convex/users.ts`,
`convex/convex.config.ts`, `src/auth/AuthForm.tsx`).

### 2026-09-10 - aaf9896

Fixed restarted service logins so they close the old Firecrawl browser and
delete its stale Convex session record before creating a replacement
(`convex/login.ts`, `convex/login/node.ts`).

### 2026-09-10 - b4ea6a1

Expanded linked account support to Instagram, X, and LinkedIn. The
authenticated UI now lists every service with realtime connection state and
launches the selected provider's Firecrawl login flow (`src/App.tsx`,
`convex/login.ts`, `convex/login/node.ts`, `convex/utilities/sites.ts`).

### 2026-09-10 - c37e0f4

Added noninteractive disconnect flows that reopen each saved Firecrawl profile,
navigate to the provider's logout endpoint, and remove the linked-service row
after logout completes so the UI updates in realtime (`convex/login.ts`,
`convex/login/node.ts`, `src/App.tsx`).

### 2026-09-13 - 9c9b1f8

Added authenticated feed scraping for Instagram Following, X Following, and
LinkedIn Recent. Each Convex action normalizes author, body, and images while
persisting scraped media in Convex file storage; the temporary frontend exposes
the results for manual inspection (`convex/scraping`, `src/App.tsx`).
