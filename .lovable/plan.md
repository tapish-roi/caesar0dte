

## Plan: Make All Popup/Card Panels Fully Opaque

### Problem
The CSS variables `--card` and `--popover` have alpha transparency (`0.55` and `0.8` respectively), which makes all cards, popovers, dialogs using `bg-card` or `bg-popover` semi-transparent. This affects question panels and any other popup-like UI.

### Solution
Update the CSS variables in `src/index.css` to be fully opaque (no alpha channel), keeping the same dark blue-teal hue.

### Changes

**`src/index.css`** — Update `:root` and `.dark` variables:

- `--card: 200 40% 12% / 0.55` → `--card: 200 40% 12%` (remove alpha)
- `--popover: 200 40% 14% / 0.8` → `--popover: 200 40% 14%` (remove alpha)
- Same changes in the `.dark` block

This single file change will fix **all** cards, popovers, dialogs, and sheet panels across the entire app — no need to touch individual components.

### Files to edit
- `src/index.css` (4 lines — 2 in `:root`, 2 in `.dark`)

