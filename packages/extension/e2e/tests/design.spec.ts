import { expect, test } from '../fixtures';

test.beforeEach(async ({ stylus }) => {
  await stylus.open();
  await stylus.edit();
});

test('empty state until something is selected', async ({ stylus }) => {
  await expect(stylus.panel('Design').locator('.empty')).toContainText('Select an element');
});

test('shows computed values of the selection', async ({ stylus }) => {
  await stylus.select('#title');
  const design = stylus.panel('Design');
  await expect(stylus.field(design, 'Font').locator('select')).toHaveValue('Georgia');
  await expect(stylus.scrub(design, 'Size').locator('input')).toHaveValue('24px');
  await expect(stylus.field(design, 'Weight').locator('select')).toHaveValue('700');
});

test('typography: size, weight, color, align, case', async ({ stylus }) => {
  await stylus.select('#title');
  const design = stylus.panel('Design');
  await stylus.setInput(stylus.scrub(design, 'Size').locator('input'), '40');
  await stylus.field(design, 'Weight').locator('select').selectOption('300');
  await stylus.setInput(stylus.field(design, 'Color').first().locator('.color-row > input'), '#ff0000');
  await design.locator('.segmented button[title="center"]').click();
  await stylus.field(design, 'Case').locator('select').selectOption('uppercase');

  expect(await stylus.style('#title', 'font-size')).toBe('40px');
  expect(await stylus.style('#title', 'font-weight')).toBe('300');
  expect(await stylus.style('#title', 'color')).toBe('rgb(255, 0, 0)');
  expect(await stylus.style('#title', 'text-align')).toBe('center');
  expect(await stylus.style('#title', 'text-transform')).toBe('uppercase');
});

test('arrow keys step a number field; Shift steps by 10', async ({ stylus }) => {
  await stylus.select('#title');
  const input = stylus.scrub(stylus.panel('Design'), 'Size').locator('input');
  await input.focus();
  await input.press('ArrowUp');
  expect(await stylus.style('#title', 'font-size')).toBe('25px');
  await input.press('Shift+ArrowUp');
  expect(await stylus.style('#title', 'font-size')).toBe('35px');
});

test('dragging a field label scrubs the value and undoes in one step', async ({ stylus, page }) => {
  await stylus.select('#title');
  const label = stylus.scrub(stylus.panel('Design'), 'Size').locator('.scrub-label');
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 4, box.y + box.height / 2);
  await page.mouse.up();
  expect(await stylus.style('#title', 'font-size')).toBe('44px'); // 40px of drag / 2 = +20
  await page.keyboard.press('Meta+z');
  expect(await stylus.style('#title', 'font-size')).toBe('24px');
});

test('layout: switching to flex reveals flex controls; align grid sets justify/align', async ({ stylus }) => {
  await stylus.pick('#first');
  const design = stylus.panel('Design');
  await expect(design.locator('.aligngrid')).toHaveCount(0);
  await stylus.field(design, 'Display').locator('select').selectOption('flex');
  await expect(design.locator('.aligngrid')).toBeVisible();
  await design.locator('.aligngrid button').nth(8).click(); // bottom-right in a row
  expect(await stylus.style('#first', 'justify-content')).toBe('flex-end');
  expect(await stylus.style('#first', 'align-items')).toBe('flex-end');
  await design.locator('.segmented button[title="Column"]').click();
  expect(await stylus.style('#first', 'flex-direction')).toBe('column');
  await stylus.setInput(stylus.scrub(design, 'Gap').locator('input'), '12');
  expect(await stylus.style('#first', 'row-gap')).toBe('12px');
});

test('position: non-static reveals offsets', async ({ stylus }) => {
  await stylus.select('#title');
  const design = stylus.panel('Design');
  await expect(stylus.scrub(design, 'T')).toHaveCount(0);
  await stylus.field(design, 'Position').locator('select').selectOption('relative');
  await stylus.setInput(stylus.scrub(design, 'T').locator('input'), '10');
  expect(await stylus.style('#title', 'top')).toBe('10px');
});

test('size: W/H fields and Fill / Hug / Reset shortcuts', async ({ stylus }) => {
  await stylus.select('#title');
  const design = stylus.panel('Design');
  await stylus.setInput(stylus.scrub(design, 'W').locator('input'), '150');
  expect(await stylus.style('#title', 'width')).toBe('150px');
  await design.locator('.mini-actions button', { hasText: 'Hug' }).click();
  expect(await stylus.page.$eval('#title', (el) => el.getBoundingClientRect().width)).toBeLessThan(150);
  await design.locator('.mini-actions button', { hasText: 'Reset' }).click();
  await design.locator('.mini-actions button', { hasText: 'Fill' }).click();
  const [w, parent] = await stylus.page.$eval('#title', (el) => {
    const p = getComputedStyle(el.parentElement!);
    return [el.getBoundingClientRect().width, el.parentElement!.clientWidth - parseFloat(p.paddingLeft) - parseFloat(p.paddingRight)];
  });
  expect(Math.round(w)).toBe(Math.round(parent));
});

test('box model edits margin and padding on each side', async ({ stylus }) => {
  await stylus.pick('#first');
  const bm = stylus.panel('Design').locator('.boxmodel');
  await stylus.setInput(bm.locator(':scope > .bm-left'), '7');
  await stylus.setInput(bm.locator('.bm-padding > .bm-right'), '33');
  expect(await stylus.style('#first', 'margin-left')).toBe('7px');
  expect(await stylus.style('#first', 'padding-right')).toBe('33px');
});

test('fill, border and effects', async ({ stylus }) => {
  await stylus.pick('#second');
  const design = stylus.panel('Design');
  await stylus.setInput(stylus.field(design, 'Background').locator('.color-row > input'), '#000000');
  await stylus.setInput(stylus.scrub(design, 'Opacity').locator('input'), '0.5');
  await stylus.field(design, 'Style').locator('select').selectOption('dashed');
  await stylus.setInput(stylus.scrub(design, 'Radius').locator('input'), '20');
  await stylus.field(design, 'Shadow').locator('select').selectOption({ label: 'M' });
  await stylus.setInput(stylus.scrub(design, 'Blur').locator('input'), '2');

  expect(await stylus.style('#second', 'background-color')).toBe('rgb(0, 0, 0)');
  expect(await stylus.style('#second', 'opacity')).toBe('0.5');
  expect(await stylus.style('#second', 'border-top-style')).toBe('dashed');
  expect(await stylus.style('#second', 'border-top-left-radius')).toBe('20px');
  expect(await stylus.style('#second', 'box-shadow')).not.toBe('none');
  expect(await stylus.style('#second', 'filter')).toBe('blur(2px)');
});

test('page colors palette offers swatches from the page', async ({ stylus }) => {
  await stylus.pick('#second');
  const bg = stylus.field(stylus.panel('Design'), 'Background');
  await bg.locator('button[title="Page colors"]').click();
  const chip = bg.locator('.palette .chip[title="#1a73e8"]');
  await expect(chip).toBeVisible();
  await chip.click();
  expect(await stylus.style('#second', 'background-color')).toBe('rgb(26, 115, 232)');
});

test('CSS tab: per-element CSS and whole-site CSS', async ({ stylus, page }) => {
  await stylus.select('#title');
  const design = stylus.panel('Design');
  await design.locator('.panel-actions .segmented button', { hasText: 'CSS' }).click();
  const [el, site] = [design.locator('textarea.code').nth(0), design.locator('textarea.code').nth(1)];
  await el.fill('color: rgb(1, 2, 3);\nletter-spacing: 3px;');
  await el.press('Meta+Enter');
  expect(await stylus.style('#title', 'color')).toBe('rgb(1, 2, 3)');
  expect(await stylus.style('#title', 'letter-spacing')).toBe('3px');

  // Removing a line removes that property.
  await el.fill('color: rgb(1, 2, 3);');
  await el.press('Meta+Enter');
  expect(await stylus.style('#title', 'letter-spacing')).toBe('normal');

  await site.fill('p { text-decoration: underline; }');
  expect(await page.$eval('#rich', (e) => getComputedStyle(e).textDecorationLine)).toBe('underline');
});

test(':hover scope styles the hover state (forced while editing)', async ({ stylus, page }) => {
  await stylus.pick('#second');
  await stylus.ui('.bb-scope select').first().selectOption('hover');
  await stylus.setInput(stylus.field(stylus.panel('Design'), 'Background').locator('.color-row > input'), '#00ff00');
  // Forced on the selection while styling…
  expect(await stylus.style('#second', 'background-color')).toBe('rgb(0, 255, 0)');
  await stylus.exit();
  // …and only on real hover afterwards.
  await page.mouse.move(5, 5);
  expect(await stylus.style('#second', 'background-color')).not.toBe('rgb(0, 255, 0)');
  await page.hover('#second');
  expect(await stylus.style('#second', 'background-color')).toBe('rgb(0, 255, 0)');
});

test('breakpoint scope only applies at matching widths', async ({ stylus, page }) => {
  await stylus.select('#title');
  await stylus.ui('.bb-scope select').nth(1).selectOption('(max-width: 768px)');
  await stylus.setInput(stylus.scrub(stylus.panel('Design'), 'Size').locator('input'), '12');
  expect(await stylus.style('#title', 'font-size')).toBe('24px'); // desktop viewport
  await page.setViewportSize({ width: 600, height: 800 });
  expect(await stylus.style('#title', 'font-size')).toBe('12px');
});
