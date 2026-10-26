---
kind: frontend_style
name: Tailwind CSS v4 + Recharts Theme System for SIMO Frontend
category: frontend_style
scope:
    - '**'
source_files:
    - simoapp/app/globals.css
    - simoapp/postcss.config.mjs
    - simoapp/package.json
    - simoapp/app/layout.tsx
    - simoapp/components/ui/Button.tsx
    - simoapp/components/dashboard/useTemaOscuro.ts
---

## Approach

The SIMO frontend (`simoapp/`) is styled with **Tailwind CSS v4** (plugin-based PostCSS pipeline via `@tailwindcss/postcss`) and a small set of hand-built React components under `components/ui/`. There is no design-system library (no shadcn, Radix, MUI, etc.) — the UI primitives are authored in-house as TypeScript React components that compose Tailwind utility classes. Charts use **Recharts**, which receives theme values programmatically rather than through CSS.

## Key Files

- `simoapp/app/globals.css` — single global stylesheet: imports Tailwind, declares CSS custom properties for background/foreground, exposes them to Tailwind via `@theme inline`, and defines an 80mm thermal-printer print stylesheet for POS tickets.
- `simoapp/postcss.config.mjs` — PostCSS config registering only `@tailwindcss/postcss`; no other plugins.
- `simoapp/package.json` — pins `tailwindcss ^4` and `@tailwindcss/postcss ^4` as devDependencies; no Sass/Less/Stylus dependencies.
- `simoapp/app/layout.tsx` — loads Google Fonts **Geist Sans** and **Geist Mono**, exposing them as CSS variables `--font-geist-sans` / `--font-geist-mono` consumed by the Tailwind `@theme` block.
- `simoapp/components/ui/Button.tsx` — representative of the component library: three variants (`primary`, `secondary`, `danger`) mapped to Tailwind color/utility strings, with explicit `dark:` variants for each variant.
- `simoapp/components/dashboard/useTemaOscuro.ts` — hook using `useSyncExternalStore` over `window.matchMedia("(prefers-color-scheme: dark)")` so Recharts SVG elements can be colored according to the OS dark-mode preference.
- `simoapp/components/ui/*.tsx` — the full primitive set: `Badge`, `Campo`, `DataTable`, `InputNumber`, `InputText`, `Modal`, `Select`, `Skeleton`, `Spinner`.

## Architecture & Conventions

1. **CSS-in-JS is avoided.** All styling lives in Tailwind utilities plus the single `globals.css`. Components receive a `className` prop that is concatenated onto their base class string.
2. **Design tokens are CSS custom properties.** `globals.css` defines `--background` / `--foreground` on `:root` and re-exports them into Tailwind's token namespace via `@theme inline { --color-background, --color-foreground }`. Font families follow the same pattern with `--font-geist-sans` / `--font-geist-mono`.
3. **Dark mode is system-driven only.** The stylesheet uses `@media (prefers-color-scheme: dark)` to swap root colors. Component-level `dark:` variants (e.g. in `Button.tsx`) provide per-component overrides. There is no user-facing toggle for light/dark in the codebase examined.
4. **Component library under `components/ui/`.** Each primitive is a single-file React component exporting a default function component. Variants are expressed as a `Record<Variante, string>` mapping (see `Button.tsx`), not as separate files or CSS classes.
5. **Print stylesheet for POS tickets.** `globals.css` contains a dedicated `@media print` block targeting `@page { size: 80mm auto }`, hiding navigation/dialog chrome, and constraining `.ticket-termico` to 76mm width for thermal printers. This is the only non-Tailwind CSS rule in the file.
6. **Charts bypass CSS classes.** `useTemaOscuro.ts` exists specifically because Recharts renders SVG attributes (fill/stroke) that Tailwind classes cannot style; the hook supplies a boolean to chart components so they pick contrasting axis/grid colors.
7. **Font loading via Next.js font loader.** Geist fonts are loaded with `next/font/google` and exposed as CSS variables consumed by Tailwind's `--font-*` tokens.

## Conventions & Constraints

- **Tailwind v4 syntax**: styles are imported with `@import "tailwindcss"` in `globals.css` and configured through `@tailwindcss/postcss` (not the legacy `tailwind.config.*`).
- **No SCSS/Sass/Less**: the dependency graph has no preprocessor; all styling is plain CSS + Tailwind utilities.
- **No external UI kit**: there is no import of shadcn, Radix, Material, Ant Design, or similar — every button, input, modal, badge, table, spinner, skeleton, and select is implemented in `components/ui/`.
- **Variant map pattern**: new UI primitives should define a `Record` mapping variant names to Tailwind class strings (as demonstrated by `Button.tsx`'s `clasesVariante`), keeping variant logic co-located with the component.
- **Dark-mode classes**: any component that changes appearance in dark mode must add `dark:` prefixed utilities alongside its light-mode classes (observed in `Button.tsx`).
- **POS ticket print rules**: anything printed as a thermal ticket must live inside an element with class `ticket-termico` and respect the 76mm width constraints defined in `globals.css`'s `@media print` block.
- **Theme-aware charts**: when adding new Recharts visualizations, read the current dark-mode state via `useTemaOscuro()` rather than relying on CSS variables, since Recharts draws SVG attributes directly.