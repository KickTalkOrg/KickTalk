import { memo, useCallback, useEffect } from "react";
import KickBadges from "../components/Cosmetics/Badges";
import { MessageParser } from "./MessageParser";

const Message = memo(
  ({ message, chatroomId, subscriberBadges, sevenTVEmotes }) => {
    // const settings = window.app.loadSettings();

    const handleOpenDialog = useCallback(
      (e) => {
        e.preventDefault();

        const cords = [e.clientX, e.clientY];
        window.app.userDialog.open({
          sender: message.sender,
          chatroomId,
          cords,
        });
      },
      [message?.sender?.id, chatroomId],
    );

    // useEffect(() => {
    //   if (message.type === "message" && settings?.notifications.length) {
    //     const msg = message.content.toLowerCase();
    //     const hasNotificationPhrase = settings.notificationPhrases.some((phrase) => msg.includes(phrase.toLowerCase()));

    //     if (hasNotificationPhrase && settings.notificationsSound) {
    //       if (settings.notificationSoundFile === "default") {
    //         new Audio(`sounds/default.wav`).play();
    //       }
    //       new Audio(`sounds/${settings.notificationSoundFile}.wav`).play();
    //     }
    //   }
    // }, [message]);

    return (
      <div className="chatMessageItem">
        {message.type === "message" && (
          <>
            <span className="chatMessageContainer">
              <div className="chatMessageUser">
                <div className="chatMessageBadges">
                  <KickBadges badges={message.sender.identity?.badges} subscriberBadges={subscriberBadges} />
                </div>
                <button
                  onClick={handleOpenDialog}
                  className="chatMessageUsername"
                  style={{ color: message.sender.identity?.color }}>
                  <span>{message.sender.username}</span>
                  <span>:&nbsp;</span>
                </button>
              </div>
              <span className="chatMessageContent">
                <MessageParser message={message} sevenTVEmotes={sevenTVEmotes} />
              </span>
            </span>
          </>
        )}
        {message.type === "system" && (
          <span className="systemMessage">
            {message.content === "connection-pending"
              ? "Connecting to Channel..."
              : message.content === "connection-success"
                ? "Connected to Channel"
                : message.content}
          </span>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.message.id === nextProps.message.id,
);

export default Message;
