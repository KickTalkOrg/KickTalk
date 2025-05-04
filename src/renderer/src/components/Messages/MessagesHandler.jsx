import { memo } from "react";
import useChatStore from "../../providers/ChatProvider";
import Message from "../../utils/Message";

const MessagesHandler = memo(
  ({ chatroomId, slug, channel7TVEmotes, subscriberBadges, kickTalkBadges, updateSoundPlayed, settings }) => {
    const messages = useChatStore((state) => state.messages[chatroomId]);
    const stvCosmetics = useChatStore((state) => state.chatroomCosmetics);

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
              updateSoundPlayed={updateSoundPlayed}
              settings={settings}
              stvCosmetics={stvCosmetics}
            />
          );
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.chatroomId === nextProps.chatroomId;
  },
);

export default MessagesHandler;
