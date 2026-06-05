'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../page.module.css';

type SearchResult = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  score: number;
};

type SearchState = 'idle' | 'loading' | 'success' | 'error';
type TaxonomyState = 'loading' | 'ready' | 'error';

type Taxonomy = {
  sources: string[];
  kinds: string[];
};

const FALLBACK_TAXONOMY: Taxonomy = {
  sources: ['agent', 'supabase'],
  kinds: ['decision', 'deployment', 'milestone', 'system'],
};

const MEMORY_LENSES = [
  { label: 'Deployments', query: 'production deployment shipped verified', kind: 'deployment' },
  { label: 'Decisions', query: 'architecture product decision rationale', kind: 'decision' },
  { label: 'Errors & fixes', query: 'error failure blocker fix regression', kind: 'error' },
  { label: 'Milestones', query: 'milestone completed shipped capability', kind: 'milestone' },
  { label: 'Handoffs', query: 'handoff current state blockers next verification', kind: 'handoff' },
];

function compactSearchContext(result: SearchResult) {
  return `(${result.source}/${result.kind} score=${result.score?.toFixed(3)} created=${result.created_at}${result.archived_at ? ' archived=true' : ''}) ${result.summary}`;
}

export default function SearchBar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [minScore, setMinScore] = useState('0.25');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [taxonomyState, setTaxonomyState] = useState<TaxonomyState>('loading');
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(FALLBACK_TAXONOMY);
  const [errorMessage, setErrorMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadTaxonomy = useCallback(async () => {
    setTaxonomyState('loading');

    try {
      const res = await fetch(`/api/memory-events?includeArchived=${includeArchived}&bust=${Date.now()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Taxonomy failed: ${res.status}`);
      }

      const sources = Array.isArray(data.taxonomy?.sources)
        ? data.taxonomy.sources.filter((value: unknown) => typeof value === 'string')
        : [];
      const kinds = Array.isArray(data.taxonomy?.kinds)
        ? data.taxonomy.kinds.filter((value: unknown) => typeof value === 'string')
        : [];

      setTaxonomy({
        sources: sources.length ? sources : FALLBACK_TAXONOMY.sources,
        kinds: kinds.length ? kinds : FALLBACK_TAXONOMY.kinds,
      });
      setTaxonomyState('ready');
    } catch (error) {
      console.error('Error loading memory taxonomy:', error);
      setTaxonomy(FALLBACK_TAXONOMY);
      setTaxonomyState('error');
    }
  }, [includeArchived]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTaxonomy();
  }, [loadTaxonomy]);

  useEffect(() => {
    const handleChanged = () => {
      loadTaxonomy();
      router.refresh();
    };

    window.addEventListener('memory-events-changed', handleChanged);
    return () => window.removeEventListener('memory-events-changed', handleChanged);
  }, [loadTaxonomy, router]);

  const handleRefresh = () => {
    loadTaxonomy();
    router.refresh();
  };

  const copyText = async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(`${label}:${id}`);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setErrorMessage('Clipboard write failed');
      setSearchState('error');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Archive this memory? It will disappear from search now and hard-delete after 90 days.');
    if (!confirmed) return;

    setDeletingId(id);
    setErrorMessage('');

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

      setSearchResults((results) => includeArchived ? results.map((result) => result.id === id ? { ...result, ...data.event, score: result.score } : result) : results.filter((result) => result.id !== id));
      window.dispatchEvent(new CustomEvent('memory-events-changed'));
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Delete failed');
      setSearchState('error');
    } finally {
      setDeletingId(null);
    }
  };


  const handleRestore = async (id: string) => {
    setRestoringId(id);
    setErrorMessage('');

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

      setSearchResults((results) => results.map((result) => result.id === id ? { ...result, ...data.event, score: result.score } : result));
      window.dispatchEvent(new CustomEvent('memory-events-changed'));
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Restore failed');
      setSearchState('error');
    } finally {
      setRestoringId(null);
    }
  };

  const runSearch = async (query: string, overrides?: { source?: string; kind?: string; minScore?: string }) => {
    const filters: Record<string, string> = {};
    const source = overrides?.source ?? sourceFilter;
    const kind = overrides?.kind ?? kindFilter;
    const score = overrides?.minScore ?? minScore;

    if (source) filters.source = source;
    if (kind) filters.kind = kind;

    setSearchState('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/search-memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 10,
          minScore: Number(score) || 0,
          includeArchived,
          filters: Object.keys(filters).length ? filters : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Search failed: ${res.status}`);
      }

      setSearchResults(data.results as SearchResult[]);
      setSearchState('success');
    } catch (error) {
      console.error('Error searching memory events:', error);
      setSearchResults([]);
      setErrorMessage(error instanceof Error ? error.message : 'Search failed');
      setSearchState('error');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchState('idle');
      setErrorMessage('');
      return;
    }
    await runSearch(query);
  };

  const handleLens = async (lens: typeof MEMORY_LENSES[number]) => {
    setSearchQuery(lens.query);
    setSourceFilter('agent');
    setKindFilter(lens.kind);
    setMinScore('0');
    await runSearch(lens.query, { source: 'agent', kind: lens.kind, minScore: '0' });
  };

  return (
    <div className={styles.searchSection}>
      <div className={styles.sectionHeader}>
        <span>Semantic memory search</span>
        <small>Search by meaning, then narrow the bones.</small>
        <button type="button" className={styles.refreshButton} onClick={handleRefresh}>
          Refresh memories
        </button>
      </div>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          placeholder="Search memories by meaning..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
          disabled={searchState === 'loading'}
        />
        <button
          type="submit"
          disabled={searchState === 'loading' || !searchQuery.trim()}
          className={`${searchState === 'loading' ? styles.searchLoading : ''} ${styles.searchButton}`}
        >
          {searchState === 'loading' ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className={styles.searchFilters}>
        <label>
          Source
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">Any</option>
            {taxonomy.sources.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">Any</option>
            {taxonomy.kinds.map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label>
          Min score
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
          />
        </label>
        <label className={styles.checkboxFilter}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived
        </label>
      </div>

      <p className={styles.filterHint}>
        {taxonomyState === 'loading'
          ? 'Loading filter values from the archive...'
          : taxonomyState === 'error'
            ? 'Using fallback filters; live taxonomy could not be loaded.'
            : `Filters loaded from ${taxonomy.sources.length} source${taxonomy.sources.length === 1 ? '' : 's'} and ${taxonomy.kinds.length} kind${taxonomy.kinds.length === 1 ? '' : 's'}.`}
        {' '}Scores closer to 1 are stronger semantic matches. Archived results use keyword fallback until restored.
      </p>

      <div className={styles.memoryLenses}>
        <span>Memory lenses</span>
        <div>
          {MEMORY_LENSES.map((lens) => (
            <button
              key={lens.label}
              type="button"
              className={styles.lensButton}
              disabled={searchState === 'loading'}
              onClick={() => handleLens(lens)}
            >
              {lens.label}
            </button>
          ))}
        </div>
      </div>

      {searchState === 'error' && (
        <p className={styles.searchError}>{errorMessage}</p>
      )}

      {searchState === 'success' && searchResults.length === 0 && (
        <p className={styles.searchNoResults}>No matching memories found.</p>
      )}

      {searchResults.length > 0 && (
        <div className={styles.searchResults}>
          <h3>Search results</h3>
          <ul className={styles.searchResultsList}>
            {searchResults.map((result) => (
              <li key={result.id} className={styles.searchResultItem}>
                <div className={styles.searchResultContent}>
                  <div className={styles.resultTitleRow}>
                    <strong>{result.kind}</strong>
                    <span>{result.score?.toFixed(3)}</span>
                  </div>
                  <p>{result.summary}</p>
                  <small className={styles.searchResultMeta}>
                    {new Date(result.created_at).toLocaleString()} &bull; {result.source}
                    {result.archived_at ? ` • archived ${new Date(result.archived_at).toLocaleString()}` : ''}
                  </small>
                  {result.archived_at && (
                    <div className={styles.archiveBadge}>Archived{result.archive_reason ? `: ${result.archive_reason}` : ''}</div>
                  )}
                  <div className={styles.memoryActions}>
                    <button type="button" className={styles.copyButton} onClick={() => copyText(result.id, result.id, 'id')}>
                      {copiedId === `id:${result.id}` ? 'Copied ID' : 'Copy ID'}
                    </button>
                    <button type="button" className={styles.copyButton} onClick={() => copyText(JSON.stringify(result, null, 2), result.id, 'json')}>
                      {copiedId === `json:${result.id}` ? 'Copied JSON' : 'Copy JSON'}
                    </button>
                    <button type="button" className={styles.copyButton} onClick={() => copyText(compactSearchContext(result), result.id, 'context')}>
                      {copiedId === `context:${result.id}` ? 'Copied context' : 'Copy context'}
                    </button>
                    {result.archived_at ? (
                      <button
                        type="button"
                        className={styles.restoreButton}
                        disabled={restoringId === result.id}
                        onClick={() => handleRestore(result.id)}
                      >
                        {restoringId === result.id ? 'Restoring...' : 'Restore memory'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={deletingId === result.id}
                        onClick={() => handleDelete(result.id)}
                      >
                        {deletingId === result.id ? 'Archiving...' : 'Archive memory'}
                      </button>
                    )}
                  </div>
                  <details className={styles.memoryDetails}>
                    <summary>Details</summary>
                    <dl className={styles.detailGrid}>
                      <div><dt>ID</dt><dd>{result.id}</dd></div>
                      <div><dt>Source</dt><dd>{result.source}</dd></div>
                      <div><dt>Kind</dt><dd>{result.kind}</dd></div>
                      <div><dt>Score</dt><dd>{result.score?.toFixed(3)}</dd></div>
                      <div><dt>Created</dt><dd>{new Date(result.created_at).toLocaleString()}</dd></div>
                      {result.archived_at && <div><dt>Archived</dt><dd>{new Date(result.archived_at).toLocaleString()}</dd></div>}
                      {result.archived_by && <div><dt>Archived by</dt><dd>{result.archived_by}</dd></div>}
                      {result.archive_reason && <div><dt>Archive reason</dt><dd>{result.archive_reason}</dd></div>}
                    </dl>
                    <div className={styles.detailBlock}>
                      <span>Summary</span>
                      <p>{result.summary}</p>
                    </div>
                    {result.metadata && Object.keys(result.metadata).length > 0 && (
                      <div className={styles.detailBlock}>
                        <span>Metadata</span>
                        <pre>{JSON.stringify(result.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
