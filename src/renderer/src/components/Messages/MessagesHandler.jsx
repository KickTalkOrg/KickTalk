import { memo } from "react";
import useChatStore from "../../providers/ChatProvider";
import Message from "../../utils/Message";

const MessagesHandler = memo(
  ({ chatroomId, slug, channel7TVEmotes, userChatroomInfo, subscriberBadges, kickTalkBadges, settings, username }) => {
    const messages = useChatStore((state) => state.messages[chatroomId]);

    return (
      <div>
        {messages?.map((message) => {
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
              userChatroomInfo={userChatroomInfo}
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
      prevProps.channel7TVEmotes === nextProps.channel7TVEmotes &&
      prevProps.userChatroomInfo === nextProps.userChatroomInfo
    );
  },
);

export default MessagesHandler;
