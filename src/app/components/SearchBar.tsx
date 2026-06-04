'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../page.module.css';

type SearchResult = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, any> | null;
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
  sources: ['openclaw', 'supabase'],
  kinds: ['decision', 'deployment', 'milestone', 'system'],
};

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchState('idle');
      setErrorMessage('');
      return;
    }

    const filters: Record<string, string> = {};
    if (sourceFilter) filters.source = sourceFilter;
    if (kindFilter) filters.kind = kindFilter;

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
          minScore: Number(minScore) || 0,
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
                  {result.metadata && Object.keys(result.metadata).length > 0 && (
                    <details className={styles.metadataDetails}>
                      <summary>metadata</summary>
                      <pre>{JSON.stringify(result.metadata, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
