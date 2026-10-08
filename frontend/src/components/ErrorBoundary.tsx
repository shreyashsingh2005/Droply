import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Auto-reload on Vite chunk load errors (happens when deploying new versions while users have old app open)
    if (error.message && (
      error.message.includes('dynamically imported module') || 
      error.message.includes('Importing a module script failed') ||
      error.name === 'ChunkLoadError'
    )) {
      const reloaded = sessionStorage.getItem('droply-chunk-reloaded');
      if (!reloaded) {
        sessionStorage.setItem('droply-chunk-reloaded', 'true');
        window.location.reload();
        return;
      }
    }
    
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 sm:p-12 min-h-[60vh] text-center w-full max-w-4xl mx-auto">
          <div className="w-24 h-24 rounded-full bg-status-error/10 text-status-error flex items-center justify-center border border-status-error/20 mb-8 animate-in zoom-in-95 duration-500">
            <AlertCircle size={48} />
          </div>
          <h1 className="text-3xl font-extrabold text-text-primary mb-4">Application Error</h1>
          <p className="text-text-secondary text-lg mb-8 max-w-2xl">
            An unexpected error occurred while rendering the page. Our team has been notified.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-accent-primary hover:bg-accent-hover text-white rounded-xl font-bold transition-all shadow-lg shadow-accent-primary/20 flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} /> Reload Page
            </button>
            <button
              onClick={() => {
                sessionStorage.clear();
                window.location.href = '/';
              }}
              className="px-8 py-3 bg-bg-secondary hover:bg-border-subtle text-text-primary rounded-xl font-bold transition-all border border-border-subtle flex items-center justify-center gap-2"
            >
              <Home size={18} /> Return Home
            </button>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <div className="w-full text-left bg-bg-elevated p-6 rounded-2xl border border-status-error/30 overflow-auto shadow-lg shadow-status-error/5">
              <h3 className="text-status-error font-bold mb-4 flex items-center gap-2">
                <AlertCircle size={16} /> Developer Diagnostics
              </h3>
              <div className="font-mono text-sm space-y-4">
                <div>
                  <div className="text-text-primary font-semibold mb-1">Error:</div>
                  <div className="text-status-error bg-status-error/10 p-3 rounded-lg">{this.state.error.toString()}</div>
                </div>
                {this.state.errorInfo && (
                  <div>
                    <div className="text-text-primary font-semibold mb-1">Component Stack:</div>
                    <pre className="text-text-secondary bg-bg-secondary p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-xs">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
