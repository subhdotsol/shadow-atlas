# Brand — Shadow Atlas

_Status: active_

A calm studio sheet. Off-white paper, crisp white cards that float on soft shadows, small product-like illustrations, and monospace annotations in the margins, like a designer's spec. Colour is rare and purposeful: orange for Ember, blue for Tide, green for "done".

## Palette

Tokens live in `src/app/globals.css` (OKLCH). **Studio** (light) is the reference look; **Night studio** (dark) is the same sheet in graphite, under `[data-theme="dark"]`. Players flip a light/dark switch in the header (a key-style knob sliding between a sun and a moon). A first visit follows the OS setting; after that the saved choice wins. An inline script applies it before first paint.

| Token | Studio (light) | Use |
|---|---|---|
| `background` | off-white `#f6f6f6` | page |
| `surface` | white | cards, tiles |
| `surface-2` | light grey | insets, skeleton pills |
| `border` | hairline grey | card and tile outlines |
| `foreground` | near-black | headings, body |
| `muted` | mid grey (AA on background) | descriptions, mono annotations |
| `faint` | pale grey | ruler ticks, step labels, connectors (decorative only) |
| `ember` / `on-ember` | warm orange / white | **Player A** (the "B" key tile in the reference) |
| `tide` / `on-tide` | bright blue / white | **Player B**, the glowing call-to-action |
| `success` | green | confirmations, the check badge |
| `danger`, `devnet` | red, amber | errors, network badge |

## Shape and depth

- Cards: `rounded-3xl`, white, hairline border, layered soft shadow (`shadow-card`).
- Tiles: `rounded-2xl` keys with a subtle bottom edge (`shadow-key`).
- Buttons are tactile: a dark graphite gradient with a top highlight (primary; inverts to pearl in dark mode), a blue gradient with a soft blue glow (Tide/accent), and a surface key with a hairline (secondary).

## Typography

- **Headings and UI:** Geist, semibold, tight tracking (`tracking-tight`).
- **Annotations:** Geist Mono, uppercase in pills ("HOW IT WORKS"); sentence case for step labels ("Step 1").
- **Data:** Geist Mono with `tabular-nums` for strengths, timers and addresses.

## Voice

Terse, commanding, plain. "Seal order", "Waiting for Tide", "Claim the win". No exclamation marks. Explain privacy honestly: say what is hidden and what is visible.
