import { memo } from "react";
import useChatStore from "../../providers/ChatProvider";
import Message from "../../utils/Message";

const MessagesHandler = memo(
  ({ chatroomId, slug, channel7TVEmotes, subscriberBadges, kickTalkBadges, settings, username }) => {
    const messages = useChatStore((state) => state.messages[chatroomId]);
    const scilencedUsers = JSON.parse(localStorage.getItem("silencedUsers")) || [];
    scilencedUsers?.data?.forEach((user) => {
      messages?.forEach((message) => {
        if (message.sender?.id === user.id) {
          message.isSilenced = true;
        }
      });
    }
  );
    return (
      <div>
        {messages?.map((message) => {
          if(message.isSilenced) {
            return null;
          }
          return (
            <Message
              key={message.id}
              chatroomId={chatroomId}
              chatroomName={slug}
              subscriberBadges={subscriberBadges}
              sevenTVEmotes={channel7TVEmotes}
              kickTalkBadges={kickTalkBadges}
              message={message}
              settings={settings}
              username={username}
            />
          );
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.chatroomId === nextProps.chatroomId &&
      prevProps.settings === nextProps.settings &&
      prevProps.channel7TVEmotes === nextProps.channel7TVEmotes
    );
  },
);

export default MessagesHandler;
