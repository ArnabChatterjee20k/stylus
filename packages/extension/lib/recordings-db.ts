/**
 * Recordings live in IndexedDB on the extension's origin, shared by the offscreen recorder and the
 * library page. While recording, each encoded chunk is written to disk as it arrives (nothing is
 * held in memory), so a crash or a closed recorder loses at most the last second.
 */

export type Recording = {
  id: string;
  title: string;
  /** Page the recording was made on. */
  url: string;
  createdAt: number;
  durationMs: number;
  width: number;
  height: number;
  mime: string;
  size: number;
  blob: Blob;
  /** Small JPEG of the first frame, as a data URL. */
  thumbnail?: string;
  /** Rebuilt from chunks after the recorder stopped unexpectedly. */
  recovered?: boolean;
};

/** A recording in progress: its metadata, kept up to date as chunks arrive. */
export type Session = Omit<Recording, 'blob' | 'size'> & { chunks: number; size: number };

type Chunk = { session: string; seq: number; data: Blob };

const DB = 'stylus-recordings';
const RECORDINGS = 'recordings';
const SESSIONS = 'sessions';
const CHUNKS = 'chunks';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RECORDINGS)) db.createObjectStore(RECORDINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: ['session', 'seq'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Run `fn` in one transaction over `stores` and resolve once it commits, with the result of the
 * returned request, or of the returned getter (for work spanning several requests).
 */
async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | (() => T) | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = fn(t);
    t.oncomplete = () => {
      db.close();
      resolve(typeof out === 'function' ? out() : out ? out.result : (undefined as T));
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const chunkRange = (session: string) => IDBKeyRange.bound([session, 0], [session, Number.MAX_SAFE_INTEGER]);

// ---------- Finished recordings ----------

export const saveRecording = (r: Recording) => tx([RECORDINGS], 'readwrite', (t) => t.objectStore(RECORDINGS).put(r)).then(() => r.id);
export const getRecording = (id: string) => tx<Recording | undefined>([RECORDINGS], 'readonly', (t) => t.objectStore(RECORDINGS).get(id));
export const deleteRecording = (id: string) => tx([RECORDINGS], 'readwrite', (t) => t.objectStore(RECORDINGS).delete(id));
export const listRecordings = async () =>
  ((await tx<Recording[]>([RECORDINGS], 'readonly', (t) => t.objectStore(RECORDINGS).getAll())) ?? []).sort((a, b) => b.createdAt - a.createdAt);

export async function renameRecording(id: string, title: string) {
  const r = await getRecording(id);
  if (r) await saveRecording({ ...r, title });
}

// ---------- Recording in progress ----------

export const beginSession = (s: Session) => tx([SESSIONS], 'readwrite', (t) => t.objectStore(SESSIONS).put(s));

/** Append one chunk and update the session's metadata in the same transaction. */
export function appendChunk(id: string, seq: number, data: Blob, update: Partial<Session>) {
  return tx([SESSIONS, CHUNKS], 'readwrite', (t) => {
    t.objectStore(CHUNKS).put({ session: id, seq, data } satisfies Chunk);
    const sessions = t.objectStore(SESSIONS);
    const get = sessions.get(id);
    get.onsuccess = () => {
      const s = get.result as Session | undefined;
      if (s) sessions.put({ ...s, ...update, chunks: Math.max(s.chunks, seq + 1), size: s.size + data.size });
    };
  });
}

export const updateSession = (id: string, update: Partial<Session>) =>
  tx([SESSIONS], 'readwrite', (t) => {
    const sessions = t.objectStore(SESSIONS);
    const get = sessions.get(id);
    get.onsuccess = () => get.result && sessions.put({ ...get.result, ...update });
  });

export const listSessions = () => tx<Session[]>([SESSIONS], 'readonly', (t) => t.objectStore(SESSIONS).getAll());
export const countChunks = (id: string) => tx<number>([CHUNKS], 'readonly', (t) => t.objectStore(CHUNKS).count(chunkRange(id)));

/** Drop a session and its chunks (discarded recording). */
export const discardSession = (id: string) =>
  tx([SESSIONS, CHUNKS], 'readwrite', (t) => {
    t.objectStore(CHUNKS).delete(chunkRange(id));
    t.objectStore(SESSIONS).delete(id);
  });

/**
 * Turn a session's chunks into a finished recording, then delete the session and chunks.
 * Chunks read back from IndexedDB are disk-backed blobs, so joining them doesn't load the video into memory.
 */
export async function finalizeSession(id: string, recovered = false): Promise<Recording | null> {
  const [session, chunks] = await tx<[Session | undefined, Chunk[]]>([SESSIONS, CHUNKS], 'readonly', (t) => {
    const out: [Session | undefined, Chunk[]] = [undefined, []];
    const s = t.objectStore(SESSIONS).get(id);
    const c = t.objectStore(CHUNKS).getAll(chunkRange(id));
    s.onsuccess = () => (out[0] = s.result);
    c.onsuccess = () => (out[1] = c.result);
    return () => out;
  });
  if (!session) return null;
  const blob = new Blob(
    chunks.sort((a, b) => a.seq - b.seq).map((c) => c.data),
    { type: session.mime },
  );
  const { chunks: _count, ...meta } = session;
  const recording: Recording | null = blob.size
    ? { ...meta, size: blob.size, blob, recovered: recovered || undefined, title: recovered ? `Recovered · ${session.title}` : session.title }
    : null;
  await tx([RECORDINGS, SESSIONS, CHUNKS], 'readwrite', (t) => {
    if (recording) t.objectStore(RECORDINGS).put(recording);
    t.objectStore(CHUNKS).delete(chunkRange(id));
    t.objectStore(SESSIONS).delete(id);
  });
  return recording;
}

/** Rebuild recordings from sessions left behind by a crash or a closed recorder. Call only when nothing is recording. */
export async function recoverInterrupted(): Promise<Recording[]> {
  const recovered: Recording[] = [];
  for (const s of await listSessions()) {
    // The first chunk is only the file header; without at least one video fragment after it there is
    // nothing to play, so drop the session instead of listing a broken recording.
    if (s.chunks < 2) {
      await discardSession(s.id);
      continue;
    }
    const r = await finalizeSession(s.id, true);
    if (r) recovered.push(r);
  }
  return recovered;
}

export const extensionFor = (mime: string) => (mime.includes('mp4') ? 'mp4' : 'webm');
