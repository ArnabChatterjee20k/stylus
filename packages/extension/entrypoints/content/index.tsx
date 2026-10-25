import { render } from 'preact';
import { effect } from '@preact/signals';
import { browser } from 'wxt/browser';
import { createShadowRootUi, defineContentScript, type ShadowRootContentScriptUi } from '#imports';
import { App } from './canvas/App';
import { hideElement, startTextEdit } from './canvas/actions';
import { startPicker, stopPicker } from './canvas/picker';
import { editMode, loadRule, ops, rule, select, uiHost } from './engine/store';
import { startEngine } from './engine/style-engine';
import './canvas/styles.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // View mode: apply saved edits before first paint. Reading storage is async, so hold painting
    // until the rule is in (a few ms), with a safety timeout so a slow read never blanks the page.
    const guard = document.createElement('style');
    guard.textContent = 'html { visibility: hidden !important; }';
    document.documentElement.appendChild(guard);
    const release = setTimeout(() => guard.remove(), 300);
    try {
      await loadRule();
      startEngine();
    } finally {
      clearTimeout(release);
      guard.remove();
    }

    let ui: ShadowRootContentScriptUi<void> | null = null;

    const exit = () => {
      if (!editMode.value) return;
      editMode.value = false;
      stopPicker();
      select(null);
      ui?.remove();
    };

    const enter = async () => {
      if (editMode.value) return;
      ui ??= await createShadowRootUi(ctx, {
        name: 'stylus-canvas',
        position: 'inline',
        anchor: 'html',
        append: 'last',
        isolateEvents: true,
        onMount(container, _shadow, host) {
          uiHost.value = host;
          render(<App onExit={exit} />, container);
        },
        onRemove() {
          render(null, ui!.uiContainer);
          uiHost.value = null;
        },
      });
      editMode.value = true;
      ui.mount();
      startPicker();
    };

    // Remember what was right-clicked, for the context menu actions.
    let contextTarget: Element | null = null;
    document.addEventListener(
      'contextmenu',
      (e) => {
        const t = e.composedPath()[0];
        if (t instanceof Element && !(uiHost.value && e.composedPath().includes(uiHost.value))) contextTarget = t;
      },
      true,
    );

    const onContextAction = async (action: string) => {
      const el = contextTarget;
      if (!el?.isConnected) return;
      if (action === 'hide') return hideElement(el);
      await enter();
      if (action === 'text') startTextEdit(el);
      else select([el]);
    };

    browser.runtime.onMessage.addListener((msg: unknown) => {
      const m = msg as { type?: string; action?: string } | null;
      if (m?.type === 'stylus:toggle') {
        if (editMode.value) exit();
        else void enter();
      } else if (m?.type === 'stylus:context' && m.action) {
        void onContextAction(m.action);
      }
    });

    // Keep the toolbar badge in sync: "ON" while editing, otherwise the number of edits on this site.
    effect(() => {
      const count = rule.value.enabled ? ops.value.filter((op) => !op.disabled).length : 0;
      browser.runtime.sendMessage({ type: 'stylus:status', editing: editMode.value, count }).catch(() => {});
    });

    ctx.onInvalidated(exit);
  },
});
