'use client';

import { useState } from 'react';
import styles from '../page.module.css';

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export default function MemoryIngestForm() {
  const [source, setSource] = useState('openclaw');
  const [kind, setKind] = useState('note');
  const [summary, setSummary] = useState('');
  const [metadataText, setMetadataText] = useState(`{
  "project": "robin-cloud"
}`);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitState('loading');
    setMessage('');

    try {
      let metadata = {};
      const trimmedMetadata = metadataText.trim();
      if (trimmedMetadata) {
        metadata = JSON.parse(trimmedMetadata);
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
          throw new Error('Metadata must be a JSON object');
        }
      }

      const res = await fetch('/api/dashboard/memory-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          kind,
          summary,
          metadata,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Memory ingest failed: ${res.status}`);
      }

      setSubmitState('success');
      setMessage(`Saved ${data.event.id}${data.pineconeUpserted ? ' and indexed it.' : ', but indexing warned.'}`);
      setSummary('');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : 'Memory ingest failed');
    }
  };

  return (
    <section className={styles.ingestSection}>
      <div className={styles.sectionHeader}>
        <span>Add memory</span>
        <small>Manual intake for durable context.</small>
      </div>

      <form onSubmit={handleSubmit} className={styles.ingestForm}>
        <div className={styles.ingestGrid}>
          <label>
            Source
            <input
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label>
            Kind
            <input
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              maxLength={120}
              required
            />
          </label>
        </div>

        <label>
          Summary
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={4}
            maxLength={8000}
            placeholder="What should the archive remember?"
            required
          />
        </label>

        <label>
          Metadata JSON
          <textarea
            value={metadataText}
            onChange={(event) => setMetadataText(event.target.value)}
            rows={5}
            spellCheck={false}
          />
        </label>

        <button
          type="submit"
          disabled={submitState === 'loading' || !summary.trim()}
          className={styles.primaryButton}
        >
          {submitState === 'loading' ? 'Saving...' : 'Save memory'}
        </button>
      </form>

      {message && (
        <p className={submitState === 'error' ? styles.ingestError : styles.ingestSuccess}>
          {message}
        </p>
      )}
    </section>
  );
}
