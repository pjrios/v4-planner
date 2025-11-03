import { useState, useCallback, useEffect } from 'react';
import { FolderOpen, Upload, FileText, Search, Trash2, X, Sparkles } from 'lucide-react';
import { DataStore } from '../../data/db';
import type { Document } from '../../data/types';
import { formatFileSize, getDocumentIcon, createDocumentFromFile } from '../../lib/documentUtils';
import { parseDocument } from '../../lib/documentParser';
import { processDocumentForEmbeddings } from '../../lib/embeddings';
import { hybridSearch, keywordSearch } from '../../lib/documentSearch';
import type { SearchResult } from '../../lib/documentSearch';

export function DocumentsWorkspace() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchMode, setSearchMode] = useState<'keyword' | 'semantic'>('keyword');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const allDocs = await DataStore.getAll('documents');
      allDocs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      setDocuments(allDocs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // Perform semantic search when query is long enough
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const results = searchMode === 'semantic' 
          ? await hybridSearch(searchQuery, 20)
          : await keywordSearch(searchQuery, 20);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        // Fallback to keyword search
        try {
          const results = await keywordSearch(searchQuery, 20);
          setSearchResults(results);
        } catch (fallbackError) {
          console.error('Fallback search error:', fallbackError);
          setSearchResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchMode]);

  const handleFolderUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      // Process files sequentially to avoid overwhelming the browser
      for (const file of files) {
        try {
          const docData = await createDocumentFromFile(file);
          
          // Try to parse the file to extract text content
          if (docData.type !== 'other') {
            const parseResult = await parseDocument(file, docData.type);
            if (parseResult.text && !parseResult.error) {
              docData.content = parseResult.text;
            }
          }
          
          const id = crypto.randomUUID();
          const document: Document = { ...docData, id };
          await DataStore.save('documents', document);
          
          // Generate embeddings in background (don't wait for it)
          if (document.content && document.content.trim().length > 0) {
            processDocumentForEmbeddings(document).catch((error) => {
              console.warn(`Failed to generate embeddings for ${document.name}:`, error);
            });
          }
        } catch (error) {
          console.error(`Failed to process file ${file.name}:`, error);
          // Continue with other files even if one fails
        }
      }

      await loadDocuments();
    } catch (error) {
      console.error('Failed to upload files:', error);
      alert('Failed to upload files. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [loadDocuments]);

  const handleDeleteDocument = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`Are you sure you want to delete "${name}"?`)) {
        return;
      }

      try {
        await DataStore.remove('documents', id);
        // Also remove associated vectors if any
        const vectors = await DataStore.getAll('documentVectors');
        const vectorsToDelete = vectors.filter((v) => v.documentId === id);
        for (const vec of vectorsToDelete) {
          await DataStore.remove('documentVectors', vec.id);
        }
        await loadDocuments();
      } catch (error) {
        console.error('Failed to delete document:', error);
        alert('Failed to delete document. Please try again.');
      }
    },
    [loadDocuments]
  );

  const filteredDocuments = documents.filter((doc) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        doc.name.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
        doc.path?.toLowerCase().includes(query) ||
        doc.content?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Type filter
    if (selectedFilter !== 'all') {
      if (selectedFilter !== doc.type) return false;
    }

    return true;
  });

  const documentTypes = Array.from(new Set(documents.map((d) => d.type)));
  const totalSize = documents.reduce((sum, doc) => sum + doc.size, 0);

  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8">
      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <FolderOpen className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Documents Library</h2>
            <p className="text-sm text-slate-400">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'} • {formatFileSize(totalSize)}
            </p>
          </div>
        </div>

        {/* Upload buttons */}
        <div className="flex items-center gap-2">
          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40">
            {isUploading ? (
              <>
                <Upload className="h-4 w-4 animate-pulse" aria-hidden />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden />
                Upload files
              </>
            )}
            <input
              type="file"
              multiple
              onChange={handleFolderUpload}
              disabled={isUploading}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </label>
          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-full bg-accent/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-accent disabled:cursor-not-allowed disabled:bg-accent/40">
            {isUploading ? (
              <>
                <FolderOpen className="h-4 w-4 animate-pulse" aria-hidden />
                Uploading...
              </>
            ) : (
              <>
                <FolderOpen className="h-4 w-4" aria-hidden />
                Upload folder
              </>
            )}
            <input
              type="file"
              multiple
              // @ts-ignore - webkitdirectory is a valid HTML attribute
              webkitdirectory=""
              onChange={handleFolderUpload}
              disabled={isUploading}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </label>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 pl-10 pr-3 py-2 text-sm text-white shadow-inner shadow-black/20 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}
        </div>

        {/* Search mode toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchMode('keyword')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              searchMode === 'keyword'
                ? 'bg-accent/25 text-white'
                : 'border border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Search className="mr-1 inline h-3 w-3" />
            Keyword
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('semantic')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              searchMode === 'semantic'
                ? 'bg-accent/25 text-white'
                : 'border border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Sparkles className="mr-1 inline h-3 w-3" />
            Semantic
          </button>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              selectedFilter === 'all'
                ? 'bg-accent/25 text-white'
                : 'border border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {documentTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedFilter(type)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedFilter === type
                  ? 'bg-accent/25 text-white'
                  : 'border border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Documents grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <div className="text-center">
            <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p>Loading documents...</p>
          </div>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 bg-slate-900/50 py-16 text-center">
          <FolderOpen className="mx-auto mb-4 h-12 w-12 text-slate-500" aria-hidden />
          <h3 className="mb-2 text-lg font-semibold text-white">No documents found</h3>
          <p className="text-sm text-slate-400">
            {searchQuery || selectedFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Upload your first folder to get started'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="group relative rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-accent/60 hover:bg-white/10"
            >
              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDeleteDocument(doc.id, doc.name)}
                className="absolute right-2 top-2 rounded-full border border-white/10 bg-slate-900/80 p-1.5 text-slate-300 opacity-0 transition hover:border-red-500/50 hover:text-red-300 group-hover:opacity-100"
                aria-label={`Delete ${doc.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>

              {/* Icon */}
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">{getDocumentIcon(doc.type)}</span>
                <div className="flex-1">
                  <h3 className="truncate text-sm font-semibold text-white">{doc.name}</h3>
                  <p className="text-xs text-slate-400">{formatFileSize(doc.size)}</p>
                </div>
              </div>

              {/* Metadata */}
              <div className="space-y-1 text-xs text-slate-400">
                {doc.path && (
                  <div className="truncate">
                    📁 <span className="ml-1">{doc.path}</span>
                  </div>
                )}
                <div>
                  📅 {new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                {doc.tags && doc.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.tags.slice(0, 2).map((tag, idx) => (
                      <span key={idx} className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
                        {tag}
                      </span>
                    ))}
                    {doc.tags.length > 2 && (
                      <span className="text-xs text-slate-500">+{doc.tags.length - 2}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              {doc.description && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-400">{doc.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

