import { MessageParser } from "../../utils/MessageParser";
import { KickBadges, KickTalkBadges } from "../Cosmetics/Badges";

const RegularMessage = ({
  message,
  userKickTalkBadges,
  subscriberBadges,
  kickTalkBadges,
  sevenTVEmotes,
  handleOpenUserDialog,
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
        <button onClick={handleOpenUserDialog} className="chatMessageUsername" style={{ color: message.sender.identity?.color }}>
          <span>{message.sender.username}:&nbsp;</span>
        </button>
      </div>

      <span className="chatMessageContent">
        <MessageParser message={message} sevenTVEmotes={sevenTVEmotes} />
      </span>
    </span>
  );
};

export default RegularMessage;
