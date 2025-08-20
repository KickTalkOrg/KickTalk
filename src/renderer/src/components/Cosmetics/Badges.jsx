import { memo, useCallback, useState } from "react";
import { kickBadgeMap } from "@utils/constants";
import BadgeTooltip from "./BadgeTooltip";

const Badge = memo(({ badge, subscriberBadges }) => {
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);
  const [mousePos, setMousePos] = useState({ x: null, y: null });

  const badgeInfo = badge.type === "subscriber" ? kickBadgeMap[badge.type](badge, subscriberBadges) : kickBadgeMap[badge.type];

  if (!badgeInfo) return null;

  const handleMouseEnter = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    setShowBadgeInfo(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowBadgeInfo(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (showBadgeInfo) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    },
    [showBadgeInfo],
  );

  return (
    <div
      className="chatroomBadge"
      key={badge.type}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}>
      <BadgeTooltip showBadgeInfo={showBadgeInfo} mousePos={mousePos} badgeInfo={badgeInfo} />
      <img key={badge.type} className="chatroomBadgeIcon" src={badgeInfo.src} alt={badge.type} />
    </div>
  );
});

const KickBadges = memo(({ badges, subscriberBadges = null }) => {
  if (!badges?.length) return null;

  return badges.map((badge) => <Badge key={badge.type} badge={badge} subscriberBadges={subscriberBadges} />);
});

const KickTalkBadge = memo(({ badge }) => {
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);
  const [mousePos, setMousePos] = useState({ x: null, y: null });

  const handleMouseEnter = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    setShowBadgeInfo(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowBadgeInfo(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (showBadgeInfo) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    },
    [showBadgeInfo],
  );

  const badgeUrl = `https://cdn.kicktalk.app/${badge.type}.webp`;

  return (
    <div
      className="chatroomBadge"
      key={badge.type}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}>
      <BadgeTooltip
        showBadgeInfo={showBadgeInfo}
        mousePos={mousePos}
        badgeInfo={{ ...badge, src: badgeUrl, owner: { username: "d9" }, platform: "KickTalk" }}
      />
      <img className="chatroomBadgeIcon" src={badgeUrl} alt={badge.title} />
    </div>
  );
});

const KickTalkBadges = memo(
  ({ badges }) => {
    return badges.map((badge) => <KickTalkBadge key={badge.type} badge={badge} />);
  },
  (prevProps, nextProps) => {
    return prevProps.badges === nextProps.badges;
  },
);

const StvBadges = memo(({ badge }) => {
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);
  const [mousePos, setMousePos] = useState({ x: null, y: null });

  const handleMouseEnter = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    setShowBadgeInfo(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowBadgeInfo(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (showBadgeInfo) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    },
    [showBadgeInfo],
  );

  const badgeUrl = badge.url;

  return (
    <div
      className="chatroomBadge"
      key={badge.type}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}>
      <BadgeTooltip showBadgeInfo={showBadgeInfo} mousePos={mousePos} badgeInfo={{ ...badge, src: badgeUrl, platform: "7TV" }} />
      <img className="chatroomBadgeIcon" src={badgeUrl} alt={badge.title} />
    </div>
  );
});

export { KickBadges, KickTalkBadges, StvBadges };
