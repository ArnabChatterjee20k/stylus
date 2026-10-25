import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  vite: () => ({ plugins: [preact()] }),
  manifest: {
    name: 'Stylus — live page canvas',
    description: 'Turn any webpage into a design canvas: hide, edit, restyle and theme pages live.',
    permissions: ['storage', 'tabs', 'contextMenus', 'tabCapture', 'offscreen', 'unlimitedStorage', 'downloads'],
    // Same reach as the content script (which already runs on every site); needed for tabs.captureVisibleTab.
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Toggle Stylus edit mode (Alt+Shift+S)' },
    commands: {
      'toggle-edit': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Toggle edit mode on the current page',
      },
    },
  },
});
