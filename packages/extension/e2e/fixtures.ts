/// <reference types="chrome" />
import { test as base, chromium, expect, type BrowserContext, type Locator, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extPath = join(here, '../.output/chrome-mv3');

/**
 * Chrome's ID for an unpacked extension: the first 32 hex chars of sha256(path), mapped 0-f → a-p.
 * Needed up front for --allowlisted-extension-id, which lets chrome.tabCapture run without a real
 * click on the toolbar icon (Playwright can't reach the browser toolbar).
 */
export const EXTENSION_ID = [...createHash('sha256').update(resolve(extPath)).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
  .join('');

function serve(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/favicon.ico') {
        res.statusCode = 204;
        res.end();
        return;
      }
      const name = (req.url ?? '/').split('?')[0].replace(/^\/$/, '/index').replace(/\.html$/, '');
      const file = join(here, 'pages', `${name.slice(1)}.html`);
      if (!existsSync(file)) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(readFileSync(file));
    }).listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

type Fixtures = {
  context: BrowserContext;
  sw: Worker;
  page: Page;
  stylus: Stylus;
};
type WorkerFixtures = { origins: { a: string; b: string } };

export const test = base.extend<Fixtures, WorkerFixtures>({
  // Two servers = two origins, to check that edits stay per-site.
  origins: [
    async ({}, use) => {
      const [a, b] = await Promise.all([serve(), serve()]);
      await use({ a: a.url, b: b.url });
      a.server.close();
      b.server.close();
    },
    { scope: 'worker' },
  ],
  context: async ({}, use) => {
    if (!existsSync(join(extPath, 'manifest.json'))) throw new Error('Build the extension first: pnpm build');
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'stylus-e2e-')), {
      executablePath: process.env.CHROME || undefined,
      headless: true,
      args: ['--headless=new', `--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, `--allowlisted-extension-id=${EXTENSION_ID}`],
      viewport: { width: 1280, height: 800 },
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker')));
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
  stylus: async ({ page, sw, origins }, use) => {
    await use(new Stylus(page, sw, origins.a));
  },
});

export { expect };

/** Page-object for driving Stylus on a page. */
export class Stylus {
  constructor(
    readonly page: Page,
    readonly sw: Worker,
    readonly origin: string,
  ) {}

  /** Navigate and wait for the content script to have applied saved edits. */
  async open(path = '/', page = this.page, origin = this.origin) {
    await page.goto(`${origin}${path}`);
    await page.waitForFunction(() => !!document.getElementById('__stylus-style'));
  }

  async toggle(page = this.page) {
    const url = page.url();
    await this.sw.evaluate(async (u) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
      if (!tab?.id) throw new Error(`no tab for ${u}`);
      await chrome.tabs.sendMessage(tab.id, { type: 'stylus:toggle' });
    }, url);
  }

  /** Right-click an element, then trigger a Stylus context-menu action (as the menu's click handler does). */
  async contextAction(selector: string, action: 'hide' | 'text' | 'style' | 'shot', page = this.page) {
    await page.click(selector, { button: 'right' });
    await page.keyboard.press('Escape'); // dismiss the native menu
    const url = page.url();
    await this.sw.evaluate(
      async ([u, a]) => {
        const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
        await chrome.tabs.sendMessage(tab!.id!, { type: 'stylus:context', action: a }, { frameId: 0 });
      },
      [url, action] as const,
    );
  }

  async edit(page = this.page) {
    await this.toggle(page);
    await page.locator('stylus-canvas .toolbar').waitFor();
  }

  async exit(page = this.page) {
    await this.toggle(page);
    await expect(page.locator('stylus-canvas')).toHaveCount(0);
  }

  ui(selector: string, page = this.page): Locator {
    return page.locator(`stylus-canvas ${selector}`);
  }

  panel(title: string) {
    return this.page.locator('stylus-canvas .panel').filter({ has: this.page.locator('.panel-title', { hasText: new RegExp(`^${title}`) }) });
  }

  toolbarButton(titlePrefix: string) {
    return this.ui(`.tb-btn[title^="${titlePrefix}"]`);
  }

  scrub(scope: Locator, label: string) {
    return scope.locator('.scrub').filter({ has: this.page.locator('.scrub-label', { hasText: new RegExp(`^${label}$`) }) });
  }

  field(scope: Locator, label: string) {
    return scope.locator('.field').filter({ has: this.page.locator('.field-label', { hasText: new RegExp(`^${label}$`) }) });
  }

  /** Type into a commit-on-Enter input. */
  async setInput(input: Locator, value: string) {
    await input.fill(value);
    await input.press('Enter');
  }

  /** Click on the page; selects whatever element is under the pointer (may be a child). */
  async select(selector: string) {
    await this.page.click(selector);
  }

  /** Select exactly the element matching `selector`, via the Layers search. */
  async pick(selector: string) {
    const search = this.ui('.layers-search input');
    await search.fill(selector);
    await this.ui('.layer').first().click();
    await search.fill('');
    await search.blur(); // leave the search box so canvas shortcuts work again
  }

  htmlClasses(page = this.page) {
    return page.evaluate(() => document.documentElement.className);
  }

  crumb() {
    return this.ui('.crumb.on');
  }

  async style(selector: string, prop: string, page = this.page) {
    return page.$eval(selector, (el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  }

  async stored(origin = this.origin) {
    return this.sw.evaluate(async (o) => (await chrome.storage.local.get(`site:${o}`))[`site:${o}`] ?? null, origin) as Promise<{
      enabled: boolean;
      ops: { kind: string; selector?: string; disabled?: boolean; props?: Record<string, string>; scope?: Record<string, string> }[];
    } | null>;
  }

  /** Wait until the debounced storage write has landed. */
  async persisted(predicate: (rule: Awaited<ReturnType<Stylus['stored']>>) => boolean) {
    await expect.poll(async () => predicate(await this.stored()), { timeout: 3000 }).toBe(true);
  }

  async badge(page = this.page) {
    const url = page.url();
    return this.sw.evaluate(async (u) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
      return chrome.action.getBadgeText({ tabId: tab!.id });
    }, url);
  }
}
