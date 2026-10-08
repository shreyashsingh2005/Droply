import { useState, useEffect } from 'react';
import { getHistory, deleteHistoryRecord, clearHistory, type HistoryRecord } from '../services/db';
import { FileIcon, Trash2, AlertCircle, HardDrive, History as HistoryIcon, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export function History() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = async () => {
    try {
      const data = await getHistory();
      setRecords(data);
    } catch (err) {
      setError('Failed to load history from local database.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);



  const handleDelete = async (id: string) => {
    try {
      await deleteHistoryRecord(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Failed to delete record', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearHistory();
      setRecords([]);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear history', err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredRecords = records.filter(r => r.filename.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-full max-w-4xl mx-auto mt-16 pb-32 px-4 sm:px-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-text-primary flex items-center gap-3">
            <HistoryIcon size={32} className="text-accent-primary" />
            Received Files
          </h1>
          <p className="text-text-secondary mt-2">
            Files you have successfully received are saved securely on this device.
          </p>
        </div>
        
        {records.length > 0 && (
          <button 
            onClick={() => setShowClearConfirm(true)}
            className="px-4 py-2 text-sm font-bold text-status-error bg-status-error/10 hover:bg-status-error/20 rounded-lg transition-colors border border-status-error/20 flex items-center gap-2"
          >
            <Trash2 size={16} /> Clear History
          </button>
        )}
      </div>

      {showClearConfirm && (
        <div className="mb-8 p-6 bg-status-error/5 border border-status-error/20 rounded-2xl animate-in fade-in slide-in-from-top-2">
          <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-2">
            <AlertCircle size={20} className="text-status-error" />
            Clear all received files?
          </h3>
          <p className="text-text-secondary mb-4">
            This will permanently delete all files stored in your local browser history. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button 
              onClick={handleClearAll}
              className="px-6 py-2 bg-status-error hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
            >
              Yes, delete all
            </button>
            <button 
              onClick={() => setShowClearConfirm(false)}
              className="px-6 py-2 bg-bg-secondary hover:bg-border-subtle text-text-primary rounded-xl font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden transition-all duration-300">
        <div className="p-6 border-b border-border-subtle bg-bg-elevated/80">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
            <input 
              type="text" 
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-secondary border border-border-subtle rounded-xl pl-12 pr-4 py-3 text-text-primary focus:outline-none focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan transition-all"
            />
          </div>
        </div>

        <div className="divide-y divide-border-subtle">
          {loading ? (
            <div className="p-12 text-center text-text-secondary flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-border-subtle border-t-accent-primary rounded-full animate-spin"></div>
              Loading history...
            </div>
          ) : error ? (
            <div className="p-12 text-center text-status-error">
              <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
              {error}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-6">
                <HardDrive size={32} className="text-text-secondary" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">No files found</h3>
              <p className="text-text-secondary mb-6">
                {search ? "No files match your search." : "You haven't received any files yet."}
              </p>
              {!search && (
                <Link to="/receive" className="px-6 py-3 bg-accent-primary hover:bg-accent-hover text-white rounded-xl font-bold transition-colors inline-block">
                  Receive Files
                </Link>
              )}
            </div>
          ) : (
            filteredRecords.map((record) => (
              <div key={record.id} className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-bg-secondary/30 transition-colors">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-lg bg-bg-secondary flex items-center justify-center text-text-secondary flex-shrink-0 border border-border-subtle">
                    <FileIcon size={24} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-text-primary font-bold truncate text-lg" title={record.filename}>
                      {record.filename}
                    </h4>
                    <div className="flex items-center gap-3 text-sm text-text-secondary mt-1">
                      <span>{formatSize(record.size)}</span>
                      <span>•</span>
                      <span>{new Date(record.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flex-1 sm:flex-none px-4 py-2 bg-bg-secondary text-text-secondary rounded-lg font-semibold border border-border-subtle flex items-center justify-center text-sm">
                    File Saved Locally
                  </div>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="p-2 text-text-secondary hover:text-status-error hover:bg-status-error/10 rounded-lg transition-colors border border-transparent hover:border-status-error/20"
                    title="Delete from history"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
