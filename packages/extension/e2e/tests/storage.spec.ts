import type { BrowserContext, Page } from '@playwright/test';
import { expect, test, type Stylus } from '../fixtures';

/** The Storage page: what Stylus keeps in the browser, and clearing it. */

test.slow();

async function screenshotTab(stylus: Stylus, context: BrowserContext) {
  const opened = context.waitForEvent('page');
  await stylus.ui('.tb-btn[title="Screenshot"]').click();
  await stylus.ui('.rec-menu button').filter({ hasText: 'Screenshot visible tab' }).click();
  const editor = await opened;
  await expect(editor.locator('.item').first()).toBeVisible();
  await editor.close();
}

async function openStorage(stylus: Stylus, context: BrowserContext): Promise<Page> {
  const opened = context.waitForEvent('page');
  await stylus.ui('.tb-btn[title="Screenshot"]').click();
  await stylus.ui('.rec-menu button').filter({ hasText: 'Manage storage' }).click();
  const page = await opened;
  await page.waitForLoadState();
  await expect(page.locator('h1')).toHaveText('Storage');
  return page;
}

test('empty storage says so', async ({ stylus, context }) => {
  await stylus.open();
  await stylus.edit();
  const storage = await openStorage(stylus, context);
  await expect(storage.locator('.all-clear')).toContainText('Nothing stored');
  await expect(storage.locator('.card').nth(1)).toContainText('Recordings');
  await expect(storage.locator('.card').nth(1).locator('.num')).toHaveText('0');
  await expect(storage.locator('.card').nth(3)).toContainText('Sites with edits · 0 B');
});

test('lists screenshots and recordings with sizes, and deletes them', async ({ stylus, page, context }) => {
  await stylus.open();
  await stylus.edit();
  await screenshotTab(stylus, context);
  await screenshotTab(stylus, context);

  await page.bringToFront();
  await stylus.pick('#second');
  await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
  await expect(stylus.ui('.rec-countdown')).toHaveCount(0, { timeout: 6000 });
  await page.mouse.move(400, 300, { steps: 20 });
  await page.waitForTimeout(1200);
  const library = context.waitForEvent('page');
  await stylus.ui('.rec-btn.stop').click();
  await (await library).close();

  await page.bringToFront();
  const storage = await openStorage(stylus, context);
  await expect(storage.locator('.card').nth(1).locator('.num')).toHaveText('1');
  await expect(storage.locator('.card').nth(2).locator('.num')).toHaveText('2');
  await expect(storage.locator('section', { hasText: 'Screenshots ·' }).locator('.row')).toHaveCount(2);
  await expect(storage.locator('section', { hasText: 'Recordings ·' }).locator('.row .size')).toHaveText(/KB|MB/);

  // Rows link to the item in its own page.
  await expect(storage.locator('section', { hasText: 'Recordings ·' }).locator('a.name')).toHaveAttribute('href', /\/recordings\.html#rec_/);

  // Delete one screenshot (with confirmation).
  const shots = storage.locator('section', { hasText: 'Screenshots ·' });
  await shots.locator('.row').first().locator('.btn', { hasText: 'Delete' }).click();
  await shots.locator('.row').first().locator('.btn.danger').click();
  await expect(shots.locator('.row')).toHaveCount(1);

  // Delete everything that's left.
  await shots.locator('header .btn', { hasText: 'Delete all screenshots' }).click();
  await shots.locator('header .btn.danger').click();
  const recs = storage.locator('section', { hasText: 'Recordings ·' });
  await recs.locator('header .btn', { hasText: 'Delete all recordings' }).click();
  await recs.locator('header .btn.danger').click();
  await expect(storage.locator('.all-clear')).toBeVisible();
});

test('shows unfinished recordings and can remove them', async ({ stylus, page, context, sw }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('#second');
  await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
  await expect(stylus.ui('.rec-countdown')).toHaveCount(0, { timeout: 6000 });
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(200 + i * 100, 300, { steps: 15 });
    await page.waitForTimeout(500);
  }
  await sw.evaluate(() => chrome.offscreen.closeDocument()); // recorder dies mid-recording

  const storage = await context.newPage();
  await storage.goto(`chrome-extension://${await sw.evaluate(() => chrome.runtime.id)}/options.html`);
  const unfinished = storage.locator('section', { hasText: 'Unfinished recordings' });
  await expect(unfinished).toBeVisible();
  await expect(unfinished.locator('.row')).toHaveCount(1);
  await unfinished.locator('header .btn', { hasText: 'Remove unfinished' }).click();
  await unfinished.locator('header .btn.danger').click();
  await expect(unfinished).toHaveCount(0);
  await expect(storage.locator('.all-clear')).toBeVisible();
});

test('the library pages link to Storage', async ({ stylus, sw, context }) => {
  await stylus.open();
  const page = await context.newPage();
  const base = `chrome-extension://${await sw.evaluate(() => chrome.runtime.id)}`;
  for (const path of ['/recordings.html', '/capture.html']) {
    await page.goto(base + path);
    await page.locator('a.storage-link').click();
    await expect(page.locator('h1')).toHaveText('Storage');
  }
});
