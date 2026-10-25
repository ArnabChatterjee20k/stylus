import { browser } from 'wxt/browser';
import type { ShotRequest, ShotResult } from '../../../lib/capture-protocol';
import { capturing, notice } from '../engine/store';
import { labelFor } from '../lib/selector';

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

function showNotice(text: string, error = false) {
  notice.value = { text, error };
  setTimeout(() => notice.value?.text === text && (notice.value = null), 5000);
}

/** A brief white flash over what was captured, after the fact, so it never shows in the picture. */
function cameraFlash(r: { left: number; top: number; width: number; height: number } | null) {
  const el = document.createElement('div');
  const box = r ? `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` : 'inset:0;';
  el.style.cssText = `position:fixed;${box}background:#fff;pointer-events:none;z-index:2147483647;border-radius:4px;`;
  document.documentElement.appendChild(el);
  el.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 280, easing: 'ease-out' }).finished.finally(() => el.remove());
}

/**
 * Screenshot an element (or the visible tab when `target` is null) and open it in the editor.
 * Stylus's own UI is hidden for the capture.
 */
export async function takeScreenshot(target: Element | null) {
  if (capturing.value) return;
  capturing.value = true;
  try {
    if (target) {
      // Bring an element that fits on screen fully into view; bigger ones are captured as far as they show.
      const r = target.getBoundingClientRect();
      const fits = r.width <= innerWidth && r.height <= innerHeight;
      const clipped = r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth;
      if (fits && clipped) {
        target.scrollIntoView({ block: 'center', inline: 'center' });
        await new Promise((res) => setTimeout(res, 80));
      }
    }
    await frame();
    await frame();
    const r = target?.getBoundingClientRect();
    const req: ShotRequest = {
      type: 'stylus:shot',
      rect: r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null,
      viewportWidth: innerWidth,
      title: `${document.title || location.host}${target ? ` · ${labelFor(target)}` : ''}`,
    };
    const result = (await browser.runtime.sendMessage(req).catch((e: unknown) => ({ ok: false, error: String(e) }))) as ShotResult;
    if (!result.ok) showNotice(`Couldn’t take the screenshot: ${result.error}`, true);
    else cameraFlash(r ?? null);
  } finally {
    capturing.value = false;
  }
}

export const openCaptures = () => browser.runtime.sendMessage({ type: 'stylus:shot:library' }).catch(() => {});
