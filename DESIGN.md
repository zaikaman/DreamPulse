---
name: DreamPulse AI
description: Institutional quantitative trading swarm for Somnia Shannon Testnet & DreamDEX CLOB Event Contracts
colors:
  primary: "#00ffcc"
  secondary: "#7928ca"
  tertiary: "#ffb700"
  success: "#00e676"
  danger: "#ff3366"
  neutral-bg: "#060709"
  neutral-surface: "#0b0d12"
  neutral-card: "#10131a"
  neutral-border: "rgba(255, 255, 255, 0.08)"
  neutral-text: "#ffffff"
  neutral-muted: "#8e94a0"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  button-secondary:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-muted}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: DreamPulse AI

## Overview

**Creative North Star: "The Cyber-Quantitative Cockpit"**

DreamPulse AI embodies an institutional cyber-financial trading terminal engineered for high-frequency prediction markets and autonomous swarm intelligence on Somnia Shannon Testnet. The interface balances extreme data density, sub-second telemetry streams, and surgical visual clarity. High-contrast typography and monospaced tabular data sit over deep obsidian glass panels, delivering immediate scannability across multi-asset order books, probability heatmaps, and AI reasoning streams.

Every visual element communicates real-time mathematical state: pricing anomalies glow in luminous amber, Black-Scholes edge deltas highlight in emerald or crimson, and active execution signals illuminate in quantum cyan. Unnecessary visual noise, generic web3 gradients, and playful emoji decorations are strictly rejected in favor of functional financial engineering craft.

**Key Characteristics:**
- Deep obsidian glassmorphic surfaces with frosted backdrops and subtle 1px border framing.
- Luminous telemetry accents reserved for high-signal alpha, execution state, and protocol attribution.
- Monospace tabular figures across all numerical readouts, timestamps, odds, and order quantities.
- Professional SVG iconography without playful emojis or decorative clutter.

## Colors

The color palette is rooted in an ultra-deep obsidian foundation punctuated by surgical, high-luminance trading accents that communicate real-time market polarity and anomaly edge.

### Primary
- **Luminous Quantum Cyan** (`#00ffcc`): The primary system accent and active telemetry signal. Used for live WebSocket connectivity indicators, primary execution buttons, slider active tracks, and active swarm state.

### Secondary
- **Electric Shannon Violet** (`#7928ca`): Protocol brand accent representing Somnia Shannon Testnet and DreamDEX event contract primitives. Used for protocol badge outlines, smart contract integration tags, and ecosystem metadata.

### Tertiary
- **Amber Drift** (`#ffb700`): Anomaly and momentum signal color representing latency divergences, Volt sniper alerts, and severe pricing discrepancies ($\ge 3\%$ arbitrage edge).

### Success & Danger Signals
- **Emerald Alpha** (`#00e676`): Positive edge deltas, BUY YES outcome shares, net profitable PnL readouts, and completed settlement sweeps.
- **Crimson Vega** (`#ff3366`): Negative edge deltas, BUY NO outcome shares, loss indicators, and critical risk circuit-breaker warnings.

### Neutral
- **Obsidian Core** (`#060709` / `#0b0d12`): Root viewport and workspace canvas background.
- **Deep Void Slate** (`#10131a` / `#181c26`): Glassmorphic panel and card background surface with `backdrop-filter: blur(16px)`.
- **Subtle Glass Border** (`rgba(255, 255, 255, 0.08)`): Standard 1px panel and table row border.
- **Pure Starlight** (`#ffffff` / `#f0f2f5`): High-contrast primary text and headline values.
- **Muted Telemetry Gray** (`#8e94a0`): Secondary labels, table column headers, and inactive metadata.

### Named Rules
**The Rarity Rule.** Luminous cyan and saturated signal colors are applied to $\le 10\%$ of any given viewport. High saturation is reserved exclusively for live market signals and interactive focal points; background surfaces remain strictly deep and subdued.

**The Polarity Invariant Rule.** Emerald (`#00e676`) and Crimson (`#ff3366`) are strictly tied to directional outcome polarity (YES vs NO, Profit vs Loss). They are never repurposed as arbitrary decorative colors.

## Typography

The typographical hierarchy pairs a crisp geometric sans-serif for high-level structure with a dedicated monospace font for all financial telemetry, odds calculations, and order book ladders.

**Display & Body Font:** `-apple-system`, `BlinkMacSystemFont`, `'Segoe UI'`, `Roboto`, `sans-serif`  
**Monospace / Telemetry Font:** `'JetBrains Mono'`, `'Fira Code'`, `ui-monospace`, `monospace`

**Character:** Technical, high-precision, and jitter-free. Standard sans-serif ensures legible labels while monospaced numbers maintain fixed-width column alignment during sub-second tick updates.

### Hierarchy
- **Display** (Bold 700, `clamp(2rem, 5vw, 3.5rem)`, line-height `1.1`): Hero titles and major surface banners.
- **Headline** (SemiBold 600, `1.5rem`, line-height `1.25`): Top-level page view headers and modal titles.
- **Title** (SemiBold 600, `1.125rem` / `0.875rem`, line-height `1.3`): Widget panel titles, market catalog names, and inspector headers.
- **Body** (Regular 400, `0.875rem`, line-height `1.5`): Explanatory copy, AI thought feed reasoning streams, and tooltips.
- **Label / Tabular** (Medium 500 / Bold 700, `0.75rem` / `0.6875rem`, letter-spacing `0.05em`, `tabular-nums`): Order book depth numbers, strike prices, percentage edges, timestamps, gas balances, and transaction hashes.

### Named Rules
**The Tabular Precision Rule.** Every numeric figure representing prices, probabilities, dollar amounts, edges, nonces, or timestamps MUST apply `font-variant-numeric: tabular-nums` (or `font-mono`) to prevent visual jitter as numbers fluctuate in real time.

## Layout

DreamPulse AI employs a modular, high-density dashboard grid designed for multi-tasking quant traders.

- **Global Shell**: Fixed top navigation header (live connectivity, sub-second latency badge, gas balances, wallet/session indicator) with collapsible left sidebar navigation.
- **Spatial Grid**: CSS Grid and Flexbox layouts with standardized 10px (`gap-2.5`) or 16px (`gap-4`) gaps between panels.
- **Dense Single-Screen Mode**: Primary views (Overview, Trade Terminal, Edge Radar) constrain viewport height (`h-full min-h-0 overflow-hidden`) with dedicated internal scrolling for lists and logs, ensuring key charts and tickets remain visible without page-level scrolling.
- **Responsive Adaptations**: Smooth collapse from multi-column grids (1.2fr / 1fr splits) on desktop down to stacked single-column layouts on mobile tablets, preserving full table scrollability via `overflow-x-auto`.

## Elevation & Depth

Depth is established through frosted glassmorphism and subtle tonal layering rather than heavy drop shadows.

- **Flat-at-Rest Tonal Panels**: Panel surfaces use translucent dark slate (`hsl(224 25% 7.5% / 0.72)`) with `backdrop-filter: blur(16px)` and 1px borders (`rgba(255, 255, 255, 0.08)`).
- **Tactile Hover Glows**: Interactive cards and table rows elevate slightly with subtle internal highlight rings (`inset 0 1px 1px 0 rgba(255, 255, 255, 0.06)`) and soft ambient edge luminescence (`0 4px 14px rgba(0, 0, 0, 0.25)`).
- **Active Focus & Modals**: Modals and dropdowns feature deep atmospheric shadows (`0 8px 32px rgba(0, 0, 0, 0.6)`) and subtle glowing cyan borders (`rgba(0, 255, 204, 0.35)`).

### Named Rules
**The Ghost Border Rule.** Panel boundaries are defined by translucent 1px borders rather than heavy contrast outlines or solid drop shadows, creating a lightweight glass cockpit feel.

## Shapes

- **Corner Radii**:
  - Small elements (badges, code chips, buttons): `4px` (`rounded-sm`) or `6px` (`rounded-md`).
  - Container panels & modals: `10px` (`rounded-xl` / `var(--radius)`).
  - Status indicators & pill tags: `9999px` (`rounded-full`).
- **Form Language**: Crisp rectangular panels with softened micro-radii, maintaining a sharp financial tool silhouette while avoiding bubbly or playful curves.

## Components

### Buttons
- **Shape:** Standardized rounded-lg (`6px` / `8px` radius).
- **Primary:** Luminous Quantum Cyan background (`#00ffcc`), obsidian text (`#060709`), bold 600 weight, hover glow and subtle translateY(-1px) active compression.
- **Secondary / Outline:** Deep void background (`rgba(255, 255, 255, 0.04)`), 1px glass border, light gray text (`#c4c2c3`), hover background (`rgba(255, 255, 255, 0.08)`).
- **Ghost:** Transparent background, muted text, hover background (`hsl(var(--muted)/0.5)`).
- **Destructive:** Rose background tint (`rgba(244, 63, 94, 0.15)`), crimson border and text, hover rose background.

### Badges & Status Pills
- **Style:** Compact pill (`rounded-full` or `rounded-md`), monospaced text (`10px` / `11px`), 1px translucent border.
- **Variants:**
  - `BUY YES` / `Success`: Emerald border + background tint (`bg-emerald-500/10 text-emerald-400 border-emerald-500/30`).
  - `BUY NO` / `Danger`: Crimson border + background tint (`bg-rose-500/10 text-rose-400 border-rose-500/30`).
  - `Anomaly`: Amber border + background tint (`bg-amber-500/10 text-amber-300 border-amber-500/30`).
  - `Protocol`: Violet border + background tint (`bg-purple-500/10 text-purple-300 border-purple-500/30`).

### Cards & Panels (`.terminal-panel`, `.glass-panel`)
- **Corner Style:** `10px` radius (`rounded-xl`).
- **Background:** Dark translucent slate (`hsl(var(--card) / 0.72)`), `backdrop-filter: blur(16px)`.
- **Border:** 1px `hsl(var(--border) / 0.65)`.
- **Header:** Integrated header with icon, semi-bold title, badge, and optional right-aligned action button.

### Tables & Data Grids
- **Header:** Sticky uppercase monospace labels (`10px`), muted gray, border-b separator.
- **Row Styling:** 1px subtle border bottom, interactive hover background (`hsl(var(--muted) / 0.3)`), click-to-select state with soft secondary background tint.
- **Cell Alignment:** Left-aligned text labels, right-aligned numerical quantities and inspect buttons.

### Inputs & Sliders
- **Inputs:** Dark recessed background (`hsl(var(--input) / 0.3)`), 1px border, monospace font, focus ring in primary cyan.
- **Sliders:** Recessed track (`bg-secondary`), cyan filled progress, circular thumb with cyan glow.

### Signature Components
- **Edge Radar Heatmap Matrix**: 2D asset-by-horizon grid with dynamic colored cell backgrounds reflecting edge intensity and pulse indicators on active contracts.
- **CLOB Order Book Depth Ladder**: Vertical split bid/ask ladder with animated depth bars expanding horizontally behind monospace price and quantity rows.
- **Live AI Thought Stream**: Chronological card stack with pulse indicator, model provider badge, and expandable reasoning telemetry modal.

## Do's and Don'ts

### Do:
- **Do** format all financial amounts, prices, odds, percentages, and timestamps with `tabular-nums` in a monospace font.
- **Do** reserve high-saturation cyan (`#00ffcc`) for live telemetry, active connection states, and primary user execution actions.
- **Do** use `@heroicons/react` SVG icons exclusively for all UI iconography.
- **Do** maintain clean 1px border separation between adjacent glassmorphic panels.
- **Do** use instant procedural audio cues for trade fills and settlement sweeps.

### Don't:
- **Don't** use raw emojis in any button, label, table cell, or notification banner.
- **Don't** use bright colored background fills on full panels; keep all panel backgrounds dark obsidian.
- **Don't** allow layout shifts when real-time numerical values update; enforce fixed column widths and tabular numbers.
- **Don't** mix directional colors: never use green for negative delta or red for positive delta.
- **Don't** use slow, floaty animations on trade execution buttons; keep interactive transitions snappy ($\le 150\text{ms}$).
