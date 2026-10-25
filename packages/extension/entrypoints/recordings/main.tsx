import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { formatBytes, keepAfterDownload, safeName, saveToDownloads, setKeepAfterDownload } from '../../lib/downloads';
import { deleteRecording, extensionFor, listRecordings, recoverInterrupted, renameRecording, type Recording } from '../../lib/recordings-db';
import './style.css';

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const formatDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fileName = (r: Recording) => `${safeName(r.title, 'recording')}.${extensionFor(r.mime)}`;

function App() {
  const [items, setItems] = useState<Recording[] | null>(null);
  const [selectedId, setSelectedId] = useState(() => location.hash.slice(1));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keep, setKeep] = useState(keepAfterDownload);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const reload = async () => setItems(await listRecordings());
  useEffect(() => {
    void (async () => {
      // Rebuild recordings left behind by a crash or a closed recorder, unless one is still running.
      const { active } = ((await browser.runtime.sendMessage({ type: 'stylus:rec:active' }).catch(() => null)) ?? { active: true }) as { active: boolean };
      if (!active) await recoverInterrupted().catch(() => []);
      await reload();
    })();
    const onHash = () => setSelectedId(location.hash.slice(1));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const selected = items?.find((r) => r.id === selectedId) ?? items?.[0];
  const videoUrl = useMemo(() => (selected ? URL.createObjectURL(selected.blob) : ''), [selected?.id]);
  useEffect(() => () => URL.revokeObjectURL(videoUrl), [videoUrl]);
  useEffect(() => setConfirmDelete(false), [selected?.id]);

  const choose = (id: string) => {
    history.replaceState(null, '', `#${id}`);
    setSelectedId(id);
  };

  const showStatus = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus((s) => (s === text ? '' : s)), 4000);
  };

  // Save to Downloads, then free the space here once the file is safely written.
  const download = async (r: Recording) => {
    setSaving(true);
    const result = await saveToDownloads(r.blob, fileName(r));
    setSaving(false);
    if (result !== 'complete') return showStatus('Download didn’t finish. The recording is still here.');
    if (keep) return showStatus('Saved to Downloads.');
    await deleteRecording(r.id);
    history.replaceState(null, '', '#');
    setSelectedId('');
    await reload();
    showStatus('Saved to Downloads and removed from Stylus.');
  };

  if (!items) return null;

  return (
    <div class="layout">
      <aside class="sidebar">
        <header class="brand">
          <img src="/icon/logo.svg" alt="" width={22} height={22} />
          <span>Recordings</span>
          <a class="storage-link" href="/options.html">Storage</a>
        </header>
        {items.length === 0 ? (
          <p class="empty">No recordings yet. Open Stylus on a page, click the record button, and choose an element or the whole tab.</p>
        ) : (
          <ul class="list">
            {items.map((r) => (
              <li key={r.id}>
                <button class={`item ${r.id === selected?.id ? 'on' : ''}`} onClick={() => choose(r.id)}>
                  {r.thumbnail ? <img class="thumb" src={r.thumbnail} alt="" /> : <span class="thumb blank" />}
                  <span class="item-text">
                    <span class="item-title">{r.title}</span>
                    {r.recovered && <span class="tag">Recovered</span>}
                    <span class="item-meta">
                      {formatDuration(r.durationMs)} · {formatDate(r.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main class="viewer">
        {status && (
          <div class="status" role="status">
            {status}
          </div>
        )}
        {selected ? (
          <>
            <video key={selected.id} class="player" src={videoUrl} controls autoplay muted playsInline />
            <input
              class="title"
              aria-label="Recording title"
              defaultValue={selected.title}
              key={`t-${selected.id}`}
              onBlur={async (e) => {
                const title = e.currentTarget.value.trim();
                if (title && title !== selected.title) {
                  await renameRecording(selected.id, title);
                  await reload();
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            />
            <p class="meta">
              {formatDuration(selected.durationMs)} · {selected.width}×{selected.height} · {formatBytes(selected.size)} · {formatDate(selected.createdAt)}
              {selected.url && (
                <>
                  {' · '}
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    {new URL(selected.url).host}
                  </a>
                </>
              )}
            </p>
            <div class="actions">
              <button class="button primary" disabled={saving} onClick={() => download(selected)}>
                {saving ? 'Saving…' : `Download ${extensionFor(selected.mime).toUpperCase()}`}
              </button>
              <label class="keep" title="Otherwise the recording is removed from Stylus once it is in your Downloads folder">
                <input
                  type="checkbox"
                  checked={keep}
                  onChange={(e) => {
                    setKeep(e.currentTarget.checked);
                    setKeepAfterDownload(e.currentTarget.checked);
                  }}
                />
                Keep a copy in Stylus
              </label>
              {confirmDelete ? (
                <span class="confirm">
                  Delete this recording?
                  <button
                    class="button danger"
                    onClick={async () => {
                      await deleteRecording(selected.id);
                      history.replaceState(null, '', '#');
                      setSelectedId('');
                      await reload();
                    }}
                  >
                    Delete
                  </button>
                  <button class="button" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button class="button" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              )}
            </div>
          </>
        ) : (
          <div class="placeholder">Your recordings will appear here.</div>
        )}
      </main>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
