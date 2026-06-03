'use client';

import { useState } from 'react';
import styles from '../page.module.css';

type SearchResult = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, any> | null;
  created_at: string;
  score: number;
};

type SearchState = 'idle' | 'loading' | 'success' | 'error';

const SOURCE_OPTIONS = ['openclaw', 'supabase', 'dashboard', 'system'];
const KIND_OPTIONS = ['deployment', 'decision', 'error', 'milestone', 'note', 'system'];

export default function SearchBar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [minScore, setMinScore] = useState('0.25');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

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
            {SOURCE_OPTIONS.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">Any</option>
            {KIND_OPTIONS.map((kind) => (
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
                  </small>
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
