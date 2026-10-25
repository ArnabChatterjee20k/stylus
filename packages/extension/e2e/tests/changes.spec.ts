import { expect, test } from '../fixtures';

/** Make three changes: hide aside, restyle #title, edit #title text. */
async function makeChanges(stylus: import('../fixtures').Stylus) {
  const { page } = stylus;
  await stylus.pick('aside');
  await page.keyboard.press('Delete');
  await stylus.select('#title');
  await stylus.setInput(stylus.scrub(stylus.panel('Design'), 'Size').locator('input'), '40');
  await page.dblclick('#title');
  await page.keyboard.type('Changed');
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ stylus }) => {
  await stylus.open();
  await stylus.edit();
});

test('lists every change, newest first, with a count badge', async ({ stylus }) => {
  await makeChanges(stylus);
  await expect(stylus.toolbarButton('Changes').locator('.tb-count')).toHaveText('3');
  await stylus.toolbarButton('Changes').click();
  await expect(stylus.ui('.changes li')).toHaveCount(3);
  await expect(stylus.ui('.changes li').first()).toContainText('Text #title');
  await expect(stylus.ui('.changes li').last()).toContainText('Hidden .sidebar');
});

test('toggle a change off and on', async ({ stylus }) => {
  await makeChanges(stylus);
  await stylus.toolbarButton('Changes').click();
  const row = stylus.ui('.changes li').filter({ hasText: 'Hidden' });
  await row.locator('input[type=checkbox]').uncheck();
  expect(await stylus.style('aside', 'display')).not.toBe('none');
  await expect(row).toHaveClass(/off/);
  await row.locator('input[type=checkbox]').check();
  expect(await stylus.style('aside', 'display')).toBe('none');
});

test('disabling or deleting a text change restores the original text', async ({ stylus, page }) => {
  await makeChanges(stylus);
  await stylus.toolbarButton('Changes').click();
  const row = stylus.ui('.changes li').filter({ hasText: 'Text' });
  await row.locator('input[type=checkbox]').uncheck();
  await expect(page.locator('#title')).toHaveText('Hello world');
  await row.locator('input[type=checkbox]').check();
  await expect(page.locator('#title')).toHaveText('Changed');
  await row.locator('button[title="Delete change"]').click();
  await expect(page.locator('#title')).toHaveText('Hello world');
  await expect(stylus.ui('.changes li')).toHaveCount(2);
});

test('hovering a change previews the affected elements; clicking selects them', async ({ stylus }) => {
  await makeChanges(stylus);
  await stylus.toolbarButton('Changes').click();
  const row = stylus.ui('.changes li').filter({ hasText: 'Style' });
  await row.hover();
  await expect(stylus.ui('.overlay .pv')).toHaveCount(1);
  await row.locator('.change-text').click();
  await expect(stylus.crumb()).toHaveText('h2#title');
});

test('undo / redo via toolbar and keyboard', async ({ stylus, page }) => {
  await makeChanges(stylus);
  await stylus.toolbarButton('Undo').click();
  await expect(page.locator('#title')).toHaveText('Hello world');
  await page.keyboard.press('Meta+z');
  expect(await stylus.style('#title', 'font-size')).toBe('24px');
  await page.keyboard.press('Meta+Shift+z');
  expect(await stylus.style('#title', 'font-size')).toBe('40px');
  await stylus.toolbarButton('Redo').click();
  await expect(page.locator('#title')).toHaveText('Changed');
  await expect(stylus.toolbarButton('Redo')).toBeDisabled();
});

test('power button shows the original page without losing edits', async ({ stylus, page }) => {
  await makeChanges(stylus);
  await stylus.toolbarButton('Edits on').click();
  expect(await stylus.style('aside', 'display')).not.toBe('none');
  await expect(page.locator('#title')).toHaveText('Hello world');
  await stylus.toolbarButton('Edits off').click();
  expect(await stylus.style('aside', 'display')).toBe('none');
  await expect(page.locator('#title')).toHaveText('Changed');
});

test('export → reset → import round-trips the site edits', async ({ stylus, page }) => {
  await makeChanges(stylus);
  await stylus.toolbarButton('Changes').click();
  const panel = stylus.panel('Changes');
  await panel.locator('.panel-actions button', { hasText: 'Export' }).click();
  const json = await panel.locator('.io textarea').inputValue();
  expect(JSON.parse(json).ops).toHaveLength(3);

  await panel.locator('button', { hasText: 'Reset site' }).click();
  await expect(panel.locator('.changes li')).toHaveCount(0);
  expect(await stylus.style('aside', 'display')).not.toBe('none');

  await panel.locator('.panel-actions button', { hasText: 'Import' }).click();
  await panel.locator('.io textarea').fill(json);
  await panel.locator('.io button', { hasText: 'Add these edits' }).click();
  await expect(panel.locator('.changes li')).toHaveCount(3);
  expect(await stylus.style('aside', 'display')).toBe('none');
  await expect(page.locator('#title')).toHaveText('Changed');
});

test('import rejects invalid JSON with a message', async ({ stylus }) => {
  await stylus.toolbarButton('Changes').click();
  const panel = stylus.panel('Changes');
  await panel.locator('.panel-actions button', { hasText: 'Import' }).click();
  await panel.locator('.io textarea').fill('{ not json');
  await panel.locator('.io button', { hasText: 'Add these edits' }).click();
  await expect(panel.locator('.error')).toBeVisible();
});
