# Stylus: turn any webpage into a design canvas

A Chromium (MV3) extension for editing live pages the way you'd edit a Figma frame: select elements, hide distractions, rewrite text, restyle anything, and apply comfort themes. Edits are saved per site and re-applied on every visit.

## Develop

```sh
pnpm install
pnpm dev        # opens Chrome with the extension loaded + HMR
pnpm build      # → packages/extension/.output/chrome-mv3 (load unpacked via chrome://extensions)
pnpm test       # unit tests (op model, CSS compiler, history)
pnpm e2e        # builds, then runs the Playwright suite against the real extension
```

### End-to-end tests

`packages/extension/e2e` loads the built extension into Chromium with a fresh profile per test and drives it like a user would. Fixture pages cover a normal page, a SPA that re-renders, and a hostile page (max z-index overlay, `!important` resets). The suite covers edit mode, selection and keyboard navigation, tools, Layers, every Design control, scopes (`:hover`, breakpoints), theme presets, focus mode, the Changes panel, undo/redo, persistence and no-flash loading, per-site isolation, cross-tab sync, and SPA resilience.

```sh
npx playwright install chromium            # once; or point CHROME=/path/to/chrome at any Chromium
pnpm e2e                                   # headless run, HTML report in packages/extension/e2e/report
pnpm --filter @stylus/extension e2e:ui     # Playwright UI mode for debugging
```

## Use

Click the toolbar icon or press **Alt+Shift+S** to toggle edit mode.

| Key | Action |
| --- | --- |
| V / H / T | Select / Zap (click to hide) / Edit text tools |
| Click, Shift-click | Select, multi-select |
| Double-click | Edit text inline (Enter saves, Esc cancels) |
| Esc / Enter / Tab | Parent / first child / next sibling |
| S | Select all similar elements |
| Delete | Hide selection |
| ⌘Z / ⌘⇧Z | Undo / redo |
| L / D | Toggle Layers / Design panels |

Panels: **Layers** (DOM tree, search, show/hide), **Design** (layout, size, box model, typography, fill, border, effects, raw CSS per element and per site), **Theme & comfort** (dark/dim/sepia/night/mono/contrast/reading presets, page colors, font, zoom, focus mode), and **Changes** (every edit, which you can toggle, delete, export, or import). The bottom bar holds breadcrumbs, quick actions, and the state (`:hover`…) and breakpoint scope that new style edits apply to.

## Layout

```
packages/shared      op model (zod), op → CSS compiler, edit helpers, undo history
packages/extension   WXT app
  entrypoints/background.ts        toolbar action, shortcut, badge
  entrypoints/content/engine       storage + state (signals), style engine (document_start)
  entrypoints/content/canvas       overlay, picker/keyboard, toolbar, bottom bar, actions
  entrypoints/content/panels       Layers, Design, Theme, Changes + shared controls
```

Every change is a declarative `EditOp` (`style`, `hide`, `text`, `rawCss`, `preset`). CSS-type ops compile into a single `<style>` element. Text ops are re-applied via a MutationObserver, so they survive SPA re-renders. The same op list will be the interface for the AI/MCP bridge.
