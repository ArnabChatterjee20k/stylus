import { expect, test } from '../fixtures';

test('edits persist across reloads and apply in view mode without UI', async ({ stylus, page }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('aside');
  await page.keyboard.press('Delete');
  await stylus.pick('#first');
  await stylus.setInput(stylus.panel('Design').locator('.bm-padding > .bm-top'), '40');
  await page.dblclick('#title');
  await page.keyboard.type('Persisted');
  await page.keyboard.press('Enter');
  await stylus.persisted((r) => r?.ops.length === 3);

  await page.reload();
  await page.waitForFunction(() => !!document.getElementById('__stylus-style'));
  await expect(page.locator('stylus-canvas')).toHaveCount(0);
  expect(await stylus.style('aside', 'display')).toBe('none');
  expect(await stylus.style('#first', 'padding-top')).toBe('40px');
  await expect(page.locator('#title')).toHaveText('Persisted');
  await expect.poll(() => stylus.badge()).toBe('3');
});

test('no flash: hidden element is never painted on load', async ({ stylus, page }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('aside');
  await page.keyboard.press('Delete');
  await stylus.persisted((r) => r?.ops.length === 1);
  // Record whether <aside> was ever displayed between first paint and load.
  await page.addInitScript(() => {
    (window as unknown as { seen: boolean }).seen = false;
    const check = () => {
      const a = document.querySelector('aside');
      const painted = a && getComputedStyle(a).display !== 'none' && getComputedStyle(document.documentElement).visibility !== 'hidden';
      if (painted) (window as unknown as { seen: boolean }).seen = true;
      if (document.readyState !== 'complete') requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  await page.reload({ waitUntil: 'load' });
  expect(await page.evaluate(() => (window as unknown as { seen: boolean }).seen)).toBe(false);
});

test('edits stay on their own site', async ({ stylus, page, origins }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('aside');
  await page.keyboard.press('Delete');
  await stylus.persisted((r) => r?.ops.length === 1);
  await stylus.open('/', page, origins.b);
  expect(await stylus.style('aside', 'display')).not.toBe('none');
});

test('edits apply to every page of the site', async ({ stylus, page }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.panel('Design').locator('.panel-actions .segmented button', { hasText: 'CSS' }).click();
  await stylus.panel('Design').locator('textarea.code').last().fill('h1 { color: rgb(9, 9, 9); }');
  await stylus.persisted((r) => r?.ops.length === 1);
  await stylus.open('/spa');
  expect(await stylus.style('#headline', 'color')).toBe('rgb(9, 9, 9)');
});

test('changes sync live to other open tabs of the same site', async ({ stylus, page, context }) => {
  const other = await context.newPage();
  await stylus.open('/?tab=other', other);
  await stylus.open();
  await stylus.edit();
  await stylus.pick('aside');
  await page.keyboard.press('Delete');
  await expect.poll(() => stylus.style('aside', 'display', other)).toBe('none');
  // …and undo there too.
  await page.keyboard.press('Meta+z');
  await expect.poll(() => stylus.style('aside', 'display', other)).not.toBe('none');
});

test('another tab editing the same site does not clobber this tab', async ({ stylus, page, context }) => {
  const other = await context.newPage();
  await stylus.open('/?tab=other', other);
  await stylus.open();
  await stylus.edit(other);
  await other.locator('stylus-canvas .layers-search input').fill('#third');
  await other.locator('stylus-canvas .layer').first().click();
  await other.keyboard.press('Delete');
  await stylus.persisted((r) => r?.ops.length === 1);
  await stylus.edit();
  await stylus.pick('#second');
  await page.keyboard.press('Delete');
  await stylus.persisted((r) => r?.ops.length === 2);
  for (const p of [page, other]) {
    await expect.poll(() => stylus.style('#second', 'display', p)).toBe('none');
    await expect.poll(() => stylus.style('#third', 'display', p)).toBe('none');
  }
});
