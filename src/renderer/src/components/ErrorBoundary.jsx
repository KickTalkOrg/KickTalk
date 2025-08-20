import "@assets/styles/components/ErrorBoundary.scss";
import { Component } from "react";
import clsx from "clsx";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDialog: false,
      copySuccess: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  handleShowDialog = () => {
    this.setState({ showDialog: true });
  };

  handleCloseDialog = () => {
    this.setState({ showDialog: false });
  };

  handleCopyErrors = async () => {
    const { error, errorInfo } = this.state;
    const errorText = `Error: ${error?.toString()}\n\nStack Trace:\n${errorInfo?.componentStack || ""}`;

    try {
      await navigator.clipboard.writeText(errorText);
      this.setState({ copySuccess: true });
      setTimeout(() => this.setState({ copySuccess: false }), 2000);
    } catch (err) {
      console.error("Failed to copy error details:", err);
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="errorBoundary">
          <div className="errorBoundaryContent">
            <h1>Something went wrong</h1>
            <p>An error occurred while rendering the application.</p>

            <div className="errorBoundaryActions">
              <button onClick={this.handleShowDialog} className={clsx("errorButton", this.state.showDialog && "success")}>
                Show Error Details
              </button>
              <button onClick={this.handleReload} className="errorButton primary">
                Reload App
              </button>
            </div>

            {this.state.showDialog && (
              <div className="errorDialog">
                <div className="errorDialogHeader">
                  <h2>Error Details</h2>
                  <button onClick={this.handleCloseDialog} className="closeButton">
                    &times;
                  </button>
                </div>

                <div className="errorDialogContent">
                  <div className="errorDialogContentText">
                    {this.state.error?.toString()}
                    {"\n"}
                    {this.state.errorInfo?.componentStack}
                  </div>
                </div>

                <div className="errorDialogFooter">
                  <button onClick={this.handleCopyErrors} className={clsx("errorButton", this.state.copySuccess && "success")}>
                    {this.state.copySuccess ? "Copied!" : "Copy Error"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
