import type { Page } from '@playwright/test';
import { expect, test, type Stylus } from '../fixtures';

/** Drag a canvas handle by (dx, dy) with real mouse events. */
async function dragHandle(stylus: Stylus, kind: string, dx: number, dy: number, opts: { alt?: boolean; shift?: boolean } = {}) {
  const box = (await stylus.ui(`.handle[data-handle="${kind}"]`).boundingBox())!;
  await drag(stylus.page, box.x + box.width / 2, box.y + box.height / 2, dx, dy, opts);
}

async function drag(page: Page, x: number, y: number, dx: number, dy: number, opts: { alt?: boolean; shift?: boolean } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (opts.alt) await page.keyboard.down('Alt');
  if (opts.shift) await page.keyboard.down('Shift');
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
  if (opts.shift) await page.keyboard.up('Shift');
}

const num = async (stylus: Stylus, sel: string, prop: string) => Number.parseFloat(await stylus.style(sel, prop));

test.describe('handles', () => {
  test.beforeEach(async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#second');
  });

  test('show for a single selection and hide for multi-select', async ({ stylus, page }) => {
    await expect(stylus.ui('.handle[data-handle="e"]')).toBeVisible();
    await expect(stylus.ui('.handle[data-handle="pad-top"]')).toBeVisible();
    await page.click('#third h2', { modifiers: ['Shift'] });
    await expect(stylus.ui('.handle[data-handle="e"]')).toBeHidden();
  });

  test('right edge resizes width, fixing the size of a flex item; one drag is one undo step', async ({ stylus, page }) => {
    const w0 = await num(stylus, '#second', 'width');
    await dragHandle(stylus, 'e', 40, 0);
    expect(await num(stylus, '#second', 'width')).toBe(Math.round(w0 + 40));
    expect(await stylus.style('#second', 'flex-grow')).toBe('0');
    await page.keyboard.press('Meta+z');
    expect(await num(stylus, '#second', 'width')).toBe(w0);
    expect(await stylus.style('#second', 'flex-grow')).toBe('1');
  });

  test('bottom edge and corner resize height (and width)', async ({ stylus }) => {
    const [w0, h0] = [await num(stylus, '#second', 'width'), await num(stylus, '#second', 'height')];
    await dragHandle(stylus, 's', 0, 30);
    expect(await num(stylus, '#second', 'height')).toBe(Math.round(h0 + 30)); // handles snap to whole pixels
    await dragHandle(stylus, 'se', 20, 10);
    expect(await num(stylus, '#second', 'width')).toBe(Math.round(w0 + 20));
    expect(await num(stylus, '#second', 'height')).toBe(Math.round(h0 + 30) + 10);
  });

  test('a size label follows the pointer while dragging', async ({ stylus, page }) => {
    const box = (await stylus.ui('.handle[data-handle="e"]').boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + 9);
    await page.mouse.down();
    await page.mouse.move(box.x + 23, box.y + 9);
    await expect(stylus.ui('.drag-label')).toHaveText(/^W \d+$/);
    await page.mouse.up();
    await expect(stylus.ui('.drag-label')).toBeHidden();
  });

  test('padding handles change one side, or all sides with Alt', async ({ stylus }) => {
    await dragHandle(stylus, 'pad-top', 0, 12);
    expect(await stylus.style('#second', 'padding-top')).toBe('28px');
    expect(await stylus.style('#second', 'padding-left')).toBe('16px');
    await dragHandle(stylus, 'pad-right', -10, 0, { alt: true });
    for (const side of ['top', 'right', 'bottom', 'left']) expect(await stylus.style('#second', `padding-${side}`)).toBe('26px');
  });

  test('margin handles push the element away from its neighbours', async ({ stylus }) => {
    await dragHandle(stylus, 'mar-top', 0, -20);
    expect(await stylus.style('#second', 'margin-top')).toBe('20px');
  });

  test('radius handle rounds the corners', async ({ stylus }) => {
    await dragHandle(stylus, 'radius', 12, 12);
    expect(await stylus.style('#second', 'border-top-left-radius')).toBe('20px');
  });

  test('Shift snaps handle drags to 8px steps', async ({ stylus }) => {
    const w0 = await num(stylus, '#second', 'width');
    await dragHandle(stylus, 'e', 13, 0, { shift: true });
    expect((await num(stylus, '#second', 'width')) % 8).toBe(0);
    expect(Math.abs((await num(stylus, '#second', 'width')) - (w0 + 13))).toBeLessThanOrEqual(4);
  });
});

const order = (page: Page) => page.$$eval('main > *', (els) => els.map((e) => e.id || e.localName));
const center = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};

test.describe('nudge', () => {
  test('arrow keys move the selection by 1px, Shift by 10px, and undo as one step', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#second');
    const before = (await page.locator('#second').boundingBox())!;
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const after = (await page.locator('#second').boundingBox())!;
    expect(Math.round(after.x - before.x)).toBe(3);
    expect(Math.round(after.y - before.y)).toBe(10);
    // Layout of neighbours is untouched (translate, not margin).
    expect(await order(page)).toEqual(['first', 'second', 'third', 'aside']);
    await page.keyboard.press('Meta+z');
    expect(await stylus.style('#second', 'translate')).toBe('none');
  });
});

test.describe('inline elements', () => {
  test('arrow keys move an inline element', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#link');
    const before = (await page.locator('#link').boundingBox())!;
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('ArrowDown');
    const after = (await page.locator('#link').boundingBox())!;
    expect(Math.round(after.x - before.x)).toBe(10);
    expect(Math.round(after.y - before.y)).toBe(1);
  });

  test('resizing an inline element makes it inline-block and grows it from its real size', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#link');
    const w0 = (await page.locator('#link').boundingBox())!.width;
    await dragHandle(stylus, 'e', 30, 0);
    expect(await stylus.style('#link', 'display')).toBe('inline-block');
    expect(Math.round((await page.locator('#link').boundingBox())!.width)).toBe(Math.round(w0 + 30));
  });
});

test.describe('reorder', () => {
  test('dragging the selection past a sibling moves it there, and persists', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#first');
    const from = await center(page, '#first');
    const to = await center(page, '#second');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.b.x + to.b.width - 5 - from.x) * i) / 10, from.y);
    await expect(stylus.ui('.drop-line')).toBeVisible();
    await page.mouse.up();
    await expect(stylus.ui('.drop-line')).toBeHidden();
    expect(await order(page)).toEqual(['second', 'first', 'third', 'aside']);
    await expect(stylus.crumb()).toHaveText('article#first'); // the drop didn't re-select

    await stylus.persisted((r) => !!r?.ops.some((o) => o.kind === 'move'));
    await page.reload();
    await page.waitForFunction(() => !!document.getElementById('__stylus-style'));
    expect(await order(page)).toEqual(['second', 'first', 'third', 'aside']);
  });

  test('moving the same element again updates one move, and undo restores the order', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#first');
    for (const target of ['#second', '#third']) {
      const from = await center(page, '#first');
      const to = await center(page, target);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.b.x + to.b.width - 5 - from.x) * i) / 10, from.y);
      await page.mouse.up();
    }
    expect(await order(page)).toEqual(['second', 'third', 'first', 'aside']);
    await stylus.toolbarButton('Changes').click();
    await expect(stylus.ui('.changes li')).toHaveCount(1);
    await expect(stylus.ui('.changes li')).toContainText('Moved');
    await page.keyboard.press('Meta+z');
    expect(await order(page)).toEqual(['second', 'first', 'third', 'aside']);
    await page.keyboard.press('Meta+z');
    expect(await order(page)).toEqual(['first', 'second', 'third', 'aside']);
  });

  test('the first click after a drop still works', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#first');
    const from = await center(page, '#first');
    const to = await center(page, '#second');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.b.x + to.b.width - 5, from.y, { steps: 10 });
    await page.mouse.up();
    const third = (await page.locator('#third').boundingBox())!;
    await page.mouse.click(third.x + 6, third.y + 6);
    await expect(stylus.crumb()).toHaveText('article#third');
  });

  test('a small wobble while clicking does not move anything', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#first');
    const c = await center(page, '#first');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 2, c.y + 1);
    await page.mouse.up();
    expect(await order(page)).toEqual(['first', 'second', 'third', 'aside']);
  });
});

test.describe('measure and layout guides', () => {
  test('holding Alt shows the distance to the hovered element', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#second');
    const third = (await page.locator('#third').boundingBox())!;
    await page.keyboard.down('Alt');
    // Inside the card's padding, so the hovered element is the card itself, not its text.
    await page.mouse.move(third.x + 6, third.y + third.height - 6);
    await page.mouse.move(third.x + 7, third.y + third.height - 6);
    await expect(stylus.ui('.m-line')).toHaveCount(1);
    await expect(stylus.ui('.m-label')).toHaveText('16'); // the flex gap
    await page.keyboard.up('Alt');
    await expect(stylus.ui('.m-line')).toHaveCount(0);
  });

  test('Alt over a parent shows the distance to each of its edges', async ({ stylus, page }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#title');
    const card = (await page.locator('#first').boundingBox())!;
    await page.keyboard.down('Alt');
    await page.mouse.move(card.x + 4, card.y + card.height - 4);
    await page.mouse.move(card.x + 5, card.y + card.height - 4);
    await expect(stylus.ui('.m-line')).toHaveCount(4);
    await page.keyboard.up('Alt');
  });

  test('a selected flex container shows its children and gaps', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('main');
    await expect(stylus.ui('.g-kid')).toHaveCount(4);
    await expect(stylus.ui('.g-gap')).toHaveCount(3);
  });

  test('a grid container shows its column tracks', async ({ stylus }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('main');
    const design = stylus.panel('Design');
    await stylus.field(design, 'Display').locator('select').selectOption('grid');
    await stylus.setInput(stylus.field(design, 'Columns').locator('input'), '1fr 1fr');
    await expect.poll(() => stylus.ui('.g-track').count()).toBeGreaterThan(3);
  });
});
