import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { aiEditsToOps, describeOp, type AiReply } from '@stylus/shared';
import { aiOpen, commit, draft, ops, preview, selection } from '../engine/store';
import { buildContext } from '../lib/page-context';
import { labelFor } from '../lib/selector';
import { Icon } from './icons';

const SETTINGS_KEY = 'ai:settings';
const SUGGESTIONS = ['Make this calmer', 'Increase the contrast', 'Turn this into a modern card', 'Hide everything distracting'];

type AiResult = { ok: true; reply: AiReply; model: string } | { ok: false; code: string; error: string };
type Status = { kind: 'idle' } | { kind: 'key' } | { kind: 'loading' } | { kind: 'error'; message: string; code?: string };

const validSelector = (s: string) => {
  document.querySelector(s); // throws on invalid syntax
  return true;
};

async function hasKey() {
  const s = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as { apiKey?: string } | undefined;
  return !!s?.apiKey;
}

async function saveKey(apiKey: string) {
  const current = ((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as object | undefined) ?? {};
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...current, apiKey } });
}

const selectorsOf = (d: typeof draft.value) =>
  [...new Set((d?.ops ?? []).flatMap((op) => ('selector' in op ? [op.selector] : [])))].join(', ') || null;

/** Cursor-style prompt bar: describe a change, preview what Claude proposes, accept or reject it. */
export function AiBar() {
  const [text, setText] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const d = draft.value;
  const sel = selection.value;

  useEffect(() => {
    hasKey().then((ok) => !ok && setStatus({ kind: 'key' }));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [status.kind, !!d]);

  // Outline what the draft touches.
  useEffect(() => {
    preview.value = selectorsOf(d);
    return () => {
      preview.value = null;
    };
  }, [d]);

  const close = () => {
    requestId.current++;
    draft.value = null;
    aiOpen.value = false;
  };

  const accept = () => {
    if (!d) return;
    commit([...ops.value, ...d.ops]);
    draft.value = null;
    aiOpen.value = false;
  };

  const reject = () => {
    draft.value = null;
    setText(d?.prompt ?? '');
  };

  const run = async (prompt: string) => {
    if (!prompt.trim()) return;
    const id = ++requestId.current;
    setStatus({ kind: 'loading' });
    const history = d ? [...d.history] : [];
    const result = (await browser.runtime
      .sendMessage({ type: 'stylus:ai', request: { prompt, context: buildContext(sel, ops.value), history } })
      .catch((e: unknown) => ({ ok: false, code: 'api', error: String(e) }))) as AiResult;
    if (id !== requestId.current) return; // cancelled or superseded
    if (!result.ok) {
      setStatus(result.code === 'no-key' ? { kind: 'key' } : { kind: 'error', message: result.error, code: result.code });
      return;
    }
    const proposed = aiEditsToOps(result.reply, validSelector);
    setStatus({ kind: 'idle' });
    setText('');
    if (!proposed.length) {
      setStatus({ kind: 'error', message: result.reply.summary || 'Claude had no changes to suggest for that.' });
      return;
    }
    draft.value = { prompt, summary: result.reply.summary, ops: proposed, history: [...history, { prompt, reply: result.reply }] };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (status.kind === 'loading') {
        requestId.current++;
        setStatus({ kind: 'idle' });
      } else if (d) reject();
      else close();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (d && !text.trim()) accept();
      else void run(text);
    }
  };

  const target = sel?.els[0];

  return (
    <div class="aibar" role="dialog" aria-label="AI edit">
      {status.kind === 'key' ? (
        <div class="ai-key">
          <div class="ai-title">
            <Icon name="sparkles" size={14} /> Connect Claude
          </div>
          <p class="hint">
            Paste an Anthropic API key from console.anthropic.com. It stays in this browser's extension storage and is only sent to the Anthropic API.
          </p>
          <div class="ai-row">
            <input
              class="ai-key-input mono"
              type="password"
              placeholder="sk-ant-…"
              value={key}
              onInput={(e) => setKey(e.currentTarget.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && key.trim()) {
                  await saveKey(key.trim());
                  setKey('');
                  setStatus({ kind: 'idle' });
                }
                if (e.key === 'Escape') close();
              }}
            />
            <button
              class="btn"
              disabled={!key.trim()}
              onClick={async () => {
                await saveKey(key.trim());
                setKey('');
                setStatus({ kind: 'idle' });
              }}
            >
              Save key
            </button>
          </div>
        </div>
      ) : (
        <>
          <div class="ai-row">
            <span class="ai-chip" title={sel?.selector ?? 'The whole page'}>
              <Icon name="sparkles" size={12} />
              {target ? (sel!.els.length > 1 ? `${sel!.els.length} × ${labelFor(target)}` : labelFor(target)) : 'Whole page'}
            </span>
            <textarea
              ref={inputRef}
              class="ai-input"
              rows={1}
              placeholder={d ? 'Refine it, or press Enter to accept' : 'Describe a change, e.g. "make this calmer"'}
              value={text}
              disabled={status.kind === 'loading'}
              onInput={(e) => setText(e.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
            {status.kind === 'loading' ? (
              <span class="ai-loading">Thinking…</span>
            ) : (
              <button class="btn" disabled={!text.trim()} onClick={() => run(text)}>
                {d ? 'Refine' : 'Generate'}
              </button>
            )}
          </div>

          {!d && status.kind === 'idle' && !text && (
            <div class="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => run(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {status.kind === 'error' && (
            <div class="ai-error">
              {status.message}
              {status.code === 'auth' && (
                <button class="link" onClick={() => setStatus({ kind: 'key' })}>
                  Change key
                </button>
              )}
            </div>
          )}

          {d && (
            <div class="ai-preview">
              <div class="ai-summary">{d.summary}</div>
              <ul class="ai-ops">
                {d.ops.map((op) => (
                  <li key={op.id}>{describeOp(op)}</li>
                ))}
              </ul>
              <div class="ai-actions">
                <span class="hint">Previewing on the page</span>
                <button class="btn ghost" onClick={reject}>
                  Reject <kbd>Esc</kbd>
                </button>
                <button class="btn" onClick={accept}>
                  Accept <kbd>⏎</kbd>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
