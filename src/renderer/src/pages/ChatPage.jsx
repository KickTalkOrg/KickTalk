import "../assets/styles/pages/ChatPage.scss";
import { useState, useEffect } from "react";
import { useSettings } from "../providers/SettingsProvider";
import useChatStore from "../providers/ChatProvider";
import Chat from "../components/Chat";
import Navbar from "../components/Navbar";
import TitleBar from "../components/TitleBar";
import Mentions from "../components/Dialogs/Mentions";

// Telemetry monitoring hook
const useTelemetryMonitoring = () => {
  useEffect(() => {
    const collectMetrics = () => {
      try {
        // Collect DOM node count
        const domNodeCount = document.querySelectorAll('*').length;
        window.app?.telemetry?.recordDomNodeCount(domNodeCount);

        // Collect renderer memory usage
        if (performance.memory) {
          const memoryData = {
            jsHeapUsedSize: performance.memory.usedJSHeapSize,
            jsHeapTotalSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          };
          window.app?.telemetry?.recordRendererMemory(memoryData);
        }
      } catch (error) {
        console.warn('Telemetry collection failed:', error);
      }
    };

    // Collect metrics initially
    collectMetrics();

    // Set up periodic collection every 10 seconds for testing
    const interval = setInterval(collectMetrics, 10000);

    return () => clearInterval(interval);
  }, []);
};

const ChatPage = () => {
  const { settings, updateSettings } = useSettings();
  const setCurrentChatroom = useChatStore((state) => state.setCurrentChatroom);

  const [activeChatroomId, setActiveChatroomId] = useState(null);
  const kickUsername = localStorage.getItem("kickUsername");
  const kickId = localStorage.getItem("kickId");

  // Enable telemetry monitoring
  useTelemetryMonitoring();

  useEffect(() => {
    setCurrentChatroom(activeChatroomId);
  }, [activeChatroomId, setCurrentChatroom]);

  return (
    <div className="chatPageContainer">
      <TitleBar />
      <div className="chatWrapper">
        <div className="chatNavigation">
          <Navbar currentChatroomId={activeChatroomId} kickId={kickId} onSelectChatroom={setActiveChatroomId} />
        </div>

        <div className="chatContent">
          {activeChatroomId && activeChatroomId !== "mentions" ? (
            <Chat
              chatroomId={activeChatroomId}
              kickUsername={kickUsername}
              kickId={kickId}
              settings={settings}
              updateSettings={updateSettings}
            />
          ) : activeChatroomId === "mentions" ? (
            <Mentions setActiveChatroom={setActiveChatroomId} chatroomId={activeChatroomId} />
          ) : (
            <div className="chatroomsEmptyState">
              <h1>No Chatrooms</h1>
              <p>Add a chatroom by using "CTRL"+"t" or clicking Add button</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
