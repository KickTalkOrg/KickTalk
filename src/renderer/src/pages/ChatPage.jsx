import "../assets/styles/pages/ChatPage.css";
import { useEffect, useState } from "react";
import Chat from "../components/Chat";
import Navbar from "../components/Navbar";
import TitleBar from "../components/TitleBar";

function ChatPage() {
  const [activeChatroomId, setActiveChatroomId] = useState(null);

  const [kickTalkBadges, setKickTalkBadges] = useState(null);

  return (
    <div>
      <TitleBar />

      <div className="chatWrapper">
        <div className="chatNavigation">
          <Navbar currentChatroomId={activeChatroomId} onSelectChatroom={setActiveChatroomId} />
        </div>

        {activeChatroomId ? (
          <Chat chatroomId={activeChatroomId} />
        ) : (
          <div className="chatroomsEmptyState">
            <h1>No Chats</h1>
            <p>Add a chatroom by using "CTRL +" or clicking Add top right</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
