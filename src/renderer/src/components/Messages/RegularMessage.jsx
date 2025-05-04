import { memo, useEffect, useState } from "react";
import { MessageParser } from "../../utils/MessageParser";
import { KickBadges, KickTalkBadges, StvBadges } from "../Cosmetics/Badges";
import CopyIcon from "../../assets/icons/copy-simple-fill.svg";
import clsx from "clsx";

const RegularMessage = memo(
  ({
    message,
    userKickTalkBadges,
    subscriberBadges,
    kickTalkBadges,
    sevenTVEmotes,
    handleOpenUserDialog,
    sevenTVSettings,
    stvCosmetics,
    type,
  }) => {
    const [stvBadge, setStvBadge] = useState(null);
    const [stvPaint, setStvPaint] = useState(null);

    useEffect(() => {
      if (stvCosmetics && message.sender.username) {
        const userInfo = stvCosmetics.userInfo?.[message.sender.username.toLowerCase()];
        if (userInfo?.entitlement?.object?.user?.style) {
          const paintId = userInfo.entitlement.object.user.style.paint_id;
          const badgeId = userInfo.entitlement.object.user.style.badge_id;

          const foundPaint = stvCosmetics.chatroomCosmetics?.paints?.find((p) => p.id === paintId);
          const foundBadge = stvCosmetics.chatroomCosmetics?.badges?.find((b) => b.id === badgeId);

          setStvBadge(foundBadge);
          setStvPaint(foundPaint);
        }
      }
    }, [stvCosmetics, message.sender.username]);

    return (
      <span className={`chatMessageContainer ${message.deleted ? "deleted" : ""}`}>
        <div className="chatMessageUser">
          <div className="chatMessageBadges">
            {userKickTalkBadges && <KickTalkBadges badges={userKickTalkBadges} />}
            {stvBadge && <StvBadges stvCosmetics={stvCosmetics} sevenTVSettings={sevenTVSettings} badge={stvBadge} />}
            <KickBadges
              badges={message.sender.identity?.badges}
              subscriberBadges={subscriberBadges}
              kickTalkBadges={kickTalkBadges}
            />
          </div>

          <button
            onClick={handleOpenUserDialog}
            className={clsx("chatMessageUsername", stvPaint && "chatMessageUsernamePaint")}
            style={
              stvPaint
                ? { backgroundImage: stvPaint?.backgroundImage, filter: stvPaint?.shadows }
                : { color: message.sender.identity?.color }
            }>
            <span>{message.sender.username}:&nbsp;</span>
          </button>
        </div>

        <span className="chatMessageContent">
          <MessageParser type={type} message={message} sevenTVEmotes={sevenTVEmotes} sevenTVSettings={sevenTVSettings} />
        </span>

        <div className="chatMessageActions">
          <button
            onClick={() => {
              navigator.clipboard.writeText(message.content);
            }}
            className="chatMessageActionButton">
            <img src={CopyIcon} alt="Copy Message" width={16} height={16} />
          </button>
        </div>
      </span>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message === nextProps.message &&
      prevProps.sevenTVSettings === nextProps.sevenTVSettings &&
      prevProps.stvCosmetics === nextProps.stvCosmetics
    );
  },
);

export default RegularMessage;
