import { expect, test } from '../fixtures';

test('text edits survive SPA re-renders', async ({ stylus, page }) => {
  await stylus.open('/spa');
  await stylus.edit();
  await page.dblclick('#headline');
  await page.keyboard.type('My headline');
  await page.keyboard.press('Enter');
  await stylus.exit();

  await page.evaluate(() => (window as unknown as { rerender: () => void }).rerender());
  await expect(page.locator('.note')).toHaveText('render 2');
  await expect(page.locator('#headline')).toHaveText('My headline');
});

test('hide rules apply to elements added later', async ({ stylus, page }) => {
  await stylus.open('/spa');
  await stylus.edit();
  await stylus.pick('.note');
  await page.keyboard.press('Delete');
  await stylus.exit();
  await page.evaluate(() => (window as unknown as { rerender: () => void }).rerender());
  expect(await stylus.style('.note', 'display')).toBe('none');
});

test('UI stays on top of max z-index overlays and immune to page CSS', async ({ stylus, page }) => {
  await stylus.open('/hostile');
  await stylus.edit();
  const toolbar = stylus.ui('.toolbar');
  const box = (await toolbar.boundingBox())!;
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.localName, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(hit).toBe('stylus-canvas');
  // Page's `* { font-size: 40px !important }` must not leak into our panels.
  expect(await stylus.ui('.panel-title').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('11px');
  await stylus.toolbarButton('Theme').click();
  await expect(stylus.panel('Theme')).toBeVisible();
});

test('keyboard shortcuts are ignored while typing in Stylus inputs', async ({ stylus, page }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.ui('.layers-search input').fill('');
  await stylus.ui('.layers-search input').type('shtvld');
  await expect(stylus.ui('.layers-search input')).toHaveValue('shtvld');
  await expect(stylus.toolbarButton('Select')).toHaveClass(/on/);
  await expect(stylus.panel('Layers')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { keys: string[] }).keys)).toEqual([]);
});

test('panels can be dragged, collapsed and closed', async ({ stylus, page }) => {
  await stylus.open();
  await stylus.edit();
  const layers = stylus.panel('Layers');
  const head = layers.locator('.panel-title');
  const before = (await layers.boundingBox())!;
  const h = (await head.boundingBox())!;
  await page.mouse.move(h.x + 10, h.y + 5);
  await page.mouse.down();
  await page.mouse.move(h.x + 110, h.y + 105, { steps: 5 });
  await page.mouse.up();
  const after = (await layers.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(100);
  expect(Math.round(after.y - before.y)).toBe(100);

  await layers.locator('button[title="Collapse"]').click();
  await expect(layers.locator('.panel-body')).toHaveCount(0);
  await layers.locator('button[title="Close"]').click();
  await expect(layers).toHaveCount(0);
  await page.keyboard.press('l');
  await expect(stylus.panel('Layers')).toBeVisible();
});

test('selection follows an element the page re-renders', async ({ stylus, page }) => {
  await stylus.open('/spa');
  await stylus.edit();
  await stylus.pick('#headline');
  await page.evaluate(() => (window as unknown as { rerender: () => void }).rerender());
  await expect(stylus.crumb()).toHaveText('h1#headline');
  await expect(stylus.ui('.overlay .sel')).toHaveCount(1);
  await stylus.setInput(stylus.scrub(stylus.panel('Design'), 'Size').locator('input'), '50');
  expect(await stylus.style('#headline', 'font-size')).toBe('50px');
});

test('content script reports no errors on load and through an edit session', async ({ stylus, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await stylus.open();
  await stylus.edit();
  await stylus.select('#title');
  for (const p of ['Theme', 'Changes']) await stylus.toolbarButton(p).click();
  await page.keyboard.press('s');
  await stylus.exit();
  expect(errors).toEqual([]);
});
