<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/graph.svg?title=Stylus&subtitle=Turn+any+webpage+into+a+design+canvas&logoColor=ff4d94&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMiA3YTUgNSAwIDAgMSA1LTVoMTBhNSA1IDAgMCAxIDUgNXYxMGE1IDUgMCAwIDEtNSA1SDdhNSA1IDAgMCAxLTUtNXpNNCA5LjZINy4yVjExLjRhMS4zIDEuMyAwIDAgMCAyLjYgMFY5LjZIMTQuMlYxMy42YTEuMyAxLjMgMCAwIDAgMi42IDBWOS42SDIwVjE3YTMgMyAwIDAgMS0zIDNIN2EzIDMgMCAwIDEtMy0zek02LjYgNS4zaDIuOGEuNy43IDAgMCAxIDAgMS40SDYuNmEuNy43IDAgMCAxIDAtMS40eiIvPjwvc3ZnPgo%3D&align=left&mode=dark" />
    <img alt="Stylus. Turn any webpage into a design canvas." src="https://shieldcn.dev/header/graph.svg?title=Stylus&subtitle=Turn+any+webpage+into+a+design+canvas&logoColor=ff4d94&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMiA3YTUgNSAwIDAgMSA1LTVoMTBhNSA1IDAgMCAxIDUgNXYxMGE1IDUgMCAwIDEtNSA1SDdhNSA1IDAgMCAxLTUtNXpNNCA5LjZINy4yVjExLjRhMS4zIDEuMyAwIDAgMCAyLjYgMFY5LjZIMTQuMlYxMy42YTEuMyAxLjMgMCAwIDAgMi42IDBWOS42SDIwVjE3YTMgMyAwIDAgMS0zIDNIN2EzIDMgMCAwIDEtMy0zek02LjYgNS4zaDIuOGEuNy43IDAgMCAxIDAgMS40SDYuNmEuNy43IDAgMCAxIDAtMS40eiIvPjwvc3ZnPgo%3D&align=left&mode=light" />
  </picture>
</p>

<p align="center">
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img alt="Chrome Manifest V3" src="https://shieldcn.dev/badge/Chrome-Manifest_V3.svg?logo=googlechrome&variant=secondary" /></a>
</p>

Stylus is a Chrome extension that lets you edit any live webpage the way you edit a frame in Figma. Click an element to select it, then hide it, rewrite its text, or change its styles in a visual panel. Stylus saves your edits per site and applies them again every time you visit.

Use it to strip distractions from a page, make a site easier on the eyes, or try a design change on a real page before writing any code.

## What you can do

- Hide anything. Click an element and press Delete, or switch to the Zap tool and click things away one by one.
- Edit text in place. Double-click any text, type, and press Enter.
- Restyle elements in the Design panel. It covers layout and flexbox alignment, size, margin and padding, typography, background, border, shadow, blur, and opacity. Drag a field's label to change its value.
- Write CSS directly, either for the selected element or for the whole site.
- Style hover and focus states, or limit an edit to one screen size (mobile, tablet, desktop).
- Change how the whole page looks from the Theme panel. Presets include Dark, Dim, Sepia, Night, Mono, Contrast, and Reading. You can also set the page background, text color, link color, font, and zoom.
- Turn on Focus mode to hide cookie banners, ads, popups, and sticky bars in one click.
- Browse the page's elements as a tree in the Layers panel, search it by name or CSS selector, and show or hide items.
- Review every edit in the Changes panel. You can switch each one off, delete it, or export the site's edits as JSON and import them elsewhere.
- Record a video of the selected element or the whole tab, Loom style. A 3-2-1 countdown starts it; the video shows a cursor, click ripples and the keys you press, and includes the tab's sound. Recordings open in a library page where you can watch, rename, download as MP4, or delete them.
- Undo and redo any edit. Edits sync to other open tabs of the same site.

## Install

Stylus is not on the Chrome Web Store yet. Build it and load it unpacked.

```sh
pnpm install
pnpm build
```

1. Open `chrome://extensions` and turn on Developer mode.
2. Click "Load unpacked" and choose `packages/extension/.output/chrome-mv3`. The `.output` folder is hidden in Finder, so press Cmd+Shift+G in the file dialog and paste the full path.
3. Reload any tabs that were open before you installed the extension.

## Use

Press Alt+Shift+S, or click the Stylus icon in the toolbar, to turn edit mode on or off. Outside edit mode, Stylus applies your saved edits and shows no UI.

| Key | Action |
| --- | --- |
| V, H, T | Select tool, Zap tool (click to hide), Text tool |
| Click, Shift-click | Select one element, add to the selection |
| Double-click | Edit text (Enter saves, Esc cancels) |
| Esc, Enter, Tab | Select the parent, first child, next sibling |
| S | Select all elements similar to the current one |
| Delete | Hide the selection |
| Cmd+Z, Cmd+Shift+Z | Undo, redo |
| L, D | Show or hide the Layers and Design panels |

To record, click the record button in the toolbar and choose the selected element or the whole tab, or use Record in the bottom bar. While recording an element, the controls sit next to it; for the whole tab they stay out of the video, so stop with Alt+Shift+S or the Stylus icon. Esc cancels during the countdown.

The bar at the bottom of the screen shows the selected element's ancestors, quick actions (Similar, Isolate, Edit text, Hide), and the state and screen size that new style edits apply to.

## Develop

```sh
pnpm dev        # opens Chrome with the extension loaded and hot reload on
pnpm build      # writes the extension to packages/extension/.output/chrome-mv3
pnpm typecheck
pnpm test       # unit tests for the op model, CSS compiler, and undo history
pnpm e2e        # builds the extension, then runs the Playwright suite against it
```

### End-to-end tests

The suite in `packages/extension/e2e` loads the built extension into Chromium with a fresh profile for each test and drives it with the mouse and keyboard. It uses three fixture pages: an ordinary page, a single-page app that re-renders its content, and a hostile page with a full-screen overlay at the maximum z-index and `!important` style resets.

The 66 tests check edit mode, selection and keyboard navigation, every tool, the Layers search, each Design control, hover and breakpoint edits, all theme presets, Focus mode, the Changes panel, undo and redo, persistence across reloads, loading without a flash of the original page, per-site isolation, sync between tabs, and edits surviving re-renders.

```sh
npx playwright install chromium            # once, or set CHROME=/path/to/chrome
pnpm e2e                                   # headless run, HTML report in packages/extension/e2e/report
pnpm --filter @stylus/extension e2e:ui     # Playwright UI mode for debugging
```

## How it works

Stylus stores every change as a small JSON record called an `EditOp`. There are five kinds: `style`, `hide`, `text`, `rawCss`, and `preset`. A site's ops live in `chrome.storage.local` under its origin.

On page load, the content script reads the site's ops and compiles the style, hide, and preset ops into one `<style>` element. It holds the first paint until that finishes, so hidden elements never flash. A `MutationObserver` applies text ops again whenever the page re-renders them.

```
packages/shared      EditOp schema (zod), op-to-CSS compiler, edit helpers, undo history
packages/extension   the WXT extension
  entrypoints/background.ts        toolbar button, keyboard shortcut, badge
  entrypoints/content/engine       storage and state, style engine
  entrypoints/content/canvas       overlay, element picker, toolbar, bottom bar
  entrypoints/content/panels       Layers, Design, Theme, and Changes panels
  entrypoints/offscreen            records the captured tab, cropped to the target
  entrypoints/recordings           the recordings library page
  e2e                              Playwright tests and fixture pages
```

## Roadmap

- Resize, nudge, and reorder elements by dragging handles on the page, and measure distances between elements.
- A Cmd+K prompt that asks an AI model for style changes and shows them as a preview you accept or reject.
- An MCP server so coding agents can read your edits, apply styles to the open tab, and port the changes into a codebase.
- Design token extraction, and copying a selection as CSS or Tailwind classes.
- Named versions per site with a before and after comparison.
