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
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Une erreur est survenue</h2>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Le composant a rencontre un probleme inattendu. Rechargez la page pour continuer.
          </p>
          <code className="max-w-md truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {this.state.error?.message}
          </code>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" /> Recharger
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
