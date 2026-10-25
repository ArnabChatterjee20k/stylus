import { useState } from 'preact/hooks';
import { describeOp, parseRule, removeOp, updateOp, type EditOp } from '@stylus/shared';
import { Icon } from '../canvas/icons';
import { commit, ops, preview, rule, select } from '../engine/store';
import { Panel } from './Panel';

const selectorOf = (op: EditOp) => ('selector' in op ? op.selector : null);

export function Changes() {
  const list = [...ops.value].reverse();
  const [io, setIo] = useState<'export' | 'import' | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const doExport = () => {
    const json = JSON.stringify(rule.value, null, 2);
    setText(json);
    setIo('export');
    navigator.clipboard?.writeText(json).catch(() => {});
  };

  const doImport = () => {
    try {
      const imported = parseRule(location.origin, JSON.parse(text));
      commit([...ops.value, ...imported.ops.filter((op) => !ops.value.some((o) => o.id === op.id))]);
      setIo(null);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <Panel
      id="changes"
      title={`Changes · ${ops.value.length}`}
      width={300}
      initial={() => ({ x: innerWidth - 604, y: 64 })}
      actions={
        <span class="mini-actions">
          <button onClick={doExport} title="Copy this site's edits as JSON">Export</button>
          <button
            onClick={() => {
              setIo(io === 'import' ? null : 'import');
              setText('');
            }}
          >
            Import
          </button>
        </span>
      }
    >
      {io && (
        <div class="io">
          <textarea class="code" rows={6} value={text} readOnly={io === 'export'} placeholder="Paste exported Stylus JSON" onInput={(e) => setText(e.currentTarget.value)} />
          {io === 'export' ? <div class="hint">Copied to clipboard.</div> : <button class="btn" onClick={doImport}>Add these edits</button>}
          {error && <div class="error">{error}</div>}
        </div>
      )}
      {list.length === 0 ? (
        <div class="empty">No changes on this site yet. Everything you change shows up here, and you can turn each change on or off.</div>
      ) : (
        <ul class="changes" onPointerLeave={() => (preview.value = null)}>
          {list.map((op) => (
            <li key={op.id} class={op.disabled ? 'off' : ''} onPointerEnter={() => (preview.value = selectorOf(op))}>
              <input type="checkbox" checked={!op.disabled} title="Enable / disable" onChange={() => commit(updateOp(ops.value, op.id, { disabled: !op.disabled }))} />
              <button
                class="change-text"
                title="Select affected elements"
                onClick={() => {
                  const s = selectorOf(op);
                  if (!s) return;
                  try {
                    const els = Array.from(document.querySelectorAll(s));
                    if (els.length) select(els, s);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {op.by !== 'user' && <span class="badge">{op.by === 'agent' ? '🤖' : 'AI'}</span>}
                {describeOp(op)}
              </button>
              <button class="icon-btn" title="Delete change" onClick={() => commit(removeOp(ops.value, op.id))}>
                <Icon name="trash" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <div class="panel-foot">
          <button class="btn ghost" onClick={() => commit([])}>Reset site</button>
        </div>
      )}
    </Panel>
  );
}
