import { render } from 'preact';
import { effect } from '@preact/signals';
import { browser } from 'wxt/browser';
import { createShadowRootUi, defineContentScript, type ShadowRootContentScriptUi } from '#imports';
import { App } from './canvas/App';
import { startPicker, stopPicker } from './canvas/picker';
import { editMode, loadRule, ops, rule, select, uiHost } from './engine/store';
import { startEngine } from './engine/style-engine';
import './canvas/styles.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // View mode: apply saved edits as early as possible.
    await loadRule();
    startEngine();

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

    browser.runtime.onMessage.addListener((msg: unknown) => {
      const type = (msg as { type?: string } | null)?.type;
      if (type === 'stylus:toggle') {
        if (editMode.value) exit();
        else void enter();
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
