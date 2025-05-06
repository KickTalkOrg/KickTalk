import clsx from "clsx";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { scrollToBottom } from "../utils/ChatUtils";

import MouseScroll from "../assets/icons/mouse-scroll-fill.svg?asset";
import PushPin from "../assets/icons/push-pin-fill.svg?asset";

import ChatInput from "./ChatInput";
import useChatStore from "../providers/ChatProvider";
import PinnedMessage from "./Chat/PinnedMessage";
import MessagesHandler from "./Messages/MessagesHandler";
import { useSettings } from "../providers/SettingsProvider";
import { userKickTalkBadges } from "../../../../utils/kickTalkBadges";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

// TODO: Separate chatroom inputs / history, each chatroom has its own input
const Chat = memo(
  ({ chatroomId }) => {
    const chatBodyRef = useRef();
    const { settings } = useSettings();

    const chatroom = useChatStore((state) => state.chatrooms.filter((chatroom) => chatroom.id === chatroomId)[0]);
    const messages = useChatStore((state) => state.messages[chatroomId]);

    // const updateSoundPlayedStore = useChatStore((state) => state.updateSoundPlayed);

    // const updateSoundPlayed = useCallback(
    //   (messageId) => updateSoundPlayedStore(chatroomId, messageId),
    //   [chatroomId, updateSoundPlayedStore],
    // );

    const [pinnedMessageExpanded, setPinnedMessageExpanded] = useState(false);
    const [showPinnedMessage, setShowPinnedMessage] = useState(false);

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

    return (
      <div className="chatContainer">
        <div className="chatStreamerInfo">
          <div className="chatStreamerInfoContent">
            <span className="streamerName">{chatroom?.streamerData?.user?.username}</span>
            {chatroom?.isStreamerLive && <span className="liveBadgeDot" />}
          </div>

          <div className="chatStreamerLiveStatus">
            {chatroom?.streamStatus?.session_title && (
              <span className="chatStreamerLiveStatusTitle" title={chatroom?.streamStatus?.session_title}>
                {chatroom?.streamStatus?.session_title}
              </span>
            )}
          </div>
          <div className="chatStreamerInfoActions">
            {chatroom?.pinnedMessage && !showPinnedMessage && (
              <button
                className={clsx("pinnedMessageBtn", !showPinnedMessage && "show")}
                disabled={!chatroom?.pinnedMessage}
                onClick={() => setShowPinnedMessage(!showPinnedMessage)}>
                <img src={PushPin} width={20} height={20} alt="Pin Message" />
              </button>
            )}
          </div>
        </div>

        {chatroom?.pinnedMessage && (
          <PinnedMessage
            pinnedMessage={chatroom?.pinnedMessage}
            showPinnedMessage={showPinnedMessage}
            setShowPinnedMessage={setShowPinnedMessage}
            pinnedMessageExpanded={pinnedMessageExpanded}
            setPinnedMessageExpanded={setPinnedMessageExpanded}
          />
        )}

        <div className="chatBody" ref={chatBodyRef} onScroll={handleScroll}>
          <MessagesHandler
            chatroomId={chatroomId}
            slug={chatroom?.slug}
            channel7TVEmotes={chatroom?.channel7TVEmotes}
            subscriberBadges={subscriberBadges}
            kickTalkBadges={userKickTalkBadges}
            // updateSoundPlayed={updateSoundPlayed}
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
          <ChatInput chatroomId={chatroomId} setShouldAutoScroll={setShouldAutoScroll} />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.chatroomId === nextProps.chatroomId && prevProps.settings === nextProps.settings;
  },
);

export default Chat;
