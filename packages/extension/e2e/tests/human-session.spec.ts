import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

/**
 * One continuous session driven only the way a person would: moving the mouse in steps, clicking
 * what's visible, dragging, holding keys and typing character by character. No selectors are typed
 * into Stylus to pick elements, and no inputs are filled programmatically.
 */

const ui = (page: Page, sel: string) => page.locator(`stylus-canvas ${sel}`);

async function glide(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 12 });
}

/** A point inside an element's padding, so the element itself (not its text) is under the cursor. */
async function inPadding(page: Page, sel: string, corner: 'tl' | 'br' = 'tl') {
  const b = (await page.locator(sel).boundingBox())!;
  return corner === 'tl' ? { x: b.x + 6, y: b.y + 6 } : { x: b.x + b.width - 6, y: b.y + b.height - 6 };
}

async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await glide(page, from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 15 });
  await page.mouse.up();
}

async function typeInto(page: Page, field: ReturnType<typeof ui>, text: string) {
  await field.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press('Enter');
}

test('a full editing session with mouse and keyboard only', async ({ stylus, page }) => {
  test.slow();
  await stylus.open();
  await stylus.edit(); // stands in for clicking the toolbar icon, which Playwright can't reach

  // Hover shows what's under the cursor; clicking selects it.
  let p = await inPadding(page, '#second');
  await glide(page, p.x, p.y);
  await expect(ui(page, '.overlay .label')).toContainText('article#second');
  await page.mouse.click(p.x, p.y);
  await expect(stylus.crumb()).toHaveText('article#second');

  // Walk the tree with the keyboard.
  await page.keyboard.press('Escape');
  await expect(stylus.crumb()).toHaveText('main');
  await page.keyboard.press('Enter');
  await expect(stylus.crumb()).toHaveText('article#first');
  await page.keyboard.press('Tab');
  await expect(stylus.crumb()).toHaveText('article#second');

  // Resize with the right-edge handle and watch the live label.
  const w0 = (await page.locator('#second').boundingBox())!.width;
  const e = (await ui(page, '.handle[data-handle="e"]').boundingBox())!;
  await glide(page, e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.down();
  await page.mouse.move(e.x + e.width / 2 + 30, e.y + e.height / 2, { steps: 10 });
  await expect(ui(page, '.drag-label')).toContainText('W ');
  await page.mouse.up();
  expect(Math.round((await page.locator('#second').boundingBox())!.width - w0)).toBe(30);

  // Round the corners with the radius dot.
  const r = (await ui(page, '.handle[data-handle="radius"]').boundingBox())!;
  await dragBy(page, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 10, 10);
  expect(Number.parseFloat(await stylus.style('#second', 'border-top-left-radius'))).toBeGreaterThan(8);

  // Hold Alt and point at the neighbour to read the gap.
  p = await inPadding(page, '#third', 'br');
  await page.keyboard.down('Alt');
  await glide(page, p.x, p.y);
  await expect(ui(page, '.m-label')).toBeVisible();
  await page.keyboard.up('Alt');

  // Nudge with arrows.
  const before = (await page.locator('#second').boundingBox())!;
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  expect(Math.round((await page.locator('#second').boundingBox())!.y - before.y)).toBe(4);

  // Drag the card in front of the first one.
  const second = (await page.locator('#second').boundingBox())!;
  const first = (await page.locator('#first').boundingBox())!;
  await dragBy(page, { x: second.x + 20, y: second.y + 20 }, first.x + 10 - (second.x + 20), 0);
  expect(await page.$$eval('main > article', (els) => els.map((e) => e.id))).toEqual(['second', 'first', 'third']);

  // Change the font size from the Design panel by typing.
  const size = ui(page, '.scrub').filter({ has: page.locator('.scrub-label', { hasText: /^Size$/ }) }).locator('input');
  p = await inPadding(page, '#third');
  await page.mouse.click(p.x, p.y);
  await page.mouse.dblclick((await page.locator('#third h2').boundingBox())!.x + 10, (await page.locator('#third h2').boundingBox())!.y + 10);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Renamed', { delay: 20 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#third h2')).toHaveText('Renamed');
  await typeInto(page, size, '32');
  expect(await stylus.style('#third h2', 'font-size')).toBe('32px');

  // Turn on a comfort theme from the toolbar.
  await ui(page, '.tb-btn[title^="Theme"]').click();
  await ui(page, '.preset').filter({ hasText: 'Sepia' }).click();
  expect(await stylus.style('html', 'filter')).toContain('sepia');

  // Review changes, switch one off, then undo and redo.
  await ui(page, '.tb-btn[title^="Changes"]').click();
  const rows = ui(page, '.changes li');
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  await rows.filter({ hasText: 'Theme: sepia' }).locator('input[type=checkbox]').click();
  expect(await stylus.style('html', 'filter')).toBe('none');
  await page.mouse.click(5, 300); // click back on the page, then use shortcuts
  await page.keyboard.press('Meta+z');
  expect(await stylus.style('html', 'filter')).toContain('sepia');
  await page.keyboard.press('Meta+Shift+z');
  expect(await stylus.style('html', 'filter')).toBe('none');

  // Leave edit mode; the page works normally again.
  await ui(page, '.tb-btn[title^="Exit"]').click();
  await expect(page.locator('stylus-canvas')).toHaveCount(0);
  await page.locator('#btn').click();
  expect(await page.evaluate(() => (window as unknown as { clicked: boolean }).clicked)).toBe(true);

  // Come back later: everything is still there.
  await stylus.persisted((rule) => (rule?.ops.length ?? 0) >= 5);
  await page.reload();
  await page.waitForFunction(() => !!document.getElementById('__stylus-style'));
  expect(await page.$$eval('main > article', (els) => els.map((e) => e.id))).toEqual(['second', 'first', 'third']);
  await expect(page.locator('#third h2')).toHaveText('Renamed');
  expect(await stylus.style('#third h2', 'font-size')).toBe('32px');
  expect(Math.round((await page.locator('#second').boundingBox())!.width - w0)).toBe(30);
});
