import Updater from "./components/Updater";
import ChatPage from "./pages/ChatPage";
import SettingsProvider from "./providers/SettingsProvider";

function App() {
  return (
    <SettingsProvider>
      <ChatPage />
    </SettingsProvider>
  );
}

export default App;
