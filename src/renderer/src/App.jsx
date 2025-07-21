import ChatPage from "./pages/ChatPage";
import SettingsProvider from "./providers/SettingsProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Loader from "./pages/Loader";
import { useEffect } from "react";

const App = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      if (window.performance.memory) {
        window.app.telemetry.recordRendererMemory(window.performance.memory);
      }
      window.app.telemetry.recordDomNodeCount(document.getElementsByTagName('*').length);
    }, 15000); // 15 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <ErrorBoundary>
      <Loader />
      <SettingsProvider>
        <ChatPage />
      </SettingsProvider>
    </ErrorBoundary>
  );
};

export default App;
