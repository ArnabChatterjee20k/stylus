import { canRedo, canUndo, ops, panels, redo, rule, setSiteEnabled, togglePanel, tool, undo, type PanelId, type Tool } from '../engine/store';
import { useState } from 'preact/hooks';
import { selection } from '../engine/store';
import { labelFor } from '../lib/selector';
import { Icon, type IconName } from './icons';
import { openLibrary, startRecording } from './recorder';

const TOOLS: { id: Tool; icon: IconName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'zap', icon: 'zap', label: 'Zap (click to hide)', key: 'H' },
  { id: 'text', icon: 'text', label: 'Edit text', key: 'T' },
];

const PANELS: { id: PanelId; icon: IconName; label: string; key?: string }[] = [
  { id: 'layers', icon: 'layers', label: 'Layers', key: 'L' },
  { id: 'design', icon: 'design', label: 'Design', key: 'D' },
  { id: 'theme', icon: 'theme', label: 'Theme & comfort' },
  { id: 'changes', icon: 'changes', label: 'Changes' },
];

export function Toolbar({ onExit }: { onExit: () => void }) {
  const enabled = rule.value.enabled;
  return (
    <div class="toolbar">
      <span class="brand">Stylus</span>
      <div class="tb-group">
        {TOOLS.map((t) => (
          <button key={t.id} class={`tb-btn ${tool.value === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} onClick={() => (tool.value = t.id)}>
            <Icon name={t.icon} />
          </button>
        ))}
      </div>
      <div class="tb-sep" />
      <div class="tb-group">
        {PANELS.map((p) => (
          <button key={p.id} class={`tb-btn ${panels.value[p.id] ? 'on' : ''}`} title={p.key ? `${p.label} (${p.key})` : p.label} onClick={() => togglePanel(p.id)}>
            <Icon name={p.icon} />
            {p.id === 'changes' && ops.value.length > 0 && <span class="tb-count">{ops.value.length}</span>}
          </button>
        ))}
      </div>
      <div class="tb-sep" />
      <RecordMenu />
      <div class="tb-sep" />
      <div class="tb-group">
        <button class="tb-btn" title="Undo (⌘Z)" disabled={!canUndo.value} onClick={undo}>
          <Icon name="undo" />
        </button>
        <button class="tb-btn" title="Redo (⌘⇧Z)" disabled={!canRedo.value} onClick={redo}>
          <Icon name="redo" />
        </button>
        <button
          class={`tb-btn ${enabled ? '' : 'warn'}`}
          title={enabled ? 'Edits on. Click to view the original page' : 'Edits off. Click to turn them back on'}
          onClick={() => setSiteEnabled(!enabled)}
        >
          <Icon name="power" />
        </button>
      </div>
      <div class="tb-sep" />
      <button class="tb-btn" title="Exit edit mode (Alt+Shift+S)" onClick={onExit}>
        <Icon name="close" />
      </button>
    </div>
  );
}

function RecordMenu() {
  const [open, setOpen] = useState(false);
  const target = selection.value?.els.find((e) => e.isConnected);
  const pick = (fn: () => unknown) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div class="tb-rec">
      <button class={`tb-btn rec ${open ? 'on' : ''}`} title="Record" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="record" />
      </button>
      {open && (
        <div class="rec-menu" role="menu">
          <button role="menuitem" disabled={!target} onClick={pick(() => startRecording('element'))}>
            Record selected element
            <small>{target ? labelFor(target) : 'Select an element first'}</small>
          </button>
          <button role="menuitem" onClick={pick(() => startRecording('tab'))}>
            Record whole tab
            <small>Everything visible in this tab</small>
          </button>
          <hr />
          <button role="menuitem" onClick={pick(openLibrary)}>
            Open recordings
          </button>
        </div>
      )}
    </div>
  );
}
