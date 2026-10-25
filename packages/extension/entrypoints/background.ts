import { browser } from 'wxt/browser';
import { defineBackground } from '#imports';

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
    const m = msg as { type?: string; editing?: boolean; count?: number };
    const tabId = sender.tab?.id;
    if (m?.type !== 'stylus:status' || tabId === undefined) return;
    void browser.action.setBadgeBackgroundColor({ tabId, color: m.editing ? '#0d99ff' : '#5b5b5b' });
    void browser.action.setBadgeText({ tabId, text: m.editing ? 'ON' : m.count ? String(m.count) : '' });
  });
});
