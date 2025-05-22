import React from "react";
import ChatPage from "./pages/ChatPage";
import SettingsProvider from "./providers/SettingsProvider";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDialog: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Error caught by ErrorBoundary:", error, errorInfo); // Apparatnly this works? Which is pretty nice lol.
  }

  handleShowDialog = () => {
    this.setState({ showDialog: true });
  };

  handleCloseDialog = () => {
    this.setState({ showDialog: false });
  };

  handleCopyErrors = () => {
    const { error, errorInfo } = this.state;
    const errorText = `Error: ${error?.toString()}\n\nStack Trace:\n${errorInfo?.componentStack || ""}`;
    navigator.clipboard.writeText(errorText);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="errorDialogMain">
          <h1 style={{ textAlign: "center" }}>Something went wrong.</h1>
          <button onClick={this.handleShowDialog} style={{ color: "white", marginTop: 16, padding: "8px 16px" }}>
            Show Error Details
          </button>
          {this.state.showDialog && (
            <div className="errorDialog">
              <h2>Error Details</h2>
              <pre className="errorDialogPre">
                {this.state.error?.toString()}
                {"\n"}
                {this.state.errorInfo?.componentStack}
              </pre>
              <button onClick={this.handleCopyErrors} style={{ color: "white", marginRight: 8, padding: "6px 12px" }}>
                Copy
              </button>
              <button onClick={this.handleCloseDialog} style={{ color: "white", padding: "6px 12px" }}>
                Close
              </button>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ChatPage />
      </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
