import clsx from "clsx";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { scrollToBottom } from "../utils/ChatUtils";
import { MouseScroll } from "@phosphor-icons/react";
import Message from "../utils/Message";
import ChatInput from "./ChatInput";
import useChatStore from "../providers/ChatProvider";

const kickTalkBadges = await window.app.utils.getKickTalkBadges();

const kickTalkBetaTesters = await window.app.utils.getKickTalkBadges();

// TODO: Separate chatroom inputs / history, each chatroom has its own input
const Chat = memo(({ chatroomId }) => {
  const chatBodyRef = useRef();

  const chatrooms = useChatStore((state) => state.chatrooms.filter((chatroom) => chatroom.id === chatroomId)[0]);
  const messages = useChatStore((state) => state.messages[chatroomId]);

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const subscriberBadges = chatrooms?.streamerData?.subscriber_badges || [];

  const handleScroll = useCallback(() => {
    if (!chatBodyRef.current) return;
    const { scrollHeight, clientHeight, scrollTop } = chatBodyRef.current;
    const nearBottom = scrollHeight - clientHeight - scrollTop < 100;

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
      <div className="chatBody" ref={chatBodyRef} onScroll={handleScroll}>
        {messages?.map((message) => {
          return (
            <Message
              key={message.id}
              chatroomId={chatroomId}
              chatroomName={chatrooms?.slug}
              subscriberBadges={subscriberBadges}
              sevenTVEmotes={chatrooms?.channel7TVEmotes}
              kickTalkBadges={kickTalkBadges}
              message={message}
              kickTalkBetaTesters={kickTalkBetaTesters}
            />
          );
        })}
      </div>

      <div className="chatInputContainer">
        <button
          className={clsx("scrollToBottomBtn", showScrollToBottom && "show")}
          disabled={!showScrollToBottom}
          onClick={() => {
            setShowScrollToBottom(false);
            setShouldAutoScroll(true);
            scrollToBottom(chatBodyRef, setShowScrollToBottom);
          }}>
          Scroll To Bottom <MouseScroll size={32} weight="fill" />
        </button>
        <ChatInput chatroomId={chatroomId} setShouldAutoScroll={setShouldAutoScroll} />
      </div>
    </div>
  );
});

export default Chat;
