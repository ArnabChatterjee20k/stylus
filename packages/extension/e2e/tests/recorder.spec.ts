import type { BrowserContext, Page } from '@playwright/test';
import { downloadCount, expect, lastDownload, test, type Stylus } from '../fixtures';

/**
 * The recorder, end to end: real chrome.tabCapture → offscreen MediaRecorder → IndexedDB → library
 * page. Assertions look at the saved video itself (size, pixels), not just the UI.
 */

test.slow();

async function paintCard(page: Page) {
  // A solid, known color makes the recorded pixels easy to check.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('#second')!;
    el.style.background = 'rgb(220, 20, 60)';
    el.style.minHeight = '220px';
  });
}

async function waitForRecording(stylus: Stylus) {
  await expect(stylus.ui('.rec-count')).toBeVisible();
  await expect(stylus.ui('.rec-countdown')).toHaveCount(0, { timeout: 6000 });
  await expect.poll(() => stylus.badge(), { timeout: 5000 }).toBe('REC');
}

/** Stop, and return the library page that opens with the new recording. */
async function stopAndOpenLibrary(context: BrowserContext, stop: () => Promise<unknown>) {
  const opened = context.waitForEvent('page', { timeout: 15000 });
  await stop();
  const library = await opened;
  await library.waitForLoadState();
  await expect(library.locator('.item')).toHaveCount(1, { timeout: 10000 });
  return library;
}

/** Load the selected recording's video and read its size and the color at its center. */
async function inspectVideo(library: Page) {
  return library.evaluate(async () => {
    const video = document.querySelector('video')!;
    const waitFor = (ev: string) =>
      new Promise<boolean>((r) => {
        video.addEventListener(ev, () => r(true), { once: true });
        setTimeout(() => r(false), 8000);
      });
    if (video.readyState < 2 && !(await waitFor('loadeddata'))) throw new Error(`no frame decoded (readyState ${video.readyState})`);
    video.pause();
    video.currentTime = Math.min(0.6, Number.isFinite(video.duration) ? video.duration / 2 : 0.6);
    if (!(await waitFor('seeked'))) throw new Error(`seek never finished (readyState ${video.readyState}, duration ${video.duration})`);
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const [r, g, b] = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.75), 1, 1).data;
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, center: [r, g, b] };
  });
}

test('records the selected element with a visible cursor, clicks and keys', async ({ stylus, page, context }) => {
  await stylus.open();
  await paintCard(page);
  await stylus.edit();
  await stylus.pick('#second');
  const box = (await page.locator('#second').boundingBox())!;

  await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
  await expect(stylus.ui('.rec-hint')).toContainText('article#second');
  await expect(stylus.ui('.rec-target')).toBeVisible();
  await waitForRecording(stylus);

  // Editing UI is gone; the page is usable; our cursor, ripples and keys show.
  await expect(stylus.ui('.toolbar')).toHaveCount(0);
  await page.mouse.move(box.x + 40, box.y + 60, { steps: 8 });
  await expect.poll(() => stylus.ui('.rec-cursor').evaluate((n) => (n as HTMLElement).style.transform)).toContain(`${Math.round(box.x + 40)}`);
  await page.locator('#btn').click();
  expect(await page.evaluate(() => (window as unknown as { clicked: boolean }).clicked)).toBe(true);
  await page.mouse.click(box.x + 40, box.y + 60);
  await expect(stylus.ui('.rec-ripple').first()).toBeAttached();
  await page.keyboard.type('hi');
  await expect(stylus.ui('.rec-keys')).toHaveText('hi');
  await page.keyboard.press('Meta+k');
  await expect(stylus.ui('.rec-keys')).toHaveText('⌘K');

  // The controls sit outside the recorded area.
  const pill = (await stylus.ui('.rec-pill').boundingBox())!;
  const overlaps = pill.x < box.x + box.width && pill.x + pill.width > box.x && pill.y < box.y + box.height && pill.y + pill.height > box.y;
  expect(overlaps).toBe(false);

  await page.waitForTimeout(1200);
  const library = await stopAndOpenLibrary(context, () => stylus.ui('.rec-btn.stop').click());
  expect(library.url()).toMatch(/recordings\.html#rec_/);

  // Back to editing in the original tab.
  await expect(stylus.ui('.toolbar')).toBeVisible();
  await expect.poll(() => stylus.badge()).toBe('ON');

  // The video is the card: its aspect ratio, and its pixels are the card's red.
  const v = await inspectVideo(library);
  expect(Math.abs(v.width / v.height - box.width / box.height)).toBeLessThan(0.05);
  const [r, g, b] = v.center;
  expect(r).toBeGreaterThan(170);
  expect(g).toBeLessThan(80);
  expect(b).toBeLessThan(110);

  await expect(library.locator('.title')).toHaveValue(/article#second/);

  // Download saves a real video file and frees the space in Stylus.
  const before = await downloadCount(library);
  await library.locator('.button.primary', { hasText: /Download (MP4|WEBM)/ }).click();
  await expect.poll(() => downloadCount(library)).toBe(before + 1);
  const file = await lastDownload(library);
  expect(file.size).toBeGreaterThan(1000);
  expect(file.mime).toMatch(/^video\//);
  await expect(library.locator('.status')).toHaveText('Saved to Downloads and removed from Stylus.');
  await expect(library.locator('.empty')).toBeVisible();
});

test('records the whole tab and stops from the toolbar icon / shortcut', async ({ stylus, page, context }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.ui('.tb-btn.rec').click();
  await stylus.ui('.rec-menu button').filter({ hasText: 'Record whole tab' }).click();
  await expect(stylus.ui('.rec-hint')).toContainText('the whole tab');
  await waitForRecording(stylus);
  await expect(stylus.ui('.rec-pill')).toBeHidden(); // would be in the video
  await page.waitForTimeout(1000);

  const library = await stopAndOpenLibrary(context, () => stylus.toggle()); // what the icon and Alt+Shift+S send
  const v = await inspectVideo(library);
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  expect(Math.abs(v.width / v.height - vw / 800)).toBeLessThan(0.05);
  // A still page must still produce real frames (tab capture only sends frames on repaint).
  expect(Math.min(...v.center)).toBeGreaterThan(200);
});

test('Esc during the countdown cancels without recording', async ({ stylus, page, context }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('#second');
  await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
  await expect(stylus.ui('.rec-count')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(stylus.ui('.rec-layer')).toHaveCount(0);
  await expect(stylus.ui('.toolbar')).toBeVisible();
  await page.waitForTimeout(3500);
  expect(context.pages()).toHaveLength(1);
  await expect.poll(() => stylus.badge()).toBe('ON');
});

test('discarding a recording saves nothing', async ({ stylus, context }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('#second');
  await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
  await waitForRecording(stylus);
  await stylus.ui('.rec-btn[title="Discard recording"]').click();
  await expect(stylus.ui('.toolbar')).toBeVisible();

  const opened = context.waitForEvent('page');
  await stylus.ui('.tb-btn.rec').click();
  await stylus.ui('.rec-menu button').filter({ hasText: 'Open recordings' }).click();
  const library = await opened;
  await expect(library.locator('.empty')).toContainText('No recordings yet');
});

test('pause stops the clock and is left out of the duration', async ({ stylus, page, context }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('#second');
  await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
  await waitForRecording(stylus);
  await page.waitForTimeout(1000);
  await stylus.ui('.rec-btn').filter({ hasText: 'Pause' }).click();
  await expect(stylus.ui('.rec-dot.paused')).toBeVisible();
  const frozen = await stylus.ui('.rec-time').textContent();
  await page.waitForTimeout(2200);
  await expect(stylus.ui('.rec-time')).toHaveText(frozen!);
  await stylus.ui('.rec-btn').filter({ hasText: 'Resume' }).click();
  await page.waitForTimeout(800);
  const library = await stopAndOpenLibrary(context, () => stylus.ui('.rec-btn.stop').click());
  const meta = await library.locator('.meta').textContent();
  const [m, s] = meta!.split(' · ')[0].split(':').map(Number);
  expect(m * 60 + s).toBeLessThanOrEqual(3); // ~1.8s recorded, not ~4s wall time
});

test('Record selected element is disabled until something is selected', async ({ stylus }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.ui('.tb-btn.rec').click();
  await expect(stylus.ui('.rec-menu button').filter({ hasText: 'Record selected element' })).toBeDisabled();
  await expect(stylus.ui('.rec-menu small').first()).toHaveText('Select an element first');
});

test('library: rename and delete a recording', async ({ stylus, context }) => {
  await stylus.open();
  await stylus.edit();
  await stylus.pick('#second');
  await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
  await waitForRecording(stylus);
  const library = await stopAndOpenLibrary(context, () => stylus.ui('.rec-btn.stop').click());

  const title = library.locator('.title');
  await title.click();
  await title.press('Meta+a');
  await title.pressSequentially('Card hover demo');
  await title.press('Enter');
  await expect(library.locator('.item-title')).toHaveText('Card hover demo');
  await library.reload();
  await expect(library.locator('.item-title')).toHaveText('Card hover demo');

  await library.locator('.actions .button', { hasText: 'Delete' }).click();
  await expect(library.locator('.confirm')).toContainText('Delete this recording?');
  await library.locator('.confirm .button.danger').click();
  await expect(library.locator('.empty')).toBeVisible();
});

/** Read the recorder's IndexedDB from an extension page. */
async function readStore(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ sessions: { id: string; chunks: number; size: number; durationMs: number }[]; chunks: number; recordings: number }>((resolve, reject) => {
        const req = indexedDB.open('stylus-recordings');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const t = db.transaction(['sessions', 'chunks', 'recordings'], 'readonly');
          const s = t.objectStore('sessions').getAll();
          const c = t.objectStore('chunks').count();
          const r = t.objectStore('recordings').count();
          t.oncomplete = () => {
            db.close();
            resolve({ sessions: s.result, chunks: c.result, recordings: r.result });
          };
        };
      }),
  );
}

test.describe('crash safety', () => {
  test('chunks are written to disk while recording, and cleaned up after stop', async ({ stylus, page, context }) => {
    await stylus.open();
    await paintCard(page);
    await stylus.edit();
    await stylus.pick('#second');
    await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
    await waitForRecording(stylus);
    await page.mouse.move(400, 300, { steps: 30 });
    await page.waitForTimeout(2500);

    // Opening the library mid-recording must not "recover" the live session.
    const peek = await context.newPage();
    await peek.goto(`chrome-extension://${(await stylus.sw.evaluate(() => chrome.runtime.id))}/recordings.html`);
    await expect(peek.locator('.empty')).toBeVisible();
    // Chunks keep landing on disk while the recording runs (about one a second).
    await expect.poll(async () => (await readStore(peek)).sessions[0]?.chunks ?? 0, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    const live = await readStore(peek);
    expect(live.sessions).toHaveLength(1);
    expect(live.sessions[0].size).toBeGreaterThan(0);
    expect(live.chunks).toBe(live.sessions[0].chunks);
    await peek.close();

    await page.bringToFront();
    const library = await stopAndOpenLibrary(context, () => stylus.ui('.rec-btn.stop').click());
    expect(await readStore(library)).toMatchObject({ sessions: [], chunks: 0, recordings: 1 });
  });

  test('a recording survives the recorder dying mid-way', async ({ stylus, page, context, sw }) => {
    await stylus.open();
    await paintCard(page);
    await stylus.edit();
    await stylus.pick('#second');
    await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
    await waitForRecording(stylus);
    // Keep the page moving until a few chunks are on disk, then simulate a crash: the recorder
    // document disappears without stopping cleanly.
    const peek = await context.newPage();
    await peek.goto(`chrome-extension://${await sw.evaluate(() => chrome.runtime.id)}/recordings.html`);
    await page.bringToFront();
    await expect
      .poll(
        async () => {
          await page.mouse.move(200 + Math.random() * 400, 300, { steps: 10 });
          return (await readStore(peek)).sessions[0]?.chunks ?? 0;
        },
        { timeout: 20000 },
      )
      .toBeGreaterThanOrEqual(3);
    await peek.close();
    await sw.evaluate(() => chrome.offscreen.closeDocument());

    const library = await stopAndOpenLibrary(context, () => stylus.ui('.rec-btn.stop').click());
    await expect(library.locator('.tag')).toHaveText('Recovered');
    await expect(library.locator('.item-title')).toHaveText(/^Recovered · /);
    const v = await inspectVideo(library);
    expect(v.duration).toBeGreaterThan(1);
    expect(v.center[0]).toBeGreaterThan(170); // the card's red, so real frames were kept
    expect(await readStore(library)).toMatchObject({ sessions: [], chunks: 0, recordings: 1 });
    await expect(stylus.ui('.toolbar')).toBeVisible(); // the tab returns to editing
  });

  test('a session with no video yet is dropped, not listed as a broken recording', async ({ stylus, context, sw }) => {
    await stylus.open();
    await stylus.edit();
    // A crash right after starting leaves only the file header on disk.
    const lib = await context.newPage();
    await lib.goto(`chrome-extension://${await sw.evaluate(() => chrome.runtime.id)}/offscreen.html`);
    await lib.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const req = indexedDB.open('stylus-recordings', 2);
          req.onupgradeneeded = () => {
            const db = req.result;
            db.createObjectStore('recordings', { keyPath: 'id' });
            db.createObjectStore('sessions', { keyPath: 'id' });
            db.createObjectStore('chunks', { keyPath: ['session', 'seq'] });
          };
          req.onsuccess = () => {
            const t = req.result.transaction(['sessions', 'chunks'], 'readwrite');
            t.objectStore('sessions').put({ id: 'rec_header_only', title: 'x', url: '', createdAt: 1, durationMs: 0, width: 0, height: 0, mime: 'video/mp4', chunks: 1, size: 10 });
            t.objectStore('chunks').put({ session: 'rec_header_only', seq: 0, data: new Blob(['0123456789']) });
            t.oncomplete = () => resolve();
          };
        }),
    );
    await lib.goto(lib.url().replace('offscreen.html', 'recordings.html'));
    await expect(lib.locator('.empty')).toBeVisible();
    expect(await readStore(lib)).toMatchObject({ sessions: [], chunks: 0, recordings: 0 });
  });

  test('discarding removes the chunks already written', async ({ stylus, page, context }) => {
    await stylus.open();
    await stylus.edit();
    await stylus.pick('#second');
    await stylus.ui('.bb-actions button').filter({ hasText: 'Record' }).click();
    await waitForRecording(stylus);
    await page.mouse.move(400, 300, { steps: 30 });
    await page.waitForTimeout(2200);
    await stylus.ui('.rec-btn[title="Discard recording"]').click();
    await expect(stylus.ui('.toolbar')).toBeVisible();
    const peek = await context.newPage();
    await peek.goto(`chrome-extension://${(await stylus.sw.evaluate(() => chrome.runtime.id))}/recordings.html`);
    await expect.poll(async () => readStore(peek)).toMatchObject({ sessions: [], chunks: 0, recordings: 0 });
  });
});
