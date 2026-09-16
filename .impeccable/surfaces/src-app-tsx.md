---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/index.css","src/auth/AuthForm.tsx"]
---

# Digest web flow

Landing: Persuade. Service settings: Operate. Digest page: Read.

The visitor needs to understand that Digest replaces feed browsing with a finite, selective text read. The primary action is Start, followed by sign-in, service connection, and an obvious path to the digest page. Settings remains reachable for disconnecting accounts. The digest page supports new runs, history, selectable sections, progress, partial results, and small image carousels beside text.

Original text versus rewritten post summaries and the exact image-carousel grouping remain open until the user answers; this build uses the current backend’s selected original posts with one carousel per post.

## Direction contract

THESIS: The first screen demonstrates a finite digest as a quiet letter someone can actually read; it refuses a generic promise-and-cards hero.

OWN-WORLD: A pale sage field holds one uncoated paper sheet. Deep green ink, fine rules, dated marks, and one restrained rust seal carry every navigation, control, state, and reading surface.

STORY: See the feed transformed into a short letter, start, sign in, connect services, then read or generate a digest; return to settings to disconnect.

FIRST VIEWPORT: At desktop width, a compact masthead sits above a large left thesis and Start action while a full-height example digest sheet occupies the right two-thirds. Its contents rail, two text sections, and small side images are visible immediately. On mobile, the action precedes a full-width sheet.

FORM: The Daily Letter, seventh of seven grounded directions; seed 630d4a36. The signature interaction is a persistent section selector that moves to the chosen passage and marks the current one. Motion is one gentle sheet arrival; carousels advance only by user action.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
