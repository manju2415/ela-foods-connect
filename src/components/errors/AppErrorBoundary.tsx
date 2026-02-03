import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

/**
 * Prevents fatal render-time errors from blank-screening or crashing the app (especially in native WebViews).
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Keep this as console.error so it appears in device logs.
    console.error("[AppErrorBoundary] Uncaught render error:", error, info);
  }

  private handleReload = () => {
    // Full reload is the safest recovery in hybrid apps.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>
              The app hit an unexpected error. Tap reload to try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {this.state.error ? (
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
                {String(this.state.error)}
              </pre>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={this.handleReload} className="w-full sm:w-auto">
                Reload
              </Button>
              <Button
                variant="outline"
                onClick={() => this.setState({ hasError: false, error: undefined })}
                className="w-full sm:w-auto"
              >
                Try to continue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
