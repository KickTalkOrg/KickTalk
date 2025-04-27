import { HashRouter, Routes, Route } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import Settings from "./components/Settings";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/dialog/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
