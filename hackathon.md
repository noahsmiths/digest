# Hackathon log

- **Project:** digest
- **Event:** Convex All Gas Hackathon
- **What it does:** An authenticated Convex + React app that turns Instagram, X, and LinkedIn feeds into durable, categorized digests with customizable category rules and scheduled email delivery, while preserving the original post content and images.
- **Live app:** https://focused-wolf-619.convex.site
- **Repo:** https://github.com/noahsmiths/digest
- **Frontend:** Convex static hosting
- **Convex deployment:** https://focused-wolf-619.convex.cloud
- **Components:** @convex-dev/auth (core, password, username, OAuth), @convex-dev/agent, @convex-dev/workflow, @convex-dev/static-hosting; Firecrawl is integrated through its SDK rather than its Convex component because the component lacks required Browser API features; AgentMail sends digest emails, receives and fetches replies for category/rule updates, and sends confirmations through its Node SDK because its Convex component was broken during our build
- **Convex features:** schema, tables, indexes, queries, mutations, actions, realtime queries, paginated queries, file storage, durable workflows, crons, HTTP actions, scheduled functions
- **Auth:** Convex Auth
- **AI models:** gpt-5
- **Started:** 2026-09-02T09:44:09Z
- **Last updated:** 2026-09-18T05:30:00Z

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

### 2026-09-14 - 40e8fd5

Reused a Firecrawl browser session across service scrapes, added retries and
content filtering, and narrowed digest selection to social updates and upcoming
events. Added mutual-connection metadata and removed dropped posts and unused
images (`convex/scraping/shared.ts`, `convex/digest/actions.ts`,
`convex/digest/classification.ts`, `convex/digests.ts`, `convex/schema.ts`).

### 2026-09-16 - 1c689c2

Improved feed extraction and mutual-connection detection across the platforms.
Added AgentMail digest delivery with idempotent sends, saved message IDs, and
delivery status (`convex/scraping`, `convex/digest/email.ts`, `convex/digests.ts`).
Used AgentMail's Node SDK because its Convex component was broken during our
build (builder-reported; SDK use is confirmed in the email action).

### 2026-09-16 - ca6cb0e

Redesigned the app around a landing page, digest reading/history, and service
connections. Added a shared app shell, updated sign-in, and made original post
text the focus with compact image browsing (`src/App.tsx`, `src/ui`,
`src/auth/AuthForm.tsx`, `src/index.css`).

### 2026-09-16 - 34a48d8

Added daily digest generation and email delivery at the user's selected time
and time zone. Persisted delivery preferences and used a Convex cron to start
due digests; expanded service settings into a settings page
(`convex/preferences.ts`, `convex/crons.ts`, `convex/users.ts`,
`convex/digests.ts`, `src/ui/SettingsPage.tsx`).

### 2026-09-16 - f17b1ed

Made category names and classification rules customizable in settings. Saved
user preferences and applied them to new digest classifications and category
views (`shared/classificationPrompt.ts`, `convex/preferences.ts`,
`convex/digest/classification.ts`, `convex/digests.ts`,
`src/ui/SettingsPage.tsx`, `src/ui/DigestPage.tsx`).

### 2026-09-17 - 9e1caba

Added a shared modal for sign-in and service connection flows, plus a post
image viewer (`src/ui/Modal.tsx`, `src/auth/AuthForm.tsx`,
`src/ui/SettingsPage.tsx`, `src/ui/DigestPage.tsx`).

### 2026-09-17 - e6a44ad

Added signed AgentMail webhooks and sender/thread checks to route authorized
email replies into a durable preference-update workflow. The Node SDK fetches
the reply, GPT-5 edits category rules through the Agent component, and AgentMail
sends a confirmation in the same thread; saved inbox/thread IDs support routing
(`convex/http.ts`, `convex/emailReplies.ts`, `convex/digest/replyActions.ts`,
`convex/digest/replyWorkflow.ts`, `convex/digest/email.ts`).

### 2026-09-17 - 80d9c8c

Replaced query-parameter navigation with routed pages and updated digest email
links to use the new paths. Added a frontend fallback for direct page requests
(`src/App.tsx`, `src/main.tsx`, `shared/routes.ts`, `convex/digests.ts`,
`public/_redirects`).

### 2026-09-18 - fc8c7dc

Refined the landing, digest, and settings layouts. Made the landing-page digest
demo interactive and fixed scrolling in the demo and digest reader
(`src/ui/LandingPage.tsx`, `src/ui/DigestPage.tsx`,
`src/ui/SettingsPage.tsx`, `src/index.css`).

### 2026-09-18 - 566064b

Added digest deletion with cleanup of posts, images, workflows, and associated
email-reply agent threads (`convex/digests.ts`, `src/ui/DigestPage.tsx`).
Improved service connection controls with explicit completion and cancellation;
cancelling closes the Firecrawl browser and removes the pending session
(`convex/login/node.ts`, `src/App.tsx`, `src/ui/SettingsPage.tsx`).

### 2026-09-18 - 7ebd098

Restyled digest emails to include full posts, images, category counts, and warnings
in HTML and plain text (`shared/digestEmail.ts`, `convex/digests.ts`, `convex/digest/email.ts`).
Published the production backend and frontend through Convex static hosting while
preserving auth and webhook paths (`convex/convex.config.ts`, `convex/http.ts`, `package.json`, `README.md`).
GitHub redirects now use `DIGEST_APP_URL` (`convex/auth.ts`). Build, TypeScript, lint,
hosted routes, auth key serving, and unsigned-webhook rejection passed; full GitHub login remains unverified.
