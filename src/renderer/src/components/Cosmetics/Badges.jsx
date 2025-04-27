import { memo, useState } from "react";
import { kickBadgeMap } from "../../../../../utils/constants";
import EmoteTooltip from "./EmoteTooltip";

const Badge = memo(({ badge, subscriberBadges }) => {
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);
  const [mousePos, setMousePos] = useState({ x: null, y: null });

  const badgeInfo = badge.type === "subscriber" ? kickBadgeMap[badge.type](badge, subscriberBadges) : kickBadgeMap[badge.type];

  const handleMouseEnter = () => {
    setShowBadgeInfo(true);
  };

  const handleMouseLeave = () => {
    setShowBadgeInfo(false);
  };

  const handleMouseMove = (e) => {
    if (showBadgeInfo) {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  return (
    <div className="chatroomBadge" key={badge.type} onMouseMove={handleMouseMove}>
      <EmoteTooltip showBadgeInfo={showBadgeInfo} mousePos={mousePos} badgeInfo={badgeInfo} />
      <img
        key={badge.type}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="chatroomBadgeIcon"
        src={badgeInfo.type === "subscriber" ? "https://www.kickdatabase.com/kickBadges/subscriber.svg" : badgeInfo.src}
        alt={badge.type}
      />
    </div>
  );
});

const KickBadges = memo(({ badges, subscriberBadges = null, kickTalkBadges = null }) => {
  if (!badges?.length) return null;

  return badges.map((badge) => <Badge key={badge.type} badge={badge} subscriberBadges={subscriberBadges} />);
});

const KickTalkBadges = memo(({ badges }) => {
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);
  const [mousePos, setMousePos] = useState({ x: null, y: null });

  const handleMouseEnter = () => {
    setShowBadgeInfo(true);
  };

  const handleMouseLeave = () => {
    setShowBadgeInfo(false);
  };

  const handleMouseMove = (e) => {
    if (showBadgeInfo) {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  return badges.map((badge) => {
    const badgeUrl = `https://api.kicktalk.app/badges/${badge.type}`;
    return (
      <div className="chatroomBadge" key={badge.type} onMouseMove={handleMouseMove}>
        <EmoteTooltip showBadgeInfo={showBadgeInfo} mousePos={mousePos} badgeInfo={{ ...badge, src: badgeUrl }} />
        <img
          className="chatroomBadgeIcon"
          src={badgeUrl}
          alt={badge.title}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    );
  });
});

const SevenTVBadges = ({}) => {};

export { KickBadges, KickTalkBadges };
