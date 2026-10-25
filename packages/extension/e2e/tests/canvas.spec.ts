import { expect, test } from '../fixtures';

test.describe('edit mode', () => {
  test('toggles the canvas UI on and off, with a badge', async ({ stylus, page }) => {
    await stylus.open();
    await expect(page.locator('stylus-canvas')).toHaveCount(0);
    await stylus.edit();
    await expect(stylus.ui('.toolbar')).toBeVisible();
    expect(await stylus.htmlClasses()).toContain('__stylus-editing');
    await expect.poll(() => stylus.badge()).toBe('ON');

    await stylus.exit();
    expect(await stylus.htmlClasses()).not.toContain('__stylus-editing');
    await expect.poll(() => stylus.badge()).toBe('');
  });

  test('exit button in toolbar leaves edit mode', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.toolbarButton('Exit').click();
    await expect(page.locator('stylus-canvas')).toHaveCount(0);
  });

  test('blocks page clicks, links and shortcuts while editing, restores them after', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await page.click('#btn');
    await page.click('#link');
    expect(await page.evaluate(() => (window as unknown as { clicked: boolean }).clicked)).toBe(false);
    expect(new URL(page.url()).pathname).toBe('/');

    await page.keyboard.press('s'); // a Stylus shortcut: page must not see it
    expect(await page.evaluate(() => (window as unknown as { keys: string[] }).keys)).not.toContain('s');

    await stylus.exit();
    await page.click('#btn');
    expect(await page.evaluate(() => (window as unknown as { clicked: boolean }).clicked)).toBe(true);
  });

  test('hover shows an outline label with tag and size', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await page.hover('#title');
    await expect(stylus.ui('.overlay .label')).toBeVisible();
    await expect(stylus.ui('.overlay .label')).toContainText('h2#title');
    await expect(stylus.ui('.overlay .label')).toContainText('×');
  });
});

test.describe('selection', () => {
  test('click selects, shows breadcrumbs, and breadcrumb click selects an ancestor', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.select('#title');
    await expect(stylus.crumb()).toHaveText('h2#title');
    await expect(stylus.ui('.crumb')).toContainText(['body', 'main', 'article#first', 'h2#title']);
    await stylus.ui('.crumb').filter({ hasText: 'main' }).click();
    await expect(stylus.crumb()).toHaveText('main');
  });

  test('shift-click multi-selects', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.select('#first h2');
    await stylus.page.click('#second h2', { modifiers: ['Shift'] });
    await expect(stylus.ui('.pill')).toHaveText('2 selected');
    await expect(stylus.ui('.overlay .sel')).toHaveCount(2);
  });

  test('keyboard navigation: Esc parent, Enter child, Tab / Shift+Tab siblings', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.select('#title');
    await page.keyboard.press('Escape');
    await expect(stylus.crumb()).toHaveText('article#first');
    await page.keyboard.press('Tab');
    await expect(stylus.crumb()).toHaveText('article#second');
    await page.keyboard.press('Shift+Tab');
    await expect(stylus.crumb()).toHaveText('article#first');
    await page.keyboard.press('Enter');
    await expect(stylus.crumb()).toHaveText('h2#title');
  });

  test('S selects all similar elements; an edit then applies to all of them', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#second');
    await page.keyboard.press('s');
    await expect(stylus.ui('.pill')).toHaveText('3 selected');
    const bg = stylus.field(stylus.panel('Design'), 'Background').locator('.color-row > input');
    await stylus.setInput(bg, '#ffeeaa');
    for (const id of ['#first', '#second', '#third']) expect(await stylus.style(id, 'background-color')).toBe('rgb(255, 238, 170)');
  });

  test('editing the selector bar re-targets the selection', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.select('#title');
    await stylus.setInput(stylus.ui('.selector-bar input'), 'article h2');
    await expect(stylus.ui('.overlay .sel')).toHaveCount(3);
  });
});

test.describe('tools', () => {
  test('Delete hides the selection and selects its parent', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#rich');
    await page.keyboard.press('Delete');
    expect(await stylus.style('#rich', 'display')).toBe('none');
    await expect(stylus.crumb()).toHaveText('article#first');
  });

  test('Zap tool hides whatever you click', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await page.keyboard.press('h');
    await expect(stylus.toolbarButton('Zap')).toHaveClass(/on/);
    await page.click('#second h2');
    await page.click('#third p');
    expect(await stylus.style('#second h2', 'display')).toBe('none');
    expect(await stylus.style('#third p', 'display')).toBe('none');
    await page.keyboard.press('v');
    await expect(stylus.toolbarButton('Select')).toHaveClass(/on/);
  });

  test('double-click edits text; Enter saves', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await page.dblclick('#title');
    await page.keyboard.type('New title');
    await page.keyboard.press('Enter');
    await expect(page.locator('#title')).toHaveText('New title');
    await expect(page.locator('#title')).not.toHaveAttribute('contenteditable');
    await expect(stylus.crumb()).toHaveText('h2#title'); // ids win over text in labels
    await stylus.persisted((r) => !!r?.ops.some((o) => o.kind === 'text'));
  });

  test('breadcrumb label follows a text edit', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await page.dblclick('#second h2');
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Renamed');
    await page.keyboard.press('Enter');
    await expect(stylus.crumb()).toHaveText('h2 “Renamed”');
  });

  test('Esc cancels a text edit without recording a change', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await page.dblclick('#title');
    await page.keyboard.type('Throwaway');
    await page.keyboard.press('Escape');
    await expect(page.locator('#title')).toHaveText('Hello world');
    await expect(stylus.toolbarButton('Changes').locator('.tb-count')).toHaveCount(0);
  });

  test('Text tool edits rich text and keeps inline markup', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await page.keyboard.press('t');
    await page.click('#rich', { position: { x: 3, y: 5 } }); // on the <p>, not the <b>
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await page.keyboard.press('Enter');
    await expect(page.locator('#rich b')).toHaveCount(1);
    await stylus.persisted((r) => !!r?.ops.some((o) => o.kind === 'text'));
    await page.reload();
    await expect(page.locator('#rich')).toContainText('!');
  });

  test('Isolate hides everything except the selection', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#second');
    await stylus.ui('.bb-actions button').filter({ hasText: 'Isolate' }).click();
    expect(await stylus.style('#second', 'display')).not.toBe('none');
    for (const sel of ['#first', '#third', 'aside', '.header', '.cookie-banner']) expect(await stylus.style(sel, 'display')).toBe('none');
  });
});

test.describe('layers', () => {
  test('tree follows the selection and selects on click', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.select('#title');
    await expect(stylus.ui('.layer.on')).toHaveText(/h2#title/);
    await stylus.ui('.layer').filter({ hasText: 'article#second' }).click();
    await expect(stylus.crumb()).toHaveText('article#second');
  });

  test('search works by CSS selector and by name', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    const search = stylus.ui('.layers-search input');
    await search.fill('article.card');
    await expect(stylus.ui('.layer')).toHaveCount(3);
    await search.fill('sidebar');
    await expect(stylus.ui('.layer')).toHaveCount(1);
    await expect(stylus.ui('.layer')).toHaveText(/aside\.sidebar/);
    await search.fill('zzz-nothing');
    await expect(stylus.ui('.layers .empty')).toBeVisible();
  });

  test('eye toggle hides and un-hides', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.ui('.layers-search input').fill('aside');
    const row = stylus.ui('.layer').first();
    await row.hover();
    await row.locator('.eye').click();
    expect(await stylus.style('aside', 'display')).toBe('none');
    await expect(row).toHaveClass(/hidden/);
    await row.locator('.eye').click();
    expect(await stylus.style('aside', 'display')).not.toBe('none');
  });
});
