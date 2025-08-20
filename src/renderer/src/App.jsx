import ChatPage from "./pages/ChatPage";
import SettingsProvider from "./providers/SettingsProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Loader from "./pages/Loader";
import ChatHistorySettingsSync from "./components/ChatHistorySettingsSync";

const App = () => {
  return (
    <ErrorBoundary>
      <Loader />
      <SettingsProvider>
        <ChatHistorySettingsSync />
        <ChatPage />
      </SettingsProvider>
    </ErrorBoundary>
  );
};

export default App;
