

## Plan: Update Main Content Gradient to Space-Nebula Colors

The nebula image has deep blues, teals/cyans, and subtle purple tones. The current `.main-content-gradient` uses gold/beige tones which don't match.

### Changes

**1. `src/index.css` — Update `.main-content-gradient`**

Replace the gold gradient with a space-inspired gradient using colors extracted from the nebula image:
- Deep navy blue → teal/cyan → soft blue-purple → dark blue

```css
.main-content-gradient {
  background: linear-gradient(
    160deg,
    hsl(220, 45%, 15%) 0%,
    hsl(200, 50%, 22%) 30%,
    hsl(190, 45%, 28%) 55%,
    hsl(210, 40%, 20%) 80%,
    hsl(230, 35%, 16%) 100%
  );
}
```

**2. `src/index.css` — Remove the image background from `body`**

Replace `background: url('/images/space-bg.jpg') ...` with just a solid dark fallback color, since the gradient on `.main-content-gradient` will be the actual visible background.

**3. Ensure text readability**

Since the background is now dark, the `text-card-foreground` class used on the main content areas may need adjustment. Will verify the card-foreground color is light enough, or switch to `text-foreground` or a light color where needed.

### Files to edit
- `src/index.css` (gradient + body background)
- Potentially `src/pages/MentorDashboard.tsx` and `src/pages/StudentDashboard.tsx` if text color classes need updating

