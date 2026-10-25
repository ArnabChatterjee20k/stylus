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
