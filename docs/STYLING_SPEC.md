# Salon Appearance / Theming — Implementation Spec

Let each salon customize its look — brand colors, logo, and font — applied to the
public booking site, transactional emails, and the admin panel.

## Decisions (locked)

| Decision | Choice | Implication |
| --- | --- | --- |
| Control level | **Guided controls** | Color pickers + logo upload + font from a curated list. Bounded, on-brand, accessible — no arbitrary CSS. |
| What's themeable | **Brand colors, logo, fonts** | No per-salon marketing-copy editing in this spec (hero/about stays platform copy for now). |
| Surfaces | **Public site + emails + admin panel** | Public is primary; emails need inline styling; admin panel themed too (see open decision on how far). |
| Asset storage | **Vercel Blob** | Logo uploads stored in Blob; `BLOB_READ_WRITE_TOKEN` + `next.config` remote image pattern. |

## Dependency

Builds on [MULTI_TENANT_SPEC.md](MULTI_TENANT_SPEC.md): theme data lives on the
per-salon `Salon` record and is resolved from the tenant context (host for
public, session for admin). Without multi-tenant, this collapses to theming the
single salon — but author the theme fields salon-scoped from the start.

The multi-tenant spec already added `themeColor` and made the root layout render
per-host (dynamic). This spec expands `themeColor` into a small theme and wires
it through the styling system.

## ⚠️ Open decisions — confirm before implementing

Resolve each with the project owner before writing code for the affected phase —
do not silently pick a default.

- [ ] **How many admin-controllable colors** (§1): one brand color with shades
  auto-derived via `color-mix` (recommended — simplest, hardest to make ugly) vs
  primary + accent + background, each editable.
- [ ] **Font loading strategy** (§4): bundle the curated font set via
  `next/font` and switch by CSS variable (recommended — no FOUT, no external
  request) vs load the chosen font from Google Fonts at runtime per salon.
- [ ] **SVG logo policy** (§5): disallow SVG uploads (recommended — SVGs can
  carry scripts/XSS) vs accept + sanitize server-side.
- [ ] **Apply vs draft/publish** (§6): changes apply instantly on save
  (recommended v1) vs a draft → live-preview → publish workflow.
- [ ] **How far to theme the admin panel** (§7): full admin theming vs only the
  accent/brand color on admin (recommended — far less visual-regression QA than
  re-skinning every admin screen).
- [ ] **Date/time-picker icon** (§3.3): leave it a fixed neutral color
  (un-themed, recommended) vs convert the `filter` hack to a brand-colored masked
  icon.

---

## 1. Data model (`prisma/schema.prisma`)

Add theme fields to `Salon` (a small bounded set — keep it on `Salon` rather than
a separate table unless draft/publish is chosen, §6):

```prisma
model Salon {
  // ... existing multi-tenant fields, incl. themeColor ...

  /// Primary brand color (hex, validated). Drives buttons, links, accents.
  /// Replaces the existing `themeColor`/default pink. Shades derived in CSS.
  brandColor   String  @default("#db2777") // current pink-600
  /// Optional secondary/accent (only if the "primary + accent" option is taken).
  accentColor  String?
  /// Curated font key, e.g. "geist" | "playfair" | "poppins". Maps to a bundled font.
  fontKey      String  @default("geist")
  /// Vercel Blob URL of the uploaded logo; null → render the salon name as text.
  logoUrl      String?
  /// Natural logo aspect handling / alt is salon.name.
}
```

Validation: `brandColor`/`accentColor` must match a strict hex pattern
(`^#[0-9a-fA-F]{6}$`) on write — this is the **injection guard** for the inline
`<style>` in §2. `fontKey` must be one of the curated allow-list.

The current pink (`#db2777` brand, `#fdf2f8` background tint) becomes the
**platform default** so an uncustomized salon looks exactly like today.

---

## 2. Theming mechanism: semantic CSS variables + runtime injection

Tailwind v4 here is **CSS-config** (`@import "tailwindcss"` + `@theme inline` in
`globals.css`; there is no `tailwind.config.js`). Tailwind compiles utilities at
build time, so per-salon colors **cannot** be Tailwind color values — they must
be **CSS custom properties** resolved at request time.

### 2.1 Define semantic tokens (`globals.css`)

Replace the two-variable `:root` with a semantic palette, and derive shades from
the single brand color with `color-mix` so admins pick one color, not a ramp:

```css
:root {
  --color-brand: #db2777;                                            /* admin-set */
  --color-brand-hover: color-mix(in oklab, var(--color-brand), black 12%);
  --color-brand-soft: color-mix(in oklab, var(--color-brand), white 88%);  /* pink-50-ish */
  --color-brand-contrast: #ffffff;   /* text on brand; auto-chosen by luminance, §6 */
  --color-accent: var(--color-brand);                                /* or admin-set */
  --background: #fdf2f8;
  --foreground: #1f2937;
  --font-heading: var(--font-geist-sans);
  --font-body: var(--font-geist-sans);
}

@theme inline {
  --color-brand: var(--color-brand);
  --color-brand-hover: var(--color-brand-hover);
  --color-brand-soft: var(--color-brand-soft);
  --color-brand-contrast: var(--color-brand-contrast);
  --color-accent: var(--color-accent);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-body);
}
```

This makes Tailwind emit `bg-brand`, `text-brand`, `bg-brand-soft`, `ring-brand`,
`text-brand-contrast`, etc.

### 2.2 Inject the salon's palette at request time

The root layout is a server component and already renders per host (multi-tenant
§4.5). Resolve the salon and emit an inline `<style>` in `<head>` **before
paint** to avoid a flash of the default theme (FOUC):

```tsx
// in RootLayout, after resolving `salon`
<style dangerouslySetInnerHTML={{ __html:
  `:root{--color-brand:${salon.brandColor};` +
  (salon.accentColor ? `--color-accent:${salon.accentColor};` : ``) +
  `--font-heading:var(--font-${salon.fontKey});--font-body:var(--font-${salon.fontKey});}`
}} />
```

Because the values are strict-hex/allow-list validated on write (§1), this inline
style is safe. Still, if a Content-Security-Policy with `style-src` is in place,
either add a nonce to this tag or allow `'unsafe-inline'` for styles (document
the choice). The `themeColor` in `viewport`/`generateViewport` must likewise
become per-salon.

---

## 3. The de-hardcoding refactor (the bulk of the work)

Pink is hardcoded in **~85 utility-class occurrences across ~20 files** plus
**~20 raw hex values in `globals.css`**. All must become semantic tokens, or
theming silently won't apply.

### 3.1 Utility-class migration

Map and replace across all `src/**/*.tsx`:

| Current | → token |
| --- | --- |
| `bg-pink-600`, `bg-pink-700` | `bg-brand`, `bg-brand-hover` |
| `text-pink-600/700`, `text-pink-700` | `text-brand` |
| `bg-pink-50`, `bg-pink-100` | `bg-brand-soft` |
| `border-pink-200/300` | `border-brand` / `border-brand-soft` |
| `ring-pink-300`, `focus:ring-pink-300` | `ring-brand` |
| white text on pink buttons | `text-brand-contrast` |

Do this as a reviewed find-and-replace (the mapping isn't 1:1 for every shade —
eyeball each). Known files: `layout.tsx`, `page.tsx`, `BookingForm.tsx`,
`SignInForm.tsx`, `AdminNav.tsx`, `AdminToaster.tsx`, the `Pretty*` form
components, `admin/*` pages, error/not-found pages. Neutral grays
(`neutral-*`/`gray-*`) stay as-is — only brand colors are themed.

### 3.2 `globals.css` raw hex → variables

- Form-control borders/gradients/focus rings (the `select`/`input` block):
  replace `#f9a8d4`, `#db2777`, `#be185d`, `rgba(190,24,93,…)` with
  `var(--color-brand)` / `var(--color-brand-soft)` / `color-mix` derivations.
- `.rdp-root` accent (`--rdp-accent-color`, `--rdp-accent-background-color`) →
  `var(--color-brand)` / `var(--color-brand-soft)`.
- `.prose a` link color `#be185d` → `var(--color-brand)`.
- `select option:checked`, datetime-edit focus highlight → brand vars.

### 3.3 The two genuinely hard spots

- **Chevron SVG data-URI** (`stroke='%23db2777'` inside `url("data:image/svg+xml…")`):
  CSS variables cannot be interpolated into a `url()` data-URI. Convert the
  chevron to a **`mask-image`** (the SVG with no color) plus
  `background-color: var(--color-brand)` so the icon takes the brand color via
  background. Rework the `select` background layering accordingly.
- **Date/time picker indicator** uses `filter: invert() … hue-rotate()` to recolor
  the native black icon to pink — this **cannot** be driven by an arbitrary hex
  (hue-rotate math is color-specific). Options: leave it a fixed neutral color
  (un-themed — recommended), or replace the native indicator with a custom
  masked brand icon like the chevron. This is the one place theming legitimately
  can't reach cleanly. (See open decision.)

---

## 4. Fonts (curated, guided)

- Maintain a curated allow-list (e.g. Geist, Playfair Display, Poppins,
  Inter) — each loaded via `next/font/google` with its own CSS variable
  (`--font-geist-sans`, `--font-playfair`, …) in the root layout.
- The salon's `fontKey` just points `--font-heading`/`--font-body` at the chosen
  bundled font (§2.2). No external runtime request, no FOUT.
- Trade-off: every curated font ships in the bundle/preconnect. Keep the list
  small (~4–6). (Open decision: this vs a runtime Google Fonts `<link>` per
  salon, which avoids bundling all but adds a request + flash.)
- Apply `--font-heading` to headings, `--font-body` to body in `globals.css`.

---

## 5. Logo upload (Vercel Blob)

### 5.1 Upload flow

- Admin appearance page → file input → `POST /api/admin/appearance/logo`
  (salon-scoped, `requireAdminSalon`).
- Server validates **before** storing: MIME in {png, jpeg, webp}, max size
  (~1 MB), max dimensions; reject otherwise. **SVG: disallow by default** — SVG
  can embed `<script>` (stored XSS if ever rendered inline). (Open decision.)
- Store to Vercel Blob (`@vercel/blob` `put(...)`, `access: 'public'`), save the
  returned URL to `Salon.logoUrl`.
- On replace, delete the previous blob (`del(oldUrl)`) to avoid orphan growth.
- `next.config` `images.remotePatterns` must allow the Blob hostname so
  `next/image` can optimize it. Add `BLOB_READ_WRITE_TOKEN` to env (§8).

### 5.2 Rendering

- Header (`layout.tsx`): if `logoUrl`, render `<Image>` with `alt={salon.name}`;
  else fall back to the salon name as text (current behavior). Constrain height,
  keep the link to `/`.
- Provide sensible max height so oversized logos don't break the 56px header.

---

## 6. Admin appearance UI + guardrails

New admin page (`/admin/appearance`, or a tab under settings), salon-scoped:

- **Brand color** picker (and accent, if that option is taken).
- **Font** dropdown (curated list, with a live sample).
- **Logo** uploader with preview + remove.
- **Live preview**: a representative preview pane (a faux booking card + button +
  link) that updates as the admin changes values, by setting the CSS vars on the
  preview container. (Open decision: instant-apply vs draft/publish — if
  draft/publish, store `themeDraft` separately and only copy to live on publish.)
- **Accessibility guardrail (important for "guided")**: compute the contrast of
  white text on the chosen brand color; if it fails WCAG AA for button text,
  auto-set `--color-brand-contrast` to black (or warn). Compute via relative
  luminance; store the chosen contrast color or derive it in CSS. This is what
  keeps "guided" from producing unreadable buttons.
- Persist via a salon-scoped settings route with strict validation (§1).

---

## 7. Surfaces

### 7.1 Public booking site
Primary target — covered by §2–§5 (tokens + injection + logo + font).

### 7.2 Transactional emails (`src/lib/integrations/notifications.ts`)
Emails **cannot use CSS variables or external stylesheets** — clients strip
them. So:
- Pass `salon.brandColor` and `salon.logoUrl` into the email template and
  **inline** them (e.g. button `style="background:${brandColor}"`, logo
  `<img src="${absoluteLogoUrl}">`). The Blob URL is already a public absolute
  https URL — good for email.
- Mind email-client constraints: inline styles only, table layout, a readable
  fallback if the brand color is very light (use the §6 contrast logic for button
  text), and `alt` text on the logo. Keep a text fallback for no-logo salons.

### 7.3 Admin panel
The admin uses the same token system, so theming flows through automatically once
§3 is done. **Open decision (§ open list):** apply the full brand palette to
admin, or restrict admin to just the accent to minimize visual-regression QA
across every admin screen.

### 7.4 Mobile app — out of scope
Not selected. The Expo app keeps its native styling; revisit later if needed.

---

## 8. Config / env

- Add `BLOB_READ_WRITE_TOKEN` (Vercel Blob) to `src/lib/env.ts` — required in
  prod **if** logo upload is enabled; follow the existing optional-in-dev /
  required-in-prod pattern.
- `next.config`: add the Vercel Blob hostname to `images.remotePatterns`.
- Platform default theme constants (current pink + Geist) live in code as the
  fallback when a salon hasn't customized — and double as the seed values in §1.

---

## 9. Caching / SSR notes

- Theme injection happens in the per-host dynamic layout (multi-tenant §4.5);
  ensure the salon's theme is part of the cached salon record and that the cache
  key includes `salonId`. A stale theme cache shows the wrong colors.
- Inline the theme `<style>` in SSR output (not client-applied) to avoid FOUC.
- `next/image` for logos respects the CDN; the Blob URL is immutable per upload
  (new URL on replace), so it caches well.

---

## 10. Testing

- **Visual baseline**: after §3, the default (uncustomized) salon must render
  pixel-identical to today — the tokenization is a no-op for the default palette.
  Snapshot/visual-regression the key pages before/after.
- **Theming applies**: a salon with a custom brand color recolors buttons, links,
  form focus rings, calendar accent, and the chevron — across public + admin.
- **Contrast guardrail**: a light brand color flips button text to dark / warns.
- **Color injection**: a malicious `brandColor` (e.g. `red;}</style><script>`) is
  rejected by the hex validator and never reaches the inline `<style>`.
- **Logo upload**: type/size/dimension validation; SVG rejected; replace deletes
  the old blob; oversized logo constrained in header; fallback to name when none.
- **Email branding**: confirmation email renders with brand color + logo and
  degrades gracefully (no-logo salon, very light color).
- **FOUC**: no flash of default theme before the salon theme paints.
- **Cross-tenant**: salon A's theme/logo never leaks onto salon B (cache keys).

---

## 11. Suggested rollout phases

1. **Tokenize** — introduce semantic CSS vars + `@theme` mapping, migrate all
   hardcoded `pink-*` utilities and `globals.css` hex to tokens, default palette
   = current pink. **Pixel-identical**, no behavior change. Big mechanical phase,
   safely shippable alone.
2. **Theme data + injection** — add `Salon` theme fields, inject per-salon CSS
   vars in the layout (values still default). Verify FOUC-free SSR.
3. **Appearance UI (colors + font)** — admin page with pickers, curated fonts,
   contrast guardrail, live preview.
4. **Logo upload** — Vercel Blob integration + header rendering + validation.
5. **Email branding** — inline brand color + logo into transactional emails.
6. **Hardening** — visual regression, a11y, admin-panel theming scope, cleanup.

Phase 1 is the high-effort, low-risk foundation and is worth doing even before the
admin UI exists.

---

## Appendix — highest-risk items (verify these first)

- **Color injection** — any admin-set color reaching the inline `<style>` must be
  strict-hex validated server-side; this is the one real security hole in
  "guided" theming.
- **Incomplete de-hardcoding** — a missed `pink-*` class or `globals.css` hex
  silently won't theme; the §3 audit must be exhaustive (grep for `pink-`,
  `#db2777`, `#be185d`, `#f9a8d4`, `#fce7f3`, `#fdf2f8`, `rgba(190,24,93`).
- **FOUC** — theme must be inlined in SSR `<head>`, not applied after hydration.
- **SVG logo XSS** — disallow or sanitize; never render uploaded SVG inline.
- **Contrast** — without the luminance guardrail, admins will pick colors that
  make white-on-brand buttons unreadable.
- **Chevron/date-icon** — the data-URI SVG and `hue-rotate` filter need the
  mask-image rework (§3.3); easy to forget and they'll stay stuck pink.
- **Email CSS** — variables don't work in email; brand must be inlined.
