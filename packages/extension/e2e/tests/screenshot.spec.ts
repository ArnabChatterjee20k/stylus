import type { BrowserContext, Page } from '@playwright/test';
import { downloadCount, expect, lastDownload, test, type Stylus } from '../fixtures';

/**
 * Screenshots end to end: capture (element / visible tab / right-click) → stored PNG → editor →
 * exported PNG. Assertions decode real images and read their pixels.
 */

async function paintCard(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('#second')!;
    el.style.background = 'rgb(220, 20, 60)';
    el.style.minHeight = '220px';
  });
}

async function openedEditor(context: BrowserContext, act: () => Promise<unknown>) {
  const opened = context.waitForEvent('page', { timeout: 10000 });
  await act();
  const editor = await opened;
  await editor.waitForLoadState();
  await expect(editor.locator('.item').first()).toBeVisible();
  await expect.poll(() => editor.locator('canvas.preview').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  return editor;
}

/** Decode a PNG (stored capture or exported file) in the editor page and sample pixels. */
async function decode(editor: Page, bytes: number[] | 'stored', points: [number, number][] = []) {
  return editor.evaluate(
    async ({ bytes, points }) => {
      let blob: Blob;
      if (bytes === 'stored') {
        blob = await new Promise<Blob>((resolve) => {
          const req = indexedDB.open('stylus-captures');
          req.onsuccess = () => {
            const get = req.result.transaction('captures').objectStore('captures').getAll();
            get.onsuccess = () => resolve(get.result.sort((a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt)[0].image);
          };
        });
      } else {
        blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      }
      const img = await createImageBitmap(blob);
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const at = (x: number, y: number) => Array.from(ctx.getImageData(Math.round(x * (img.width - 1)), Math.round(y * (img.height - 1)), 1, 1).data);
      return { width: img.width, height: img.height, pixels: points.map(([x, y]) => at(x, y)) };
    },
    { bytes, points },
  );
}

async function download(editor: Page) {
  const before = await downloadCount(editor);
  await editor.locator('.btn.primary', { hasText: 'Download PNG' }).click();
  await expect.poll(() => downloadCount(editor)).toBe(before + 1);
  return lastDownload(editor);
}

/** Several exports from one screenshot: keep it around after each download. */
async function keepCopies(editor: Page) {
  await editor.locator('.keep input').check();
}

const isRed = ([r, g, b]: number[]) => r > 180 && g < 70 && b < 100;

async function shootSecondCard(stylus: Stylus, context: BrowserContext) {
  await stylus.open();
  await paintCard(stylus.page);
  await stylus.edit();
  await stylus.pick('#second');
  return openedEditor(context, () => stylus.ui('.bb-actions button').filter({ hasText: 'Screenshot' }).click());
}

test('screenshots the selected element exactly, without Stylus UI in it', async ({ stylus, page, context }) => {
  const editor = await shootSecondCard(stylus, context);
  const card = (await page.locator('#second').boundingBox())!;
  const shot = await decode(editor, 'stored', [[0.5, 0.5], [0.05, 0.95]]);
  expect(Math.abs(shot.width - card.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(shot.height - card.height)).toBeLessThanOrEqual(1);
  expect(shot.pixels.every(isRed)).toBe(true); // all card, no selection outline or handles
  await expect(editor.locator('.toolbar .title')).toHaveText(/article#second/);
  // The editing UI comes back in the page.
  await expect(stylus.ui('.toolbar')).toBeVisible();
});

test('screenshots the visible tab with panels hidden', async ({ stylus, page, context }) => {
  await stylus.open();
  await stylus.edit();
  await expect(stylus.panel('Layers')).toBeVisible();
  const layers = (await stylus.panel('Layers').boundingBox())!;
  const editor = await openedEditor(context, async () => {
    await stylus.ui('.tb-btn[title="Screenshot"]').click();
    await stylus.ui('.rec-menu button').filter({ hasText: 'Screenshot visible tab' }).click();
  });
  const vw = await page.evaluate(() => innerWidth);
  // Where the dark Layers panel was, the shot shows the page's white background.
  const shot = await decode(editor, 'stored', [[(layers.x + 40) / vw, (layers.y + 40) / 800]]);
  expect(shot.width).toBe(vw);
  expect(shot.height).toBe(800);
  expect(Math.min(...shot.pixels[0].slice(0, 3))).toBeGreaterThan(230);
});

test('an element partly scrolled out of view is brought into view and captured whole', async ({ stylus, page, context }) => {
  await stylus.open();
  await paintCard(page);
  await page.evaluate(() => {
    document.body.style.paddingBottom = '2000px';
    scrollTo(0, document.querySelector('#second')!.getBoundingClientRect().top + scrollY + 120);
  });
  await stylus.edit();
  await stylus.pick('#second');
  const editor = await openedEditor(context, () => stylus.ui('.bb-actions button').filter({ hasText: 'Screenshot' }).click());
  const shot = await decode(editor, 'stored', [[0.5, 0.05], [0.5, 0.95]]);
  const card = (await page.locator('#second').boundingBox())!; // scrolled fully into view now
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(Math.abs(shot.height - card.height)).toBeLessThanOrEqual(1);
  expect(shot.pixels.every(isRed)).toBe(true);
});

test('right-click "Screenshot this element" works without edit mode', async ({ stylus, page, context }) => {
  await stylus.open();
  await paintCard(page);
  const editor = await openedEditor(context, () => stylus.contextAction('#second', 'shot'));
  const shot = await decode(editor, 'stored', [[0.5, 0.5]]);
  expect(isRed(shot.pixels[0])).toBe(true);
  await expect(page.locator('stylus-canvas')).toHaveCount(0);
});

test('exports the styled image: background, frame, aspect ratio and 2× size', async ({ stylus, context }) => {
  const editor = await shootSecondCard(stylus, context);
  const stored = await decode(editor, 'stored');

  // Default style: Candy gradient (pink in the top-left), window frame, padding.
  await keepCopies(editor);
  await editor.locator('.seg button', { hasText: '1×' }).click();
  const one = await download(editor);
  expect(one.mime).toBe('image/png');
  const a = await decode(editor, one.bytes, [[0.01, 0.01], [0.5, 0.6]]);
  expect(a.width).toBeGreaterThan(stored.width);
  const [r, g, b] = a.pixels[0];
  expect(r).toBeGreaterThan(230);
  expect(g).toBeLessThan(140);
  expect(b).toBeGreaterThan(110); // #ff4d94
  expect(isRed(a.pixels[1])).toBe(true); // the card in the middle

  // 16:9 for X/Twitter.
  await editor.locator('.chips button').getByText('16:9', { exact: true }).click();
  await editor.waitForTimeout(400);
  const wide = await decode(editor, (await download(editor)).bytes);
  expect(Math.abs(wide.width / wide.height - 16 / 9)).toBeLessThan(0.01);

  // 2× doubles every dimension.
  await editor.locator('.seg button', { hasText: '2×' }).click();
  const two = await decode(editor, (await download(editor)).bytes);
  // Padding and aspect are rounded per size, so allow a few pixels.
  expect(Math.abs(two.width / (wide.width * 2) - 1)).toBeLessThan(0.005);
  expect(Math.abs(two.height / (wide.height * 2) - 1)).toBeLessThan(0.005);
});

test('transparent background and no frame export just the rounded screenshot', async ({ stylus, context }) => {
  const editor = await shootSecondCard(stylus, context);
  await editor.locator('.swatch[title="Transparent"]').click();
  await editor.locator('.chips button').getByText('None', { exact: true }).click();
  await editor.locator('.seg.full button', { hasText: 'None' }).click();
  await editor.locator('.seg button', { hasText: '1×' }).click();
  await editor.waitForTimeout(400);
  const out = await decode(editor, (await download(editor)).bytes, [[0, 0], [0.5, 0.5]]);
  // Downloaded and not kept: the screenshot is gone from Stylus.
  await expect(editor.locator('.status')).toHaveText('Saved to Downloads and removed from Stylus');
  await expect(editor.locator('.empty')).toBeVisible();
  expect(out.pixels[0][3]).toBe(0); // fully transparent corner
  expect(isRed(out.pixels[1])).toBe(true);
});

test('each screenshot keeps its style; new ones start from the last style used', async ({ stylus, page, context }) => {
  const editor = await shootSecondCard(stylus, context);
  await editor.locator('.swatch[title="Ocean"]').click();
  await editor.locator('.chips button').getByText('Browser dark', { exact: true }).click();
  await editor.waitForTimeout(500); // saved after a short debounce
  await editor.reload();
  await expect(editor.locator('.swatch[title="Ocean"]')).toHaveClass(/on/);
  await expect(editor.locator('.chips button').getByText('Browser dark', { exact: true })).toHaveClass(/on/);

  await page.bringToFront();
  const next = await openedEditor(context, async () => {
    await stylus.ui('.tb-btn[title="Screenshot"]').click();
    await stylus.ui('.rec-menu button').filter({ hasText: 'Screenshot visible tab' }).click();
  });
  await expect(next.locator('.item')).toHaveCount(2);
  await expect(next.locator('.swatch[title="Ocean"]')).toHaveClass(/on/);
});

test('copy puts a PNG on the clipboard', async ({ stylus, context }) => {
  const editor = await shootSecondCard(stylus, context);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await editor.locator('.btn', { hasText: 'Copy' }).click();
  await expect(editor.locator('.status')).toHaveText('Copied to clipboard');
  const types = await editor.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
  expect(types).toContain('image/png');
});

test('delete asks first, then removes the screenshot', async ({ stylus, context }) => {
  const editor = await shootSecondCard(stylus, context);
  await editor.locator('.link.danger', { hasText: 'Delete screenshot' }).click();
  await editor.locator('.confirm .btn.danger').click();
  await expect(editor.locator('.empty')).toBeVisible();
});

test('downloading removes the screenshot from Stylus unless "keep a copy" is on', async ({ stylus, context }) => {
  const editor = await shootSecondCard(stylus, context);
  await keepCopies(editor);
  await download(editor);
  await expect(editor.locator('.status')).toHaveText('Saved to Downloads');
  await expect(editor.locator('.item')).toHaveCount(1);
  await editor.locator('.keep input').uncheck();
  await download(editor);
  await expect(editor.locator('.item')).toHaveCount(0);
  const stored = await editor.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('stylus-captures');
        req.onsuccess = () => {
          const c = req.result.transaction('captures').objectStore('captures').count();
          c.onsuccess = () => resolve(c.result);
        };
      }),
  );
  expect(stored).toBe(0);
});
