import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { deleteCapture, listCaptures, type Capture } from '../../lib/captures-db';
import { formatBytes } from '../../lib/downloads';
import { deleteRecording, discardSession, listRecordings, listSessions, type Recording, type Session } from '../../lib/recordings-db';
import './style.css';

type Data = { recordings: Recording[]; captures: Capture[]; sessions: Session[]; used: number | null; sites: number; editsBytes: number; recording: boolean };

const formatDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

async function load(): Promise<Data> {
  const [recordings, captures, sessions, estimate, all, active] = await Promise.all([
    listRecordings(),
    listCaptures(),
    listSessions(),
    navigator.storage?.estimate?.().catch(() => null) ?? null,
    browser.storage.local.get(null),
    browser.runtime.sendMessage({ type: 'stylus:rec:active' }).catch(() => ({ active: false })) as Promise<{ active: boolean }>,
  ]);
  const siteKeys = Object.keys(all).filter((k) => k.startsWith('site:'));
  return {
    recordings,
    captures,
    sessions,
    used: estimate?.usage ?? null,
    sites: siteKeys.length,
    editsBytes: siteKeys.length ? new Blob([JSON.stringify(siteKeys.map((k) => all[k]))]).size : 0,
    recording: !!active?.active,
  };
}

/** One place to see everything Stylus keeps in the browser, and clear it. */
function App() {
  const [data, setData] = useState<Data | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const reload = async () => setData(await load());
  useEffect(() => {
    void reload();
    // Stay current when a recording or screenshot is added or removed in another tab.
    const onFocus = () => void reload();
    addEventListener('focus', onFocus);
    return () => removeEventListener('focus', onFocus);
  }, []);

  const thumbs = useMemo(() => new Map(data?.captures.map((c) => [c.id, URL.createObjectURL(c.image)])), [data?.captures]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  if (!data) return null;
  const recBytes = sum(data.recordings.map((r) => r.size));
  const capBytes = sum(data.captures.map((c) => c.image.size));
  const unfinishedBytes = sum(data.sessions.map((s) => s.size));
  const nothing = !data.recordings.length && !data.captures.length && !data.sessions.length;

  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    setConfirm(null);
    await reload();
  };

  const Confirm = (props: { id: string; label: string; onConfirm: () => Promise<unknown> }) =>
    confirm === props.id ? (
      <span class="confirm">
        Sure?
        <button class="btn danger" onClick={() => run(props.onConfirm)}>
          {props.label}
        </button>
        <button class="btn" onClick={() => setConfirm(null)}>
          Cancel
        </button>
      </span>
    ) : (
      <button class="btn" onClick={() => setConfirm(props.id)}>
        {props.label}
      </button>
    );

  return (
    <div class="page">
      <header class="top">
        <img src="/icon/logo.svg" alt="" width={26} height={26} />
        <h1>Storage</h1>
        <nav>
          <a href="/recordings.html">Recordings</a>
          <a href="/capture.html">Screenshots</a>
        </nav>
      </header>
      <p class="lead">
        Everything Stylus keeps lives in this browser only. Downloading a recording or screenshot moves it to your Downloads folder and removes it from here, unless you chose to keep a copy.
      </p>

      <div class="cards">
        <div class="card">
          <span class="num">{data.used === null ? '—' : formatBytes(data.used)}</span>
          <span class="cap">Total used by Stylus</span>
        </div>
        <div class="card">
          <span class="num">{data.recordings.length}</span>
          <span class="cap">Recordings · {formatBytes(recBytes)}</span>
        </div>
        <div class="card">
          <span class="num">{data.captures.length}</span>
          <span class="cap">Screenshots · {formatBytes(capBytes)}</span>
        </div>
        <div class="card">
          <span class="num">{data.sites}</span>
          <span class="cap">Sites with edits · {formatBytes(data.editsBytes)}</span>
        </div>
      </div>

      {nothing && <p class="all-clear">Nothing stored. All recordings and screenshots have been downloaded or deleted.</p>}

      {data.sessions.length > 0 && (
        <section>
          <header>
            <h2>Unfinished recordings · {formatBytes(unfinishedBytes)}</h2>
            {!data.recording && <Confirm id="sessions" label="Remove unfinished" onConfirm={() => Promise.all(data.sessions.map((s) => discardSession(s.id)))} />}
          </header>
          <p class="note">
            {data.recording
              ? 'A recording is in progress right now.'
              : 'Left behind when a recording didn’t finish (for example, Chrome closed). Open Recordings to recover them as videos, or remove them.'}
          </p>
          <ul class="rows">
            {data.sessions.map((s) => (
              <li key={s.id} class="row">
                {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span class="blank" />}
                <span class="name">{s.title}</span>
                <span class="meta">{formatDate(s.createdAt)}</span>
                <span class="size">{formatBytes(s.size)}</span>
                <a class="btn" href="/recordings.html">
                  Recover
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <header>
          <h2>Recordings · {formatBytes(recBytes)}</h2>
          {data.recordings.length > 0 && <Confirm id="recordings" label="Delete all recordings" onConfirm={() => Promise.all(data.recordings.map((r) => deleteRecording(r.id)))} />}
        </header>
        {data.recordings.length === 0 ? (
          <p class="note">No recordings stored.</p>
        ) : (
          <ul class="rows">
            {data.recordings.map((r) => (
              <li key={r.id} class="row">
                {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <span class="blank" />}
                <a class="name" href={`/recordings.html#${r.id}`}>
                  {r.title}
                </a>
                <span class="meta">{formatDate(r.createdAt)}</span>
                <span class="size">{formatBytes(r.size)}</span>
                <Confirm id={r.id} label="Delete" onConfirm={() => deleteRecording(r.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <header>
          <h2>Screenshots · {formatBytes(capBytes)}</h2>
          {data.captures.length > 0 && <Confirm id="captures" label="Delete all screenshots" onConfirm={() => Promise.all(data.captures.map((c) => deleteCapture(c.id)))} />}
        </header>
        {data.captures.length === 0 ? (
          <p class="note">No screenshots stored.</p>
        ) : (
          <ul class="rows">
            {data.captures.map((c) => (
              <li key={c.id} class="row">
                <img src={thumbs.get(c.id)} alt="" />
                <a class="name" href={`/capture.html#${c.id}`}>
                  {c.title}
                </a>
                <span class="meta">{formatDate(c.createdAt)}</span>
                <span class="size">{formatBytes(c.image.size)}</span>
                <Confirm id={c.id} label="Delete" onConfirm={() => deleteCapture(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
