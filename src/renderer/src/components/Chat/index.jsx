import { useCallback, useEffect, useMemo, useState } from "react";
import { userKickTalkBadges } from "@utils/kickTalkBadges";
import ChatInput from "./Input";
import useChatStore from "../../providers/ChatProvider";
import { useShallow } from "zustand/shallow";
import MessagesHandler from "../Messages/MessagesHandler";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import StreamerInfo from "./StreamerInfo";
dayjs.extend(relativeTime);

const Chat = ({ chatroomId, kickUsername, kickId, settings, updateSettings }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const chatroom = useChatStore((state) => state.chatrooms.filter((chatroom) => chatroom.id === chatroomId)[0]);
  const personalEmoteSets = useChatStore((state) => state.personalEmoteSets);
  const messages = useChatStore(useShallow((state) => state.messages[chatroomId] || []));
  
  const markChatroomMessagesAsRead = useChatStore((state) => state.markChatroomMessagesAsRead);
  const donators = useChatStore(useShallow((state) => state.donators));

  // Mark all messages as read when this chatroom becomes active
  useEffect(() => {
    if (chatroomId) {
      markChatroomMessagesAsRead(chatroomId);
    }
  }, [chatroomId, markChatroomMessagesAsRead]);

  const subscriberBadges = chatroom?.streamerData?.subscriber_badges || [];

  const allStvEmotes = useMemo(() => {
    return [...(personalEmoteSets || []), ...(chatroom?.channel7TVEmotes || [])];
  }, [personalEmoteSets, chatroom?.channel7TVEmotes]);

  // Ctrl + F to open search dialog
  const handleSearch = useCallback(() => {
    setIsSearchOpen(true);

    if (messages?.length > 0) {
      window.app.searchDialog.open({
        messages: messages || [],
        chatroomId,
        sevenTVEmotes: allStvEmotes,
        settings,
        subscriberBadges,
        userChatroomInfo: chatroom?.userChatroomInfo,
        chatroomSlug: chatroom?.slug,
        chatroomName: chatroom?.streamerData?.user?.username,
      });
    }
  }, [messages, isSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        handleSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSearch]);

  return (
    <div className="chatContainer">
      <StreamerInfo
        streamerData={chatroom?.streamerData}
        streamStatus={chatroom?.streamStatus}
        userChatroomInfo={chatroom?.userChatroomInfo}
        isStreamerLive={chatroom?.isStreamerLive}
        chatroomId={chatroomId}
        settings={settings}
        handleSearch={handleSearch}
        updateSettings={updateSettings}
      />

      <div className="chatBody">
        <MessagesHandler
          messages={messages}
          chatroomId={chatroomId}
          slug={chatroom?.slug}
          allStvEmotes={allStvEmotes}
          subscriberBadges={subscriberBadges}
          kickTalkBadges={userKickTalkBadges}
          userChatroomInfo={chatroom?.userChatroomInfo}
          username={kickUsername}
          userId={kickId}
          settings={settings}
          donators={donators}
        />
      </div>
      <div className="chatBoxContainer">
        <ChatInput chatroomId={chatroomId} settings={settings} />
      </div>
    </div>
  );
};

export default Chat;
