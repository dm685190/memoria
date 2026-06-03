'use client';

import { useState } from 'react';

type SearchResult = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, any>;
  created_at: string;
  score: number;
};

export default function SearchBar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await fetch('/api/search-memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery, limit: 10 }),
      });

      if (!res.ok) {
        throw new Error(`Search failed: ${res.status}`);
      }

      const data = await res.json();
      setSearchResults(data.results as SearchResult[]);
    } catch (error) {
      console.error('Error searching memory events:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="searchSection">
      <form onSubmit={handleSearch} className="searchForm">
        <input
          type="text"
          placeholder="Search memories by meaning..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="searchInput"
          disabled={searchLoading}
        />
        <button
          type="submit"
          disabled={searchLoading || !searchQuery.trim()}
          className={`${searchLoading ? 'searchLoading' : ''} searchButton`}
        >
          {searchLoading ? 'Searching...' : 'Search'}
        </button>
      </form>
      {searchResults.length > 0 && (
        <div className="searchResults">
          <h3>Search Results</h3>
          <ul className="searchResultsList">
            {searchResults.map((result) => (
              <li key={result.id} className="searchResultItem">
                <div className="searchResultContent">
                  <strong>{result.kind}</strong>: {result.summary}
                  <br />
                  <small className="searchResultMeta">
                    Score: {result.score?.toFixed(3)} &bull; 
                    {new Date(result.created_at).toLocaleString()} &bull; 
                    {result.source}
                  </small>
                </div>
              </li>
            ))}
          </ul>
          {searchResults.length === 0 && (
            <p className="searchNoResults">No results found.</p>
          )}
        </div>
      )}
    </div>
  );
}