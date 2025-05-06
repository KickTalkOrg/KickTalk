import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const BadgeTooltip = ({ showBadgeInfo, mousePos, badgeInfo }) => {
  const badgeTooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!mousePos.x || !mousePos.y || !showBadgeInfo) {
      return;
    }

    const calculatePosition = () => {
      if (!badgeTooltipRef.current) return;

      const tooltipHeight = 300;
      const tooltipWidth = 400;

      let top = mousePos.y + 15;
      let left = mousePos.x + 15;

      if (left - tooltipWidth > 80) {
        left = mousePos.x - 180;
      }

      if (top - tooltipHeight > 140) {
        top = mousePos.y - 140;
      }

      setPosition({ top, left });
    };

    calculatePosition();
  }, [mousePos]);

  if (!showBadgeInfo) return null;

  return (
    <div
      ref={badgeTooltipRef}
      style={{
        top: showBadgeInfo && position.top,
        left: showBadgeInfo && position.left,
        opacity: showBadgeInfo ? 1 : 0,
        height: "140px",
      }}
      className={clsx("tooltipItem showTooltip", showBadgeInfo ? "showTooltip" : "")}>
      <img src={badgeInfo?.src} alt={badgeInfo?.title} />
      <span>{badgeInfo?.title}</span>
      {badgeInfo?.owner?.username && (
        <span className="tooltipItemCreatedBy">
          Created by <span className="tooltipItemCreatedByUsername">{badgeInfo?.owner?.username}</span>
        </span>
      )}
    </div>
  );
};

export default BadgeTooltip;
