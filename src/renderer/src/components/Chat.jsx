import clsx from "clsx";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "../providers/ChatProvider";
import { scrollToBottom } from "../utils/ChatUtils";
import { MouseScroll } from "@phosphor-icons/react";
import Message from "../utils/Message";
import ChatInput from "./ChatInput";

// TODO: Separate chatroom inputs / history, each chatroom has its own input
const Chat = memo(({ chatroomId }) => {
  const chatBodyRef = useRef();
  const {
    state: { chatrooms, messages },
  } = useChat();

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const currentChatroom = chatrooms.find((chatroom) => chatroom.id === chatroomId);
  const chatroomMessages = messages[chatroomId] || [];
  const subscriberBadges = currentChatroom?.streamerData?.subscriber_badges || [];

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
        {chatroomMessages.map((message) => {
          return (
            <Message
              key={message.id}
              chatroomId={chatroomId}
              chatroomName={currentChatroom.slug}
              subscriberBadges={subscriberBadges}
              sevenTVEmotes={currentChatroom?.channel7TVEmotes}
              message={message}
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
