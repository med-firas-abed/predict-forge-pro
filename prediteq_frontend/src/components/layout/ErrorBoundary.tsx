import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Une erreur est survenue</h2>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            Le composant a rencontré un problème inattendu. Rechargez la page pour continuer.
          </p>
          <code className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 max-w-md truncate">
            {this.state.error?.message}
          </code>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Recharger
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
