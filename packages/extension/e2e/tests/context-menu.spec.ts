import { expect, test } from '../fixtures';

test('registers the Stylus right-click menu items', async ({ sw }) => {
  for (const id of ['stylus', 'stylus-hide', 'stylus-text', 'stylus-style']) {
    // update() rejects for ids that don't exist.
    await sw.evaluate((menuId) => chrome.contextMenus.update(menuId, {}), id);
  }
});

test('"Hide this element" hides it without entering edit mode, and persists', async ({ stylus, page }) => {
  await stylus.open();
  await stylus.contextAction('aside', 'hide');
  await expect.poll(() => stylus.style('aside', 'display')).toBe('none');
  await expect(page.locator('stylus-canvas')).toHaveCount(0);
  await stylus.persisted((r) => r?.ops.length === 1);
  await page.reload();
  expect(await stylus.style('aside', 'display')).toBe('none');
});

test('"Edit this text" opens edit mode with the text ready to type', async ({ stylus, page }) => {
  await stylus.open();
  await stylus.contextAction('#title', 'text');
  await expect(stylus.ui('.toolbar')).toBeVisible();
  await expect(page.locator('#title')).toHaveAttribute('data-stylus-editing', '');
  await page.keyboard.type('From the menu');
  await page.keyboard.press('Enter');
  await expect(page.locator('#title')).toHaveText('From the menu');
});

test('"Style this element" opens edit mode with it selected', async ({ stylus }) => {
  await stylus.open();
  await stylus.contextAction('#link', 'style');
  await expect(stylus.crumb()).toHaveText(/a#link/);
  await expect(stylus.panel('Design').locator('.selector-bar input')).toHaveValue('#link');
});
