---
name: Digest
description: A quiet, finite letter made from connected social feeds.
colors:
  field: "#e1e9e4"
  paper: "#faf8f1"
  paper-soft: "#f0f0e8"
  ink: "#18332e"
  ink-soft: "#456159"
  rule: "#b5c7bd"
  paper-rule: "#d7ded4"
  seal: "#a34935"
  seal-dark: "#843a29"
typography:
  display:
    fontFamily: "Alegreya Sans, Trebuchet MS, sans-serif"
    fontSize: "clamp(48px, 5vw, 76px)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Alegreya Sans, Trebuchet MS, sans-serif"
    fontSize: "clamp(36px, 3.5vw, 48px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Alegreya Sans, Trebuchet MS, sans-serif"
    fontSize: "clamp(33px, 3.2vw, 48px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
  body-reading:
    fontFamily: "Alegreya Sans, Trebuchet MS, sans-serif"
    fontSize: "21px"
    lineHeight: 1.34
  body-ui:
    fontFamily: "Alegreya Sans, Trebuchet MS, sans-serif"
    fontSize: "17px"
  label:
    fontFamily: "Alegreya Sans, Trebuchet MS, sans-serif"
    fontSize: "16px"
    fontWeight: 700
rounded:
  square: "0"
  action: "2px"
  seal: "50%"
spacing:
  desktop-gutter: "24px"
  mobile-gutter: "16px"
  tight: "8px"
  group: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.action}"
    padding: "10px 22px"
    height: "50px"
    typography: "{typography.body-ui}"
  button-text:
    textColor: "{colors.ink}"
    padding: "4px 0"
  button-small:
    textColor: "{colors.ink}"
    padding: "5px 12px"
    height: "39px"
  input-auth:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "8px 13px"
    height: "46px"
  sheet-letter:
    backgroundColor: "{colors.paper}"
  section-selector-active:
    backgroundColor: "{colors.paper-soft}"
    textColor: "{colors.ink}"
    height: "39px"
    padding: "4px 9px"
---

# Design System: Digest

## Overview

**Creative North Star: "The Daily Letter"**

Digest treats social updates as a short letter one can finish. A pale sage field surrounds uncoated paper, with deep green ink, fine rules, dated reading marks, and a restrained rust seal. The letter is the reading surface across the preview, connections, digest history, and authentication.

The visual voice is editorial and calm. Alegreya Sans carries the entire interface, from the thesis and letter headings to controls and metadata. Space and rules separate passages. Source images stay compact beside the text, and the main section selector keeps the reader oriented as they move through the letter.

**Key Characteristics:**
- A pale field and warm paper make the finite reading surface unmistakable.
- Green ink does most of the work; rust marks emphasis, selection, and caution.
- Reading text leads, with compact source images alongside it.
- The sheet arrives gently once; sections and image carousels move by user action.

## Colors

The palette reads like ink on paper set against a muted sage desk.

### Primary
- **Deep Green Ink**: Main text, primary actions, strong rules, and the footer.
- **Soft Green Ink**: Supporting copy, metadata, quiet navigation, and idle selectors.

### Secondary
- **Rust Seal**: Selection marks, focus outlines, progress, and the circular letter mark.
- **Dark Rust**: The italic hero phrase and warning or error text.

### Neutral
- **Sage Field**: The page canvas around each sheet.
- **Uncoated Paper**: The letter sheets, reading surface, and auth dialog.
- **Soft Paper**: Hover and active selector fills and image fallback.
- **Field Rule**: Outer dividers, history rows, and form strokes.
- **Paper Rule**: Fine dividers within the letter and quiet alert borders.

**The Seal Rule.** Rust marks a meaningful state or a single editorial accent; green ink remains the default voice.

## Typography

**App Font:** Alegreya Sans (Trebuchet MS fallback)

**Character:** A single sans-serif voice keeps reading, controls, metadata, and status clear and consistent.

### Hierarchy
- **Display** (500, fluid 48–76px, 0.98 line height): The landing thesis; its italic phrase uses dark rust. Mobile uses 34–48px.
- **Headline** (500, fluid 36–48px, 1 line height): Page introductions. The mobile digest heading uses 32px.
- **Title** (500, fluid 33–48px, 1 line height): The letter heading; digest and mobile variants adjust its size.
- **Body reading** (21px, 1.34 line height): Original post text, with a maximum measure of 72ch. Mobile post text is 19px.
- **Body UI** (17px): The page default, controls, and explanatory copy.
- **Label** (700, 16px): Form labels and prominent small actions; quieter metadata ranges from 13–16px.

**The Reading Voice Rule.** Use Alegreya Sans throughout the product.

## Layout

The desktop canvas is centered with a maximum width of 1650px and a 24px gutter per side. Each page occupies the dynamic viewport height, with a compact 64px masthead and no document scrolling. An 8/16/24px spacing scale separates tight controls, related groups, and distinct sections. The landing hero places the thesis beside a large internally scrollable example sheet, followed by a compact closing passage and footer. The digest page gives all remaining height to its reading layout: a 190px independently scrolling history rail beside an expanded, internally scrolling reading sheet. A sticky section index stays beside the passages, and section selection follows the reader’s scroll position. Settings uses one narrower, internally scrolling sheet.

At 1100px, the preview index becomes horizontal and the reading rails narrow. At 760px, the gutter and paper padding become 16px, the masthead becomes a single compact 56px row, the hero stacks, and the digest index becomes a sticky horizontally scrolling row. History becomes a collapsible, bounded horizontal list, and service actions wrap below their names. On short screens the landing main can scroll internally so its copy remains accessible while the outer page and footer stay fixed. At 390px, the smallest seals and example images shrink again.

**The Letter Measure Rule.** Give post text a readable measure before allocating space to images; a post image is secondary and stays compact beside its passage.

## Elevation & Depth

The sheets use one diffuse green-tinted shadow to separate warm paper from sage field. The auth dialog uses a deeper shadow and a dark blurred backdrop. Inside the letter, depth comes from paper tones, ink rules, and selection underlines rather than raised cards.

**The Paper Rule.** Use elevation for the whole sheet or modal, then keep entries and controls flat within it.

## Shapes

The system is mostly square: paper sheets, fields, row actions, status labels, and selectors rely on fine rules rather than rounded cards. The primary action has a barely softened 2px corner. Circular letter marks and connection dots are the deliberate exceptions. The rust seal appears as an outlined circle; selected navigation and sections are marked with a thin rust rule.

## Components

### Buttons
- **Primary:** Green ink fill, paper text, slight 2px corner, 50px minimum height, and 10px × 22px padding. Hover deepens the green and lifts 2px; active returns to the baseline.
- **Small row action:** Square outlined control for connecting or disconnecting; hover fills with ink.
- **Text action:** Flat ink label with a bottom rule; hover changes label and rule to rust.
- **Focus / Disabled:** Keyboard focus gets a 3px rust outline with 3px offset. Disabled buttons lower opacity to 0.48.

### Cards / Containers
- **Letter sheet:** Warm paper with one diffuse green-tinted shadow. Fine paper rules divide its head, entries, and ending; generous padding changes by surface and viewport.
- **Status and alert:** Compact outlined labels. Rust border and dark rust text signal partial, failed, running, warning, or error states; complete uses green ink.

### Inputs / Fields
- **Auth field:** Square paper input with a field-rule stroke, 46px height, and 8px × 13px padding. Focus changes the border to ink and adds an inset rust underline. Errors use dark rust text.

### Navigation
- **App navigation:** Flat sans-serif labels in soft ink; the active page uses deep ink and a rust bottom rule. On mobile the links move to a second header row.
- **Section selector:** Soft ink at rest, soft paper on hover, and deep ink with a rust underline when active. The digest index stays near the passage on desktop and becomes a sticky horizontal row on mobile.
- **History item:** Date-led text in the field rail. The selected letter gains paper fill and an inset rust underline; mobile history is revealed through a toggle and scrolls horizontally.

### Post and image
Post author and source sit above the original text. Long posts can expand in place. Images form a small, per-post carousel at the side, with explicit previous and next controls only when there is more than one image.

## Do's and Don'ts

### Do:
- **Do** place the finite letter on the sage field for primary reading surfaces.
- **Do** use rust to identify selection, focus, progress, and caution.
- **Do** preserve the text-first passage and compact per-post image relationship.
- **Do** keep section selection visible and tied to the passage in view.

### Don't:
- **Don't** turn post rows into separately elevated cards.
- **Don't** enlarge source images until they compete with the text.
- **Don't** animate the image carousel without user action.
