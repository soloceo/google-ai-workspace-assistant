import { StrictMode, Component } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidMount() {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleUnhandledRejection = (e: PromiseRejectionEvent) => {
    e.preventDefault();
    console.error('Unhandled promise rejection:', e.reason);
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state as EBState;
    if (hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", fontFamily: "Inter, -apple-system, Arial, sans-serif" }}>
          <div style={{ textAlign: "center", maxWidth: 400, padding: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 4, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <h1 style={{ fontSize: 17, fontWeight: 500, color: "#171A20", margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: "#5C5E62", margin: "0 0 20px", lineHeight: 1.5 }}>
              {error?.message || "An unexpected error occurred."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={this.handleReset}
                style={{ padding: "10px 24px", fontSize: 14, fontWeight: 500, color: "#3E6AE1", background: "#EBF0FD", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: "10px 24px", fontSize: 14, fontWeight: 500, color: "#fff", background: "#3E6AE1", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (this as unknown as { props: EBProps }).props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
