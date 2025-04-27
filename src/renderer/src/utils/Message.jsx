
import { memo, useCallback } from "react";
import { KickTalkBadges, KickBadges } from "../components/Cosmetics/Badges";
import { MessageParser } from "./MessageParser";

const Message = memo(
  ({ message, chatroomId, subscriberBadges, sevenTVEmotes, kickTalkBadges }) => 
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

    const userKickTalkBadges = kickTalkBadges?.data?.find(
      (badge) => badge.username.toLowerCase() === message?.sender?.username?.toLowerCase(),
    )?.badges;

    // const convertBanTime = (banTime) => {
    //   const minutesToMilliseconds = banTime * 60 * 1000;
    // };

    return (
      <div className="chatMessageItem">
        {message.type === "message" && (
          <span className="chatMessageContainer">
            <div className="chatMessageUser">
              <div className="chatMessageBadges">
                {userKickTalkBadges && <KickTalkBadges badges={userKickTalkBadges} />}
                <KickBadges
                  badges={message.sender.identity?.badges}
                  subscriberBadges={subscriberBadges}
                  kickTalkBadges={kickTalkBadges}
                />
              </div>
              <button
                onClick={handleOpenDialog}
                className="chatMessageUsername"
                style={{ color: message.sender.identity?.color }}>
                <span>{message.sender.username}:&nbsp;</span>
              </button>
            </div>
            {message.deleted ? (
              <span className="chatMessageContent chatMessageDeleted">
                <MessageParser message={message} sevenTVEmotes={sevenTVEmotes} />
                {message?.ban_details && (
                  <span className="deletedMessageText">
                    {`(Timed out by `}
                    <span className="deletedMessageUsername">{message.ban_details?.banned_by?.username}</span>
                    {` for ${message.ban_details?.duration})`}
                  </span>
                )}
              </span>
            ) : (
              <span className="chatMessageContent">
                <MessageParser message={message} sevenTVEmotes={sevenTVEmotes} />
              </span>
            )}
          </span>
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
  (prevProps, nextProps) =>
    prevProps.message.id === nextProps.message.id && prevProps.message.deleted === nextProps.message.deleted,
);

export default Message;
