import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { userKickTalkBadges } from "../../../../../utils/kickTalkBadges";
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
  const latestSearchContextRef = useRef({});
  const chatroomSettingsRef = useRef(settings?.chatrooms || {});

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

  useEffect(() => {
    latestSearchContextRef.current = {
      messages: messages || [],
      chatroomId,
      sevenTVEmotes: allStvEmotes,
      settings,
      subscriberBadges,
      userChatroomInfo: chatroom?.userChatroomInfo,
      chatroomSlug: chatroom?.slug,
      chatroomName: chatroom?.streamerData?.user?.username,
    };
  }, [
    messages,
    chatroomId,
    allStvEmotes,
    settings,
    subscriberBadges,
    chatroom?.userChatroomInfo,
    chatroom?.slug,
    chatroom?.streamerData?.user?.username,
  ]);

  useEffect(() => {
    chatroomSettingsRef.current = settings?.chatrooms || {};
  }, [settings?.chatrooms]);

  // Ctrl + F to open search dialog
  const handleSearch = useCallback(() => {
    const searchContext = latestSearchContextRef.current;
    setIsSearchOpen(true);

    if (searchContext?.messages?.length > 0) {
      window.app.searchDialog.open({
        messages: searchContext.messages,
        chatroomId: searchContext.chatroomId,
        sevenTVEmotes: searchContext.sevenTVEmotes,
        settings: searchContext.settings,
        subscriberBadges: searchContext.subscriberBadges,
        userChatroomInfo: searchContext.userChatroomInfo,
        chatroomSlug: searchContext.chatroomSlug,
        chatroomName: searchContext.chatroomName,
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        handleSearch();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const chatroomSettings = chatroomSettingsRef.current || {};
        updateSettings("chatrooms", {
          ...chatroomSettings,
          hideEmoteOnlyMessages: !chatroomSettings?.hideEmoteOnlyMessages,
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSearch, updateSettings]);

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
