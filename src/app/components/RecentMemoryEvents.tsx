'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../page.module.css';

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type Props = {
  initialEvents: MemoryEvent[];
};

function compactMemoryContext(event: MemoryEvent) {
  return `(${event.source}/${event.kind} created=${event.created_at}${event.archived_at ? ' archived=true' : ''}) ${event.summary}`;
}

export default function RecentMemoryEvents({ initialEvents }: Props) {
  const [events, setEvents] = useState<MemoryEvent[]>(initialEvents);
  const [state, setState] = useState<LoadState>('idle');
  const [message, setMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setState('loading');
    setMessage('');

    try {
      const res = await fetch(`/api/memory-events?includeArchived=${includeArchived}&bust=${Date.now()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Recent memory load failed: ${res.status}`);
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Recent memory load failed');
      setState('error');
    }
  }, [includeArchived]);

  useEffect(() => {
    const handleChanged = () => loadEvents();
    window.addEventListener('memory-events-changed', handleChanged);
    return () => window.removeEventListener('memory-events-changed', handleChanged);
  }, [loadEvents]);

  const copyText = async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(`${label}:${id}`);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setMessage('Clipboard write failed');
      setState('error');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Archive this memory? It will disappear from search now and hard-delete after 90 days.');
    if (!confirmed) return;

    setDeletingId(id);
    setMessage('');

    try {
      const res = await fetch('/api/dashboard/memory-events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Delete failed: ${res.status}`);
      }
      setEvents((current) => includeArchived ? current.map((event) => event.id === id ? data.event : event) : current.filter((event) => event.id !== id));
      window.dispatchEvent(new CustomEvent('memory-events-changed'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delete failed');
      setState('error');
    } finally {
      setDeletingId(null);
    }
  };


  const handleRestore = async (id: string) => {
    setRestoringId(id);
    setMessage('');

    try {
      const res = await fetch('/api/dashboard/memory-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Restore failed: ${res.status}`);
      }
      setEvents((current) => current.map((event) => event.id === id ? data.event : event));
      window.dispatchEvent(new CustomEvent('memory-events-changed'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Restore failed');
      setState('error');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className={styles.memorySection}>
      <div className={styles.sectionHeader}>
        <span>Recent memory events</span>
        <small>{events.length} loaded</small>
        <label className={styles.inlineToggle}>
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
        <button type="button" className={styles.refreshButton} onClick={loadEvents} disabled={state === 'loading'}>
          {state === 'loading' ? 'Refreshing...' : 'Refresh recent'}
        </button>
      </div>

      {state === 'error' && <p className={styles.searchError}>{message}</p>}

      {events.length === 0 ? (
        <p className={styles.memoryEmpty}>No events yet.</p>
      ) : (
        <ul className={styles.memoryList}>
          {events.map((event) => (
            <li key={event.id} className={styles.memoryItem}>
              <strong>{event.kind}</strong>: {event.summary}
              <br />
              <small className={styles.metadata}>
                {new Date(event.created_at).toLocaleString()} • {event.source}
                {event.archived_at ? ` • archived ${new Date(event.archived_at).toLocaleString()}` : ''}
              </small>
              {event.archived_at && (
                <div className={styles.archiveBadge}>Archived{event.archive_reason ? `: ${event.archive_reason}` : ''}</div>
              )}
              <div className={styles.memoryActions}>
                <button type="button" className={styles.copyButton} onClick={() => copyText(event.id, event.id, 'id')}>
                  {copiedId === `id:${event.id}` ? 'Copied ID' : 'Copy ID'}
                </button>
                <button type="button" className={styles.copyButton} onClick={() => copyText(JSON.stringify(event, null, 2), event.id, 'json')}>
                  {copiedId === `json:${event.id}` ? 'Copied JSON' : 'Copy JSON'}
                </button>
                <button type="button" className={styles.copyButton} onClick={() => copyText(compactMemoryContext(event), event.id, 'context')}>
                  {copiedId === `context:${event.id}` ? 'Copied context' : 'Copy context'}
                </button>
                {event.archived_at ? (
                  <button
                    type="button"
                    className={styles.restoreButton}
                    disabled={restoringId === event.id}
                    onClick={() => handleRestore(event.id)}
                  >
                    {restoringId === event.id ? 'Restoring...' : 'Restore memory'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={deletingId === event.id}
                    onClick={() => handleDelete(event.id)}
                  >
                    {deletingId === event.id ? 'Archiving...' : 'Archive memory'}
                  </button>
                )}
              </div>
              <details className={styles.memoryDetails}>
                <summary>Details</summary>
                <dl className={styles.detailGrid}>
                  <div><dt>ID</dt><dd>{event.id}</dd></div>
                  <div><dt>Source</dt><dd>{event.source}</dd></div>
                  <div><dt>Kind</dt><dd>{event.kind}</dd></div>
                  <div><dt>Created</dt><dd>{new Date(event.created_at).toLocaleString()}</dd></div>
                  {event.archived_at && <div><dt>Archived</dt><dd>{new Date(event.archived_at).toLocaleString()}</dd></div>}
                  {event.archived_by && <div><dt>Archived by</dt><dd>{event.archived_by}</dd></div>}
                  {event.archive_reason && <div><dt>Archive reason</dt><dd>{event.archive_reason}</dd></div>}
                </dl>
                <div className={styles.detailBlock}>
                  <span>Summary</span>
                  <p>{event.summary}</p>
                </div>
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div className={styles.detailBlock}>
                    <span>Metadata</span>
                    <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
