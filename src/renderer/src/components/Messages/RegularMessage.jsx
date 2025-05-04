import { memo, useEffect, useState } from "react";
import { MessageParser } from "../../utils/MessageParser";
import { KickBadges, KickTalkBadges, StvBadges } from "../Cosmetics/Badges";

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
    stvCosmetics,
  }) => {
    const [stvbadge, setBadge] = useState(null);
    const [stvPaint, setPaint] = useState(null);

    useEffect(() => {
      if (stvCosmetics && message.sender.username) {
        const userInfo = stvCosmetics.userInfo?.[message.sender.username.toLowerCase()];
        if (userInfo?.entitlement?.object?.user?.style) {
          const paintId = userInfo.entitlement.object.user.style.paint_id;
          const badgeId = userInfo.entitlement.object.user.style.badge_id;

          const foundPaint = stvCosmetics.chatroomCosmetics?.paints?.find(
            (p) => p.id === paintId
          );
          const foundBadge = stvCosmetics.chatroomCosmetics?.badges?.find(
            (b) => b.id === badgeId
          );

          console.log("Paint:", foundPaint);
          console.log("Badge:", foundBadge);

          setBadge(foundBadge);
          setPaint(foundPaint);
        }
      }
    }, [stvCosmetics, message.sender.username]);

    return (
      <span className={`chatMessageContainer ${message.deleted ? "deleted" : ""}`}>
        <div className="chatMessageUser">
          <div className="chatMessageBadges">
            {userKickTalkBadges && <KickTalkBadges badges={userKickTalkBadges} />}
            {stvbadge && ( 
              <StvBadges
                stvCosmetics={stvCosmetics}
                sevenTVSettings={sevenTVSettings}
                badge={stvbadge}
              />
            )}
            <KickBadges
              badges={message.sender.identity?.badges}
              subscriberBadges={subscriberBadges}
              kickTalkBadges={kickTalkBadges}
            />
          </div>
          {stvPaint ? (
            <button
              className="chatMessagePaint"
              style={{
                backgroundImage: stvPaint?.backgroundImage,
                boxShadow: stvPaint?.shadows,
              }}
            ><span>{message.sender.username}:&nbsp;</span>
            </button>
          ):(
          <button
            onClick={handleOpenUserDialog}
            className="chatMessageUsername"
            style={{ color: message.sender.identity?.color }}>
            <span>{message.sender.username}:&nbsp;</span>
          </button>)}
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
