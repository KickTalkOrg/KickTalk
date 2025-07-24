import ChatPage from "./pages/ChatPage";
import SettingsProvider from "./providers/SettingsProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Loader from "./pages/Loader";

const App = () => {
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
