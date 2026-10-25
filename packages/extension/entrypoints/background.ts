import { browser } from 'wxt/browser';
import { defineBackground } from '#imports';
import { requestEdits, type AiRequest } from '../lib/claude';

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

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'toggle-edit') return;
    const id = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    await toggle(id);
  });

  // AI edits: the content script sends the prompt and page context; the call runs here, away from the page.
  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    const m = msg as { type?: string; request?: AiRequest };
    if (m?.type !== 'stylus:ai' || !m.request) return;
    requestEdits(m.request).then(sendResponse);
    return true; // keep the channel open for the async response
  });

  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    const m = msg as { type?: string; editing?: boolean; count?: number };
    const tabId = sender.tab?.id;
    if (m?.type !== 'stylus:status' || tabId === undefined) return;
    void browser.action.setBadgeBackgroundColor({ tabId, color: m.editing ? '#0d99ff' : '#5b5b5b' });
    void browser.action.setBadgeText({ tabId, text: m.editing ? 'ON' : m.count ? String(m.count) : '' });
  });
});
