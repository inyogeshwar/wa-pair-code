---
version: alpha
name: WA Pair Code
description: "A near-black developer-tool surface built for a single job: linking a WhatsApp device. The canvas is #08090A, content sits on charcoal panels (#101214) separated by 1px translucent hairlines, and one emerald accent (#2EE59D) carries every interaction — never decoration. Type is neutral sans for prose and a wide-tracked monospace for the pairing code, which is the only element allowed to be loud. Depth comes from layered surfaces and a single inset highlight, not from heavy shadows."

colors:
  canvas: "#08090A"
  canvas-raised: "#0B0D0F"
  surface-1: "#101214"
  surface-2: "#15181B"
  surface-3: "#1B1F23"
  hairline: "rgba(255,255,255,0.07)"
  hairline-strong: "rgba(255,255,255,0.13)"
  ink: "#F4F6F7"
  ink-muted: "#A6AEB6"
  ink-subtle: "#6F7880"
  ink-disabled: "#4A5158"
  accent: "#2EE59D"
  accent-hover: "#4DF0B0"
  accent-pressed: "#1FCB8A"
  on-accent: "#04140D"
  accent-soft: "rgba(46,229,157,0.12)"
  accent-ring: "rgba(46,229,157,0.18)"
  danger: "#FF7A7A"
  danger-soft: "rgba(255,122,122,0.12)"
  warning: "#F5B84D"
  info: "#7AB8FF"
  overlay: "rgba(0,0,0,0.62)"

typography:
  display:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -1.6px
  headline:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.6px
  title:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.2px
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: -0.1px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.06em
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.1px
  code:
    fontFamily: JetBrains Mono
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 5px
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 14px
  xl: 18px
  xxl: 24px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 88px

components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 48px
    padding: 0 20px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
  button-primary-pressed:
    backgroundColor: "{colors.accent-pressed}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 0 18px
  input:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 48px
    padding: 0 14px
  input-focus:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  tab-active:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: 36px
  tab-idle:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: 36px
  code-panel:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: 22px
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 24px
  badge-success:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
---

## Overview

**Instrument panel, not landing page.** The page has exactly one job and the
visual hierarchy says so: a short claim on the left, a working instrument on the
right. Everything is matte and quiet except the pairing code, which is the only
element allowed to raise its voice. The mood is closer to a terminal multiplexer
than to a marketing site — precise, dark, and unimpressed with itself.

The reference points are developer tools that treat restraint as a feature:
Linear's near-black canvas and hairline borders, Resend's atmospheric glows and
monospace details. Nothing is glossy, nothing is rounded for cuteness, and no
gradient is used to fill space.

## Colors

The palette is one accent on a ladder of near-blacks.

- **Accent (#2EE59D):** emerald "signal" green. Reserved for the primary action,
  the live status dot, focus rings, and success state. If it appears twice in the
  same viewport for decoration, that is a bug.
- **Canvas (#08090A):** the page. Slightly blue-shifted black, never pure #000.
- **Surface ladder (#101214 → #15181B → #1B1F23):** each step is roughly 4-6
  lightness points apart. Use the ladder — not shadows — to create depth.
- **Hairlines (white at 7% / 13%):** all borders. Never a solid gray line.
- **Danger (#FF7A7A):** validation and failed sessions only. Never for emphasis.

Text contrast: `ink` on `surface-1` is 15.9:1; `ink-subtle` is 4.8:1 and is only
used at 13px or above for secondary metadata.

## Typography

Inter for everything human, JetBrains Mono for everything machine.

- Headlines use tight negative tracking (-0.03em at display sizes) to read as
  engineered rather than friendly.
- The pairing code is the one display moment: 34px mono, 5px letter-spacing,
  grouped 4-4. It must be readable from an arm's length away.
- Labels are 12px, uppercase, 0.06em tracking, and always paired with a control.
- Never center-align prose longer than one line. The card is the only centered
  region, and only for its header.

## Layout

A 12-column shell capped at 1080px.

- **≥ 980px:** two columns. Left 46% is the claim and feature list; right 420px
  is the instrument card. Both are vertically centered in the viewport.
- **< 980px:** one column. The hero collapses to an eyebrow, one headline line,
  and the card. Feature list is hidden — it is supporting material, not the job.
- Rhythm is 24px inside the card, 32px between card sections, 88px page padding
  on desktop. Nothing sits closer than 8px.

## Elevation & Depth

Three devices, in order of preference:

1. **Surface steps** — the card is `surface-1` on `canvas`; inputs are
   `canvas-raised`, i.e. *darker* than the card. This inverted nesting is what
   makes the form fields read as recessed rather than floating.
2. **Hairline borders** — 1px white at 7%. Every panel edge is defined by a
   border, never by a shadow alone.
3. **One ambient shadow** — the card gets `0 40px 80px -32px rgba(0,0,0,.85)`
   plus a 1px inset top highlight (`rgba(255,255,255,.05)`) that simulates a
   light source above the page.

Background is a fixed layer with two very low-opacity radial washes (emerald at
5%, blue at 4%) and a 64px grid at 2.5% opacity, masked to fade out below the
fold. It must never compete with the card.

## Shapes

- Cards: 18px. Panels inside cards: 14px. Inputs and buttons: 10px.
- Pills only for status badges and the segmented control thumb.
- The code panel is 14px with a 1px hairline and an inner top highlight — it
  should feel like a physical readout.
- No shape is fully round except avatars and status dots.

## Components

**Segmented control.** Two tabs on a `canvas-raised` track with a 36px thumb that
slides between them (`transform: translateX`, 180ms `cubic-bezier(.22,1,.36,1)`).
The thumb is `surface-3` with a hairline; the active label turns `ink`, the idle
one `ink-subtle`.

**Primary button.** Full-width, 48px, emerald fill, `on-accent` text, 600 weight.
Hover lightens to `accent-hover`; press darkens to `accent-pressed` and translates
1px down. Disabled drops to 45% opacity and `cursor: progress` while a request is
in flight.

**Code readout.** `canvas-raised` panel, centered mono code, copy icon pinned to
the right. A 3px progress rail sits beneath it and drains over the session TTL
(`width` transition at 1s linear) turning `danger` in the last 30 seconds.

**Steps list.** Three rows, 20px numbered circles with `mono-sm` numerals,
hairline borders. Only the current step's number turns accent.

**Status line.** A 6px dot plus 13px text. Accent dot pulses at 2s while the
session is awaiting; danger dot is static on failure. Text never changes layout
height between states — the line reserves its row.

**Success panel.** Accent-soft background, hairline accent border, check glyph,
download button, ghost "Start over". Replaces the code readout entirely; the two
never coexist.

**Toasts.** Bottom-center, `surface-3`, hairline, 13px text, 2.4s auto-dismiss,
slide-up 200ms. Used for copy confirmation only.

## Do's and Don'ts

**Do**

- Keep the accent to one job per viewport.
- Use hairlines and surface steps before reaching for a shadow.
- Let the code be the loudest object on screen.
- Reserve layout height for status text so nothing jumps between states.
- Respect `prefers-reduced-motion`: no transforms, only opacity.

**Don't**

- Don't add a second accent color, gradient button, or neon glow.
- Don't put the emerald on body text, links, or decorative icons.
- Don't use pure black (#000) or pure white (#FFF) as a surface.
- Don't center multi-line body copy.
- Don't animate anything that is not a state change.
