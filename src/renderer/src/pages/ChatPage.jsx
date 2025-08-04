import "../assets/styles/pages/ChatPage.scss";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../providers/SettingsProvider";
import useChatStore from "../providers/ChatProvider";
import Chat from "../components/Chat";
import Navbar from "../components/Navbar";
import TitleBar from "../components/TitleBar";
import Mentions from "../components/Dialogs/Mentions";

const ChatPage = () => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const setCurrentChatroom = useChatStore((state) => state.setCurrentChatroom);

  const [activeChatroomId, setActiveChatroomId] = useState(null);
  const kickUsername = localStorage.getItem("kickUsername");
  const kickId = localStorage.getItem("kickId");

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
              <p>{t('chat.addChatroom')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
