import clsx from "clsx";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { scrollToBottom } from "../../utils/ChatUtils";
import ChatInput from "./Input";
import useChatStore from "../../providers/ChatProvider";
import MessagesHandler from "../Messages/MessagesHandler";
import { useSettings } from "../../providers/SettingsProvider";
import { userKickTalkBadges } from "../../../../../utils/kickTalkBadges";

import MouseScroll from "../../assets/icons/mouse-scroll-fill.svg?asset";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import StreamerInfo from "./StreamerInfo";
dayjs.extend(relativeTime);

// TODO: Separate chatroom inputs / history, each chatroom has its own input
const Chat = memo(
  ({ chatroomId, kickUsername }) => {
    const chatBodyRef = useRef();
    const { settings } = useSettings();
    const chatroom = useChatStore((state) => state.chatrooms.filter((chatroom) => chatroom.id === chatroomId)[0]);
    const messages = useChatStore((state) => state.messages[chatroomId]);

    // const updateSoundPlayedStore = useChatStore((state) => state.updateSoundPlayed);

    // const updateSoundPlayed = useCallback(
    //   (messageId) => updateSoundPlayedStore(chatroomId, messageId),
    //   [chatroomId, updateSoundPlayedStore],
    // );

    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);

    const subscriberBadges = chatroom?.streamerData?.subscriber_badges || [];

    const handleScroll = useCallback(() => {
      if (!chatBodyRef.current) return;
      const { scrollHeight, clientHeight, scrollTop } = chatBodyRef.current;
      const nearBottom = scrollHeight - clientHeight - scrollTop < 150;

      setShouldAutoScroll(nearBottom);
      setShowScrollToBottom(!nearBottom);
    }, [chatBodyRef]);

    useEffect(() => {
      if (!chatBodyRef.current || !shouldAutoScroll) return;

      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - chatBodyRef.current.clientHeight;
    }, [messages, chatBodyRef, shouldAutoScroll]);

    useEffect(() => {
      setShouldAutoScroll(true);
      setShowScrollToBottom(false);

      if (chatBodyRef.current) {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - chatBodyRef.current.clientHeight;
      }
    }, [chatroomId]);

    console.log("chatroom", chatroom);

    return (
      <div className="chatContainer">
        <StreamerInfo
          streamerData={chatroom?.streamerData}
          streamStatus={chatroom?.streamStatus}
          isStreamerLive={chatroom?.isStreamerLive}
          chatroomId={chatroomId}
        />

        <div className="chatBody" ref={chatBodyRef} onScroll={handleScroll}>
          <MessagesHandler
            chatroomId={chatroomId}
            slug={chatroom?.slug}
            channel7TVEmotes={chatroom?.channel7TVEmotes}
            subscriberBadges={subscriberBadges}
            kickTalkBadges={userKickTalkBadges}
            userChatroomInfo={chatroom?.userChatroomInfo}
            username={kickUsername}
            settings={settings}
          />
        </div>
        <div className="chatBoxContainer">
          <button
            className={clsx("scrollToBottomBtn", showScrollToBottom ? "show" : "hide")}
            disabled={!showScrollToBottom}
            onClick={() => {
              setShowScrollToBottom(false);
              setShouldAutoScroll(true);
              scrollToBottom(chatBodyRef, setShowScrollToBottom);
            }}>
            Scroll To Bottom
            <img src={MouseScroll} width={24} height={24} alt="Scroll To Bottom" />
          </button>
          <ChatInput chatroomId={chatroomId} />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.chatroomId === nextProps.chatroomId &&
      prevProps.settings === nextProps.settings &&
      prevProps.channel7TVEmotes === nextProps.channel7TVEmotes &&
      prevProps.kickUsername === nextProps.kickUsername
    );
  },
);

export default Chat;
