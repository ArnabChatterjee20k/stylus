import { expect, test } from '../fixtures';

test.beforeEach(async ({ stylus }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.toolbarButton('Theme').click();
});

const htmlFilter = (s: { style: (sel: string, p: string) => Promise<string> }) => s.style('html', 'filter');

for (const [label, expected] of [
  ['Dark', 'invert'],
  ['Dim', 'brightness(0.82)'],
  ['Sepia', 'sepia'],
  ['Night', 'hue-rotate(-8deg)'],
  ['Mono', 'grayscale'],
  ['Contrast', 'contrast(1.25)'],
] as const) {
  test(`${label} preset toggles on and off`, async ({ stylus }) => {
    const btn = stylus.ui('.preset').filter({ hasText: label });
    await btn.click();
    await expect(btn).toHaveClass(/on/);
    expect(await htmlFilter(stylus)).toContain(expected);
    await btn.click();
    expect(await htmlFilter(stylus)).toBe('none');
  });
}

test('filter presets stack', async ({ stylus }) => {
  await stylus.ui('.preset').filter({ hasText: 'Sepia' }).click();
  await stylus.ui('.preset').filter({ hasText: 'Dim' }).click();
  const filter = await htmlFilter(stylus);
  expect(filter).toContain('sepia');
  expect(filter).toContain('brightness(0.82)');
});

test('Dark keeps images un-inverted and counter-inverts the Stylus UI', async ({ stylus, page }) => {
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<img id="pic" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'));
  await stylus.ui('.preset').filter({ hasText: 'Dark' }).click();
  expect(await stylus.style('#pic', 'filter')).toContain('invert(1)');
  expect(await page.$eval('stylus-canvas', (h) => (h as HTMLElement).style.filter)).toContain('invert(1)');
});

test('Reading preset improves line length and spacing', async ({ stylus }) => {
  await stylus.ui('.preset').filter({ hasText: 'Reading' }).click();
  expect(await stylus.style('#rich', 'max-width')).toMatch(/px$/);
  expect(Number.parseFloat(await stylus.style('body', 'line-height'))).toBeGreaterThan(20);
});

test('page background, text and link colors', async ({ stylus }) => {
  const theme = stylus.panel('Theme');
  await stylus.setInput(stylus.field(theme, 'Page background').locator('.color-row > input'), '#fdf6e3');
  await stylus.setInput(stylus.field(theme, 'Text').locator('.color-row > input'), '#333333');
  await stylus.setInput(stylus.field(theme, 'Links').locator('.color-row > input'), '#aa00aa');
  expect(await stylus.style('body', 'background-color')).toBe('rgb(253, 246, 227)');
  expect(await stylus.style('body', 'color')).toBe('rgb(51, 51, 51)');
  expect(await stylus.style('#link', 'color')).toBe('rgb(170, 0, 170)');
});

test('font override applies to text but not icons', async ({ stylus, page }) => {
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<i class="icon" id="ic">★</i>'));
  await stylus.field(stylus.panel('Theme'), 'Font').locator('select').selectOption('Verdana');
  expect(await stylus.style('#rich', 'font-family')).toContain('Verdana');
  expect(await stylus.style('#ic', 'font-family')).not.toContain('Verdana');
});

test('zoom scales the page', async ({ stylus }) => {
  await stylus.setInput(stylus.scrub(stylus.panel('Theme'), 'Zoom').locator('input'), '125');
  expect(await stylus.style('body', 'zoom')).toBe('1.25');
});

test('focus mode hides distractions but keeps the content', async ({ stylus }) => {
  await stylus.ui('button').filter({ hasText: 'Focus mode' }).click();
  await expect(stylus.panel('Theme').locator('.hint')).toContainText('Hid');
  for (const sel of ['.cookie-banner', '.header']) expect(await stylus.style(sel, 'display')).toBe('none');
  // An <aside> inside <main>/<article> is treated as content, not chrome.
  for (const sel of ['main', '#first', '#title', 'aside']) expect(await stylus.style(sel, 'display')).not.toBe('none');
  // Running it again doesn't duplicate changes.
  const before = (await stylus.ui('.tb-count').textContent())!;
  await stylus.ui('button').filter({ hasText: 'Focus mode' }).click();
  await expect(stylus.ui('.tb-count')).toHaveText(before);
});
