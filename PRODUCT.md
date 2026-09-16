# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individuals following their personal network and events across social feeds. Their job is to stay up to date without spending time inside attention-hijacking, algorithmically driven feeds.

## Product Purpose

Digest extracts relevant activity from connected feeds and presents it as quick, readable, saved text-first digests. Success means a person can stay up to date on the necessary parts of their feeds without visiting the platforms themselves.

## Positioning

The defining value is a calm, selective reading experience that replaces feed browsing. Source images remain available in a secondary, compact carousel so they do not compete with the text.

## Operating Context

First-time visitors see the product purpose and can start by signing in. After sign-in, people with no connected services land on a service settings page; they can connect or later disconnect services there, then visit the main digest page to start a run and read history. The digest sections are clearly delineated and selectable, with text as the primary content and images small and secondary. In the current prototype, completed runs group posts under Social and Upcoming events. A compact email can link back to the full digest when mail delivery is configured.

## Capabilities and Constraints

- The current prototype supports Instagram, X, and LinkedIn connections and collects up to 50 posts per connected feed for each run.
- Authentication uses email/password or GitHub. Connected-account sessions, digest history, post content, and images are persisted through the Convex backend.
- Digest generation reports progress and partial failures; categorization may omit posts when a classification batch fails.
- The prototype is exploratory. The supported services and longer-term feature scope are open decisions, not permanent commitments.

## Brand Commitments

The existing product name is Digest. No binding voice or visual identity has been established.

## Evidence on Hand

The current behavior and content are evidenced by [src/App.tsx](src/App.tsx), the Convex digest implementation, and [hackathon.md](hackathon.md). The hackathon log records the project as undeployed; no customer proof, usage results, or testimonials are on hand.

## Product Principles

- Extract only the necessary activity so reading a digest can replace visiting a feed.
- Put readable text first and keep source images secondary.
- Make personal-network activity and upcoming events easy to scan and revisit.
- Keep generated digests durable and browsable over time.
- Show incomplete results and failures clearly so a person understands what a digest contains.
- Treat the current service list as prototype scope until a later product decision confirms it.
