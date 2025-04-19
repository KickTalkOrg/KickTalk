import clsx from "clsx";
import { memo, useEffect, useRef, useState } from "react";
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

  const isNearBottom = () => {
    if (!chatBodyRef.current) return true;
    const { scrollHeight, clientHeight, scrollTop } = chatBodyRef.current;
    return scrollHeight - clientHeight - scrollTop < 100;
  };

  const handleScroll = () => {
    const nearBottom = isNearBottom();
    setShouldAutoScroll(nearBottom);
    setShowScrollToBottom(!nearBottom);
  };

  useEffect(() => {
    if (!chatBodyRef.current || !shouldAutoScroll) return;

    chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - chatBodyRef.current.clientHeight;
  }, [messages]);

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
              sevenTVEmotes={currentChatroom.channel7TVEmotes}
              streamerId={currentChatroom.streamerData.user_id}
              subscriberBadges={subscriberBadges}
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
