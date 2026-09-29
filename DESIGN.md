---
name: Old Token Check
description: Read-only checker that finds legacy tokens you can still migrate, each result proven by simulation.
colors:
  night-ground: "#0b0d13"
  charcoal-panel: "#10151c"
  charcoal-raised: "#151b24"
  hairline: "#1e242c"
  hairline-strong: "#2a313b"
  ink: "#f2f4f7"
  ink-muted: "#b3bbc6"
  ink-quiet: "#8a94a1"
  ready-teal: "#2dd4bf"
  ready-teal-ink: "#5eead4"
  ready-teal-wash: "#0e2b29"
  caution-amber: "#f3b75f"
  caution-amber-wash: "#2b2112"
  danger-rose: "#f58b8b"
  danger-rose-wash: "#2d1618"
  pale-button: "#eceff3"
  pale-button-hover: "#ffffff"
typography:
  display:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "clamp(32px, 5.2vw, 56px)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  stat-number:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "clamp(34px, 3.6vw, 46px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  headline:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "clamp(26px, 3vw, 36px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  amount:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "clamp(24px, 2.6vw, 32px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "clamp(21px, 2.3vw, 27px)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  body-small:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.02em"
  mono:
    fontFamily: "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  mono-input:
    fontFamily: "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace"
    fontSize: "clamp(15px, 1.7vw, 20px)"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  xs: "8px"
  sm: "10px"
  md: "14px"
  panel-mobile: "16px"
  lg: "20px"
  full: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "18px"
  lg: "28px"
  panel-x: "36px"
  gutter: "clamp(16px, 4vw, 36px)"
  section: "clamp(72px, 12vh, 128px)"
  wrap: "1180px"
components:
  button-check:
    backgroundColor: "{colors.pale-button}"
    textColor: "{colors.night-ground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 30px"
    height: "52px"
  button-check-hover:
    backgroundColor: "{colors.pale-button-hover}"
    textColor: "{colors.night-ground}"
  button-soft:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-copy:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
  button-copy-copied:
    backgroundColor: "{colors.ready-teal-wash}"
    textColor: "{colors.ready-teal-ink}"
  search-bar:
    backgroundColor: "{colors.charcoal-panel}"
    textColor: "{colors.ink}"
    typography: "{typography.mono-input}"
    rounded: "{rounded.lg}"
    padding: "12px 12px 12px 22px"
  result-card:
    backgroundColor: "{colors.charcoal-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "30px 36px 28px"
  summary-card:
    backgroundColor: "{colors.charcoal-panel}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "28px 36px"
  pill-ready:
    backgroundColor: "{colors.ready-teal-wash}"
    textColor: "{colors.ready-teal-ink}"
    rounded: "{rounded.full}"
    padding: "9px 18px"
  pill-warn:
    backgroundColor: "{colors.caution-amber-wash}"
    textColor: "{colors.caution-amber}"
    rounded: "{rounded.full}"
    padding: "9px 18px"
  pill-bad:
    backgroundColor: "{colors.danger-rose-wash}"
    textColor: "{colors.danger-rose}"
    rounded: "{rounded.full}"
    padding: "9px 18px"
  pill-pending:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ink-quiet}"
    rounded: "{rounded.full}"
    padding: "9px 18px"
  chain-chip:
    backgroundColor: "{colors.charcoal-panel}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "7px 12px"
  tip-card:
    backgroundColor: "{colors.charcoal-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "22px"
  toast:
    backgroundColor: "{colors.pale-button}"
    textColor: "{colors.night-ground}"
    rounded: "{rounded.full}"
    padding: "10px 18px"
---

# Design System: Old Token Check

## Overview

**Creative North Star: "The Quiet Ledger"**

A dark, near-silent instrument that answers one question and then shows its working. The world is owner-pinned to the "stuck bridge funds" checker: a near-black ground, charcoal panels lifted one step and edged with 1px hairlines, generous corner radii, a pale grey Check button, and a single teal voice that means "this is proven and actionable." Nothing decorates; every mark on the page is either a value, a verdict, or an instruction.

Density follows the story. The first viewport is sparse (wordmark, one-line purpose, the search bar, a lock line, four stats between hairlines). Results get denser as the user opens them: a result card carries amount, route, simulation proof and a dashed rule before the action line; expanded steps turn into a flat ledger of hairline field rows with monospace values and Copy buttons. Addresses, hashes, calldata and field names are always monospace; everything a person reads as prose is system sans.

The system is dark only (`color-scheme: dark`). There is no light theme and no theme switch.

**Key Characteristics:**
- Near-black ground, one-step charcoal panels, 1px hairlines; no gradients, no textures.
- Teal is a verdict, not a decoration: Ready pills, links and actions, the scanning pulse.
- System sans for reading, ui-monospace for anything a user pastes or verifies.
- Generous radii (20px) on panels and fully rounded pills and chips.
- Flat hairline rows inside cards; never a card inside a card.
- Honest numbers: tabular figures, "< $0.01" floor, no fabricated values.

## Colors

A cool blue-black neutral ramp with one teal accent and two muted risk tones, each risk tone paired with its own dark wash.

### Primary
- **Ready Teal** (`ready-teal`): the state color. Focus outlines, the scanning/simulating dot pulse on chain chips, the brand magnifier mark, "good" note icons, the caret, and the text-selection tint (at 28% alpha).
- **Ready Teal Ink** (`ready-teal-ink`): the text form of teal. Every link, the "How to migrate on Etherscan" action, disclosure arrows, and the label of the "Ready to migrate" pill and a "Copied" button.
- **Ready Teal Wash** (`ready-teal-wash`): the only teal fill. Background of the Ready pill and a just-copied button.

### Secondary
- **Caution Amber** (`caution-amber`) on **Caution Amber Wash** (`caution-amber-wash`): warn-tone pills ("Nothing received", "Couldn't simulate", "Amount differs"), warn note icons, the progress note, and inline warn text.
- **Danger Rose** (`danger-rose`) on **Danger Rose Wash** (`danger-rose-wash`): bad-tone pills ("Paused or closed", "Simulation failed", "Limited payout"), danger notes, failed chain chips, and input errors.

### Neutral
- **Night Ground** (`night-ground`): the page background, the ink on the pale Check button and toast.
- **Charcoal Panel** (`charcoal-panel`): search bar, summary, result cards, tip card, route disclosure, chain chips.
- **Charcoal Raised** (`charcoal-raised`): one step above a panel: neutral pills, step-number discs, Copy and soft buttons.
- **Hairline** (`hairline`): the default 1px line. Panel borders, the stats row rules, section top rules, field-row dividers.
- **Hairline Strong** (`hairline-strong`): the emphasized line. Dashed rules inside cards, dashed empty-state border, button borders, search border on focus, scrollbar thumb.
- **Ink** (`ink`): headlines, amounts, primary values.
- **Ink Muted** (`ink-muted`): lede, supporting prose, card action context, chain chips at rest.
- **Ink Quiet** (`ink-quiet`): metadata, stat descriptions, field types, lock line, footer meta (5.96:1 on the panel; the lowest text tier allowed).
- **Pale Button** (`pale-button`, hover `pale-button-hover`): the Check button and the toast, the only light surfaces on the page.

### Named Rules
**The Teal Is A Verdict Rule.** Teal appears only where something is proven or actionable: Ready pills, links and actions, the scanning pulse, focus. It is never a heading color, a panel fill, a border decoration, or an illustration tint. If a screen shows teal on something that is not ready or clickable, it is wrong.

**The Paired Wash Rule.** A status tone is always its bright ink on its own dark wash (teal on teal wash, amber on amber wash, rose on rose wash). Never put a status ink on the neutral panel as a fill color, and never introduce a fourth status hue.

**The Dark Only Rule.** The system ships dark only. Do not add light-mode tokens or a `prefers-color-scheme: light` branch.

## Typography

**Display Font:** system UI sans (`ui-sans-serif`, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial)
**Body Font:** the same system UI sans
**Label/Mono Font:** `ui-monospace` (SF Mono, Menlo, Consolas, Liberation Mono)

**Character:** a native, tool-like sans that reads as the user's own operating system, paired with the platform monospace for everything that must be copied or checked character by character. The owner pinned this pairing to match the reference checker; it is this product's world, not a default for other products.

### Hierarchy
- **Display** (700, clamp 32–56px, 1.06, -0.035em): the one page headline in the intro. Centered on desktop, left-aligned under 600px.
- **Stat Number** (700, clamp 34–46px, 1.05, -0.03em, tabular): the four figures in the stats row.
- **Headline** (700, clamp 26–36px, 1.15, -0.025em): section heads below the fold ("Found something? Leave a tip.", "How it works").
- **Amount** (700, clamp 24–32px, 1.15, -0.02em, tabular): the token amount that leads each result card, followed by the USD value in Ink Muted at clamp 18–23px.
- **Title** (700, clamp 21–27px, 1.25, -0.015em): the summary card sentence.
- **Body** (400, 17px, 1.55; 16px under 600px): prose, card action lines (clamp 16–19px), lede (clamp 16–19px, max 60ch).
- **Body Small** (400, 15px, 1.5): notes, lock line, stat descriptions, card meta.
- **Label** (600, 13px, 0.02em, uppercase, Ink Quiet): sub-headings inside expanded content only ("Contracts involved", "Sources and listing check", chain names in the route list). They are headings in their own right, never a tag placed above another headline.
- **Mono** (14–14.5px): addresses, tx hashes, field names, field values, contract links. The search input is Mono Input (500, clamp 15–20px); its placeholder falls back to sans.

### Named Rules
**The Paste-It-Mono Rule.** Anything a user will paste, compare against a wallet popup, or read character by character (addresses, hashes, raw uint256 values, function and field names) is set in `ui-monospace`. Prose never is.

**The Tabular Numbers Rule.** Amounts, stats, chain counts and step numbers use tabular figures so columns of numbers don't jitter as results stream in.

## Layout

A single centered column capped at 1180px (`wrap`) with a fluid gutter (clamp 16–36px). The intro, search bar, lock line and input error sit in a narrower 1000px measure centered inside it. The stats row spans the full wrap as a four-column grid ruled top and bottom by hairlines with vertical hairlines between cells; it drops to 2×2 at 900px, adding a horizontal hairline between the rows.

Vertical rhythm is loose between acts and tight inside them. Major sections (tip jar, how it works) open with a Hairline top rule, 48px of padding, and clamp 72–128px (`section`) of space above. Inside results: 18px between cards, 22px between address groups, 26px between steps, 12px padding on each field row. Result panels pad 36px horizontally on desktop and 18px under 600px.

Responsive changes: at 900px the stats go 2-up, the tip jar and how-it-works lists stack to one column. At 600px body type steps to 16px, the intro left-aligns, the search icon hides and the Check button shrinks to 46px tall, result cards reverse their top row so the status pill sits above the amount, and field rows stack label over value.

**The One Question Above The Fold Rule.** The first viewport holds only the wordmark and nav, the headline, one-line lede, the search bar, the lock line and the stats row. Explanation lives below the results, never above the search.

## Elevation & Depth

Depth is tonal, not shadowed. Surfaces separate by one lightness step (ground → panel → raised) and a 1px hairline; a result card is flat at rest. Two soft ambient shadows exist, both functional: the search bar sits on a long, low shadow so the one input reads as the page's anchor, and the toast floats on a short shadow because it overlays content.

### Shadow Vocabulary
- **Search lift** (`box-shadow: 0 18px 50px -24px rgba(0, 0, 0, 0.8)`): the search bar only. On focus-within it adds a 4px teal ring at 10% alpha and the border steps to Hairline Strong.
- **Toast float** (`box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7)`): the copy-confirmation toast only.

### Named Rules
**The Hairline Not Shadow Rule.** Panels, cards, chips, disclosures and stat cells get their edge from a 1px Hairline and a one-step tonal lift, never a drop shadow. Only the search bar and the toast cast shadows.

## Shapes

Generously rounded, never sharp. Panels (search, summary, result cards, empty state, tip card) use the large 20px radius, dropping to 16px under 600px. The Check button and the route disclosure use 14px; soft buttons 10px; Copy buttons and focus outlines 8px (focus outlines use 6px corners with a 3px offset). Pills, chain chips and the toast are fully rounded (999px). Step numbers sit in 32px circles (28px on mobile).

Lines carry meaning by style: a solid Hairline separates structure (panel edges, stats cells, field rows, section tops); a dashed Hairline Strong separates the proof from the action inside a result card, and a dashed border marks an empty state ("nothing found" for an address). Both dashed uses come straight from the reference.

## Components

### Buttons
Quiet and physical: one bright button on the whole page, everything else a charcoal chip.
- **Check (primary):** Pale Button fill, Night Ground ink, 600 18px, 52px tall, 30px side padding, 14px radius. Hover lifts to pure white; active nudges down 1px. While busy it shows a 14px ring spinner before the label and drops to 55% opacity. Only the search bar has one.
- **Soft button:** Charcoal Raised fill, Hairline Strong border, Ink text, 600 15px, 10px radius. Hover brightens the border to Ink Quiet. Used for "Copy address" in the tip card.
- **Copy button:** a compact version (500 13px, 4px 10px padding, 8px radius, Ink Muted text) that sits beside every copyable monospace value. After copying it turns teal ink on teal wash with a 50% teal border, and a toast confirms.

### Status pills
- **Style:** fully rounded, 600 16px (14px on mobile), 9px 18px padding, placed top-right of the card on desktop, above the amount on mobile.
- **Tones:** good = "Ready to migrate" (teal ink on teal wash); warn = amber on amber wash; bad = rose on rose wash; pending = "Simulating…" in Ink Quiet on Charcoal Raised with a 12px ring spinner.
- Pill labels are plain verdict words. The Ready pill is the only teal fill a result may carry.

### Chain chips
- **Style:** fully rounded, Charcoal Panel with Hairline border, 14px Ink Muted text, a 7px status dot and a tabular count.
- **State:** scanning/simulating dot pulses teal (1.1s); done dot is Ink Quiet; a chain with finds brightens to Ink; a failed chain turns rose with a 35%-alpha rose border.
- **Collapse:** when a scan completes, every successful chip is replaced by one plain line in Ink Muted ("8 chains checked · found on Ethereum and OP Mainnet"). Failed chains keep their chip so the failure stays visible.

### Cards / Containers
- **Corner Style:** 20px (16px under 600px).
- **Background:** Charcoal Panel on Night Ground.
- **Shadow Strategy:** none (see The Hairline Not Shadow Rule).
- **Border:** 1px Hairline.
- **Internal Padding:** 30px 36px 28px for result cards, 28px 36px for the summary, 22px 18px on mobile.
- **Result card anatomy:** amount + USD, then status pill; meta line (route · chain · holding · migrator link) in Ink Quiet with Ink Muted emphasis; monospace contract line; notes list with 18px line icons (check, warn, info, clock) tinted by level; dashed rule; action line in Ink with the teal "How to migrate on Etherscan →" disclosure and the official app link.
- **Settle motion:** when a pending card resolves into its verdict it plays the one authored animation, 520ms from 35% opacity, 8px down and 6px blur to rest on the `cubic-bezier(0.16, 1, 0.3, 1)` ease.
- **Empty state:** same radius and padding, transparent fill, dashed Hairline Strong border.

### Inputs / Fields
- **Search bar:** a Charcoal Panel pill-ish bar (20px radius, 16px on mobile) holding a magnifier icon, an auto-growing monospace textarea (grows up to 9.5em, then scrolls) and the Check button. Focus is carried by the bar, not the textarea: border to Hairline Strong plus a 4px teal ring at 10% alpha.
- **Error:** rose text centered below the bar (left-aligned on mobile), pre-line so several address errors stack.

### Field rows (step instructions)
A flat ledger inside the expanded steps, never nested cards. Each row is a two-column grid (label column 120–190px, value column fluid) separated by 1px Hairline top rules with a closing bottom rule. Label column: the field name in 14px mono Ink, then its type and position in 12.5px mono Ink Quiet ("address · field 1"). Value column: the exact value in 14px mono Ink, a Copy button at the right, and a 13.5px Ink Quiet hint beneath. Under 600px the row stacks label over value.

### Steps
Numbered in 32px Charcoal Raised circles with a Hairline Strong ring and a tabular 15px Ink Muted numeral; the step heading is 650 17px Ink. Sub-steps are a native ordered list in Ink Muted with Ink Quiet markers and Ink bold for button names ("Write", "Connect to Web3").

### Navigation
The top bar is a wordmark (teal magnifier mark + "Old Token Check" in 650 Ink) and two text links in 15px Ink Muted that brighten to Ink on hover without underline. The "Tip jar" link is hidden until `TIP_ADDRESS` is configured.

### Tip jar
A two-column section (copy left, card right, max 600px) under a Hairline top rule. With an address configured, the card shows a 148px QR on a light plate (12px radius, 10px padding), the "Tip address · any EVM chain" label, the full address in mono on one line (desktop), and a soft "Copy address" button. With `TIP_ADDRESS` empty (the shipped state) the card instead reads "The tip address isn't live yet." with a short follow-up, the "how to send" line is hidden, the nav link is hidden, and the results summary never shows the tip nudge.

### Toast
A fully rounded Pale Button pill fixed 24px from the bottom center, 600 15px Night Ground text, sliding up 16px and fading in; auto-dismisses after 1.8s. Used only for copy confirmation.

## Do's and Don'ts

### Do:
- **Do** reserve Ready Teal for Ready pills, links and actions, the scanning pulse, and focus (The Teal Is A Verdict Rule).
- **Do** separate surfaces with a 1px Hairline and one tonal step; keep result cards flat.
- **Do** set every address, hash, raw value and function or field name in `ui-monospace`, each copyable value with a Copy button beside it.
- **Do** render field instructions as flat hairline rows inside the card.
- **Do** collapse the chain chips to one summary line after a scan and keep only failed chains as chips.
- **Do** show values under one cent as "< $0.01" (no "≈" prefix), and omit the USD figure entirely when a token is unpriced.
- **Do** keep the tip jar's nav link and results nudge hidden until `TIP_ADDRESS` is set; show the "isn't live yet" note instead of any address or QR.
- **Do** use the dashed Hairline Strong rule to separate a result's proof from its action, and a dashed border for empty states.
- **Do** honor `prefers-reduced-motion`: animations and transitions collapse to 1ms.

### Don't:
- **Don't** nest a bordered card inside a result card; steps and fields stay flat.
- **Don't** use teal for headings, panel fills, borders or ornament.
- **Don't** add drop shadows to cards, chips or pills; only the search bar and toast cast shadows.
- **Don't** add a light theme; the system is dark only.
- **Don't** add a second bright button; the pale Check button is the page's only light-filled control besides the toast.
- **Don't** fabricate numbers: no invented USD totals, user counts or recovered-value claims; show "—" until real data loads.
- **Don't** put the explanation above the search bar; "How it works" lives below the results.
