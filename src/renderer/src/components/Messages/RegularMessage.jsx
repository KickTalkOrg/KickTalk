import { memo } from "react";
import { MessageParser } from "../../utils/MessageParser";
import { KickBadges, KickTalkBadges } from "../Cosmetics/Badges";

const RegularMessage = memo(
  ({
    message,
    userKickTalkBadges,
    subscriberBadges,
    kickTalkBadges,
    sevenTVEmotes,
    handleOpenUserDialog,
    sevenTVSettings,
    type,
  }) => {
    return (
      <span className={`chatMessageContainer ${message.deleted ? "deleted" : ""}`}>
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
            onClick={handleOpenUserDialog}
            className="chatMessageUsername"
            style={{ color: message.sender.identity?.color }}>
            <span>{message.sender.username}:&nbsp;</span>
          </button>
        </div>

        <span className="chatMessageContent">
          <MessageParser type={type} message={message} sevenTVEmotes={sevenTVEmotes} sevenTVSettings={sevenTVSettings} />
        </span>
      </span>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.message === nextProps.message && prevProps.sevenTVSettings === nextProps.sevenTVSettings;
  },
);

export default RegularMessage;
