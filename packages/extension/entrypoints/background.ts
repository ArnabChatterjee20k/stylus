import { browser } from 'wxt/browser';
import { defineBackground } from '#imports';
import { RECORDINGS_PAGE, type OffscreenControl, type RecControlRequest, type RecResult, type RecStartRequest } from '../lib/recorder-protocol';

export default defineBackground(() => {
  const toggle = async (tabId?: number) => {
    if (tabId === undefined) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: 'stylus:toggle' });
    } catch {
      // No content script here (chrome:// pages, the Web Store, or a tab opened before install).
      await browser.action.setBadgeText({ tabId, text: '✕' });
      await browser.action.setTitle({ tabId, title: 'Stylus can’t run on this page. Reload the tab if it was open before installing.' });
    }
  };

  browser.action.onClicked.addListener((tab) => toggle(tab.id));

  // Right-click menu: act on the element under the pointer without opening edit mode first.
  const MENU = [
    { id: 'stylus-hide', title: 'Hide this element', action: 'hide' },
    { id: 'stylus-text', title: 'Edit this text', action: 'text' },
    { id: 'stylus-style', title: 'Style this element…', action: 'style' },
  ] as const;

  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: 'stylus', title: 'Stylus', contexts: ['page', 'selection', 'link', 'image', 'video'] });
    for (const item of MENU) {
      browser.contextMenus.create({ id: item.id, parentId: 'stylus', title: item.title, contexts: ['page', 'selection', 'link', 'image', 'video'] });
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const item = MENU.find((m) => m.id === info.menuItemId);
    if (!item || tab?.id === undefined) return;
    browser.tabs.sendMessage(tab.id, { type: 'stylus:context', action: item.action }, { frameId: 0 }).catch(() => {});
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'toggle-edit') return;
    const id = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    await toggle(id);
  });

  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    const m = msg as { type?: string; editing?: boolean; recording?: boolean; count?: number };
    const tabId = sender.tab?.id;
    if (m?.type !== 'stylus:status' || tabId === undefined) return;
    const [text, color] = m.recording ? ['REC', '#e5383b'] : m.editing ? ['ON', '#0d99ff'] : [m.count ? String(m.count) : '', '#5b5b5b'];
    void browser.action.setBadgeBackgroundColor({ tabId, color });
    void browser.action.setBadgeText({ tabId, text });
  });

  // Recording: the tab's video stream can only be consumed by a document, so an offscreen page records it.
  const OFFSCREEN = '/offscreen.html';
  const ensureOffscreen = async () => {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Record the selected area of the tab',
    });
  };
  const toOffscreen = (msg: Omit<OffscreenControl, 'target'> | Record<string, unknown>) =>
    browser.runtime.sendMessage({ ...msg, target: 'offscreen' }) as Promise<RecResult>;

  async function startRecording(req: RecStartRequest, tab: chrome.tabs.Tab): Promise<RecResult> {
    let streamId: string;
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: /invoked/i.test(why) ? 'Chrome needs you to open Stylus from its toolbar icon or Alt+Shift+S on this page before recording.' : why,
      };
    }
    await ensureOffscreen();
    return toOffscreen({ type: 'start', streamId, crop: req.crop, audio: req.audio, url: tab.url ?? '', title: req.title });
  }

  async function control(req: RecControlRequest): Promise<RecResult> {
    if (!(await chrome.offscreen.hasDocument())) {
      // The recorder went away mid-recording (crash, browser closing it). Its chunks are on disk;
      // the library rebuilds them into a recording when it opens.
      if (req.type === 'stylus:rec:stop') await browser.tabs.create({ url: browser.runtime.getURL(RECORDINGS_PAGE as '/recordings.html') });
      return { ok: false, error: 'Not recording.' };
    }
    const type = req.type.replace('stylus:rec:', '') as OffscreenControl['type'];
    const result = await toOffscreen({ type });
    if (type === 'stop' && result.ok && result.id) {
      await browser.tabs.create({ url: browser.runtime.getURL(`${RECORDINGS_PAGE}#${result.id}` as '/recordings.html') });
    }
    if ((type === 'stop' || type === 'cancel') && result.ok) await chrome.offscreen.closeDocument().catch(() => {});
    return result;
  }

  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    const m = msg as RecStartRequest | RecControlRequest | { type: 'stylus:rec:library' } | { type: 'stylus:rec:active' };
    if (!m?.type?.startsWith('stylus:rec:')) return;
    if (m.type === 'stylus:rec:library') {
      void browser.tabs.create({ url: browser.runtime.getURL(RECORDINGS_PAGE as '/recordings.html') });
      return;
    }
    if (m.type === 'stylus:rec:active') {
      // The library asks before recovering interrupted sessions, so it never touches a live one.
      chrome.offscreen.hasDocument().then((active) => sendResponse({ active }));
      return true;
    }
    const work = m.type === 'stylus:rec:start' ? startRecording(m, sender.tab!) : control(m);
    work.then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  });
});
