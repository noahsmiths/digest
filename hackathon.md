# Hackathon log

- **Project:** digest
- **Event:** Convex All Gas Hackathon
- **What it does:** An authenticated Convex + React app that turns Instagram, X, and LinkedIn feeds into durable, categorized digests while preserving the original post content and images.
- **Live app:** not deployed
- **Repo:** https://github.com/noahsmiths/digest
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/auth (core, password, username, OAuth), @convex-dev/agent, @convex-dev/workflow; Firecrawl is integrated through its SDK rather than its Convex component because the component lacks required Browser API features
- **Convex features:** schema, tables, indexes, queries, mutations, actions, realtime queries, paginated queries, file storage, durable workflows
- **Auth:** Convex Auth
- **AI models:** gpt-5
- **Started:** 2026-09-02T09:44:09Z
- **Last updated:** 2026-09-13T05:33:11Z

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

### 2026-09-13 - 4f79e01

Built authenticated, durable digest generation that sequentially scrapes up to
50 posts per connected service, retries idempotent steps, and classifies saved
posts in concurrent multimodal GPT-5 batches. Added partial-result fallbacks,
persisted paginated history, reactive progress, and category-grouped detail
views; registered the Agent and Workflow components (`convex/digest`,
`convex/digests.ts`, `convex/schema.ts`, `convex/convex.config.ts`, `src/App.tsx`).
Firecrawl remains a direct SDK integration because its Convex component does not
cover the Browser API features this app needs (`convex/scraping/shared.ts`).
