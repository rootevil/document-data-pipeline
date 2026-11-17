import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

interface AIInsights {
  detected_category?: string;
  party_name?: string;
  summary?: string;
  total_amount?: number | null;
  currency?: string;
  key_entities?: string[];
}

interface DocumentItem {
  id: number;
  filename: string;
  file_type: string;
  category: string;
  cleaned_text: string;
  structured_data: Record<string, unknown>;
  ai_insights?: AIInsights;
}

interface SearchResult {
  document: DocumentItem;
  similarity_score: number;
}

function App() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState('Auto');
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  // Semantic search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/documents')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load documents');
        return res.json();
      })
      .then((data: DocumentItem[]) => {
        setDocuments(data);
        if (data.length > 0) setSelectedDoc(data[0]);
      })
      .catch((err) => console.error('Error loading documents:', err));
  }, []);

  const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Choose a PDF, Excel, CSV, or TXT file to continue.');
      return;
    }

    setError('');
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('category', category);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail || 'Upload failed. Please try again.');
      } else {
        setDocuments((current) => [data, ...current]);
        setSelectedDoc(data);
        setSelectedFile(null);
        setSearchResults(null);
        setSearchQuery('');
        const input = document.getElementById('document-file') as HTMLInputElement | null;
        if (input) input.value = '';
      }
    } catch {
      setError('Could not connect to the backend server.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }

    setError('');
    setIsSearching(true);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/api/search?q=${encodeURIComponent(trimmed)}`
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail || 'Search failed. Please try again.');
      } else {
        setSearchResults(data);
        if (data.length > 0) {
          setSelectedDoc(data[0].document);
        }
      }
    } catch {
      setError('Could not connect to the backend server.');
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const jsonText = selectedDoc
    ? JSON.stringify(selectedDoc.structured_data ?? {}, null, 2)
    : '';

  const insights = selectedDoc?.ai_insights;

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">DOCUMENT WORKSPACE</p>
          <h1>Document data pipeline</h1>
          <p className="page-description">Upload a file, then review its AI insights, cleaned text, and extracted fields.</p>
        </div>
        <div className="document-count" aria-label={`${documents.length} documents saved`}>
          <span className="count-number">{documents.length}</span>
          <span>saved {documents.length === 1 ? 'document' : 'documents'}</span>
        </div>
      </header>

      <section className="upload-card" aria-labelledby="upload-heading">
        <div className="section-intro">
          <div className="step-mark">01</div>
          <div>
            <h2 id="upload-heading">Add a document</h2>
            <p>Supported formats: PDF, Excel, CSV, and TXT</p>
          </div>
        </div>
        <form className="upload-form" onSubmit={handleUpload}>
          <label className="file-picker" htmlFor="document-file">
            <span className="file-icon" aria-hidden="true">↑</span>
            <span className="file-picker-copy">
              <strong>{selectedFile?.name ?? 'Choose a file'}</strong>
              <span>{selectedFile ? 'Ready to process' : 'Browse files from your device'}</span>
            </span>
            <input
              id="document-file"
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.txt"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] || null);
                setError('');
              }}
            />
            <span className="browse-button">Browse</span>
          </label>
          <label className="field-label" htmlFor="category">Document type</label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="Auto">Auto-detect (AI)</option>
            <option value="Vendor Ledger">Vendor Ledger</option>
            <option value="Invoice">Invoice</option>
            <option value="Spreadsheet">Spreadsheet</option>
            <option value="Contract">Contract</option>
            <option value="Report">Report</option>
          </select>
          <button className="primary-button" type="submit" disabled={isUploading}>
            {isUploading ? <><span className="spinner" /> Analyzing…</> : 'Upload & extract'}
          </button>
        </form>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      <section className="upload-card" aria-labelledby="search-heading">
        <div className="section-intro">
          <div className="step-mark">02</div>
          <div>
            <h2 id="search-heading">Semantic search</h2>
            <p>Find documents by meaning using local vector embeddings</p>
          </div>
        </div>
        <form
          onSubmit={handleSearch}
          style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by topic, party, or transaction (e.g., soap factory payments, rent)..."
            aria-label="Semantic search query"
            style={{
              flex: '1 1 280px',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
            }}
          />
          <button className="primary-button" type="submit" disabled={isSearching}>
            {isSearching ? <><span className="spinner" /> Searching…</> : 'Search'}
          </button>
          {searchResults !== null && (
            <button
              type="button"
              className="browse-button"
              onClick={clearSearch}
              style={{ cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </form>
      </section>

      <section className="workspace" aria-label="Document results">
        <aside className="documents-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{searchResults !== null ? 'SEARCH MATCHES' : 'YOUR LIBRARY'}</p>
              <h2>{searchResults !== null ? 'Matches' : 'Documents'}</h2>
            </div>
            <span className="small-count">
              {searchResults !== null ? searchResults.length : documents.length}
            </span>
          </div>

          {searchResults !== null ? (
            searchResults.length === 0 ? (
              <div className="empty-library">
                <span className="empty-icon" aria-hidden="true">▤</span>
                <strong>No matching documents</strong>
                <p>Try a broader search phrase.</p>
              </div>
            ) : (
              <ul className="document-list">
                {searchResults.map(({ document: doc, similarity_score }) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className={`document-item${selectedDoc?.id === doc.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedDoc(doc)}
                      aria-current={selectedDoc?.id === doc.id ? 'true' : undefined}
                    >
                      <span className="document-file-icon" aria-hidden="true">▧</span>
                      <span className="document-copy">
                        <strong title={doc.filename}>{doc.filename}</strong>
                        <span>
                          {(similarity_score * 100).toFixed(0)}% match <i>·</i> {doc.category} <i>·</i> {doc.file_type}
                        </span>
                      </span>
                      <span className="item-chevron" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : documents.length === 0 ? (
            <div className="empty-library">
              <span className="empty-icon" aria-hidden="true">▤</span>
              <strong>No documents yet</strong>
              <p>Your uploaded files will appear here.</p>
            </div>
          ) : (
            <ul className="document-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className={`document-item${selectedDoc?.id === doc.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedDoc(doc)}
                    aria-current={selectedDoc?.id === doc.id ? 'true' : undefined}
                  >
                    <span className="document-file-icon" aria-hidden="true">▧</span>
                    <span className="document-copy">
                      <strong title={doc.filename}>{doc.filename}</strong>
                      <span>{doc.category} <i>·</i> {doc.file_type}</span>
                    </span>
                    <span className="item-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="results-panel" aria-labelledby="results-heading">
          <div className="results-heading">
            <div>
              <p className="eyebrow">EXTRACTION RESULTS</p>
              <h2 id="results-heading">{selectedDoc ? selectedDoc.filename : 'Review your data'}</h2>
            </div>
            {selectedDoc && <span className="type-badge">{selectedDoc.category}</span>}
          </div>

          {selectedDoc ? (
            <div className="result-grid">
              {insights && (
                <article className="result-card ai-card" style={{ gridColumn: '1 / -1' }}>
                  <div className="result-card-heading">
                    <div className="result-title-group">
                      <span className="result-icon" aria-hidden="true">✦</span>
                      <div>
                        <h3>AI Insights</h3>
                        <p>Structured summary and key entities extracted by Ollama</p>
                      </div>
                    </div>
                    <span className="format-label">
                      {insights.detected_category || 'LLAMA 3.2'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid rgba(148, 163, 184, 0.25)',
                        }}
                      >
                        <p className="eyebrow" style={{ marginBottom: '4px' }}>PARTY / ENTITY</p>
                        <strong>{insights.party_name || 'Not identified'}</strong>
                      </div>

                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid rgba(148, 163, 184, 0.25)',
                        }}
                      >
                        <p className="eyebrow" style={{ marginBottom: '4px' }}>EXTRACTED TOTAL</p>
                        <strong>
                          {insights.total_amount !== null && insights.total_amount !== undefined
                            ? `${insights.currency && insights.currency !== 'Unknown' ? `${insights.currency} ` : ''}${insights.total_amount.toLocaleString()}`
                            : 'N/A'}
                        </strong>
                      </div>
                    </div>

                    {insights.summary && (
                      <p style={{ margin: 0, lineHeight: 1.6 }}>{insights.summary}</p>
                    )}

                    {insights.key_entities && insights.key_entities.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {insights.key_entities.map((entity, idx) => (
                          <span key={idx} className="type-badge">
                            {entity}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              )}

              <article className="result-card text-card">
                <div className="result-card-heading">
                  <div className="result-title-group">
                    <span className="result-icon text-icon" aria-hidden="true">T</span>
                    <div>
                      <h3>Clean Text</h3>
                      <p>Readable text extracted from your document</p>
                    </div>
                  </div>
                  <span className="format-label">TEXT</span>
                </div>
                <pre className="text-output">{selectedDoc.cleaned_text?.trim() || 'No clean text was returned for this document.'}</pre>
              </article>

              <article className="result-card json-card">
                <div className="result-card-heading">
                  <div className="result-title-group">
                    <span className="result-icon json-icon" aria-hidden="true">{'{}'}</span>
                    <div>
                      <h3>Structured JSON</h3>
                      <p>Extracted fields saved with this document</p>
                    </div>
                  </div>
                  <span className="format-label">JSON</span>
                </div>
                <pre className="json-output">{jsonText || '{}'}</pre>
              </article>
            </div>
          ) : (
            <div className="results-empty">
              <span className="empty-results-icon" aria-hidden="true">⌁</span>
              <h3>Select a document to inspect</h3>
              <p>Choose a file from your library, or upload a new one to see its AI insights, cleaned text, and structured fields.</p>
            </div>
          )}
        </section>
      </section>
      <footer className="page-footer">Your uploaded documents and extracted data</footer>
    </main>
  );
}

export default App;
