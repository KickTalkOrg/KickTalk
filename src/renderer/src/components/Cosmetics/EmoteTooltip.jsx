import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const EmoteTooltip = ({ showBadgeInfo, mousePos, badgeInfo }) => {
  const toolTipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const calculatePosition = () => {
      if (!toolTipRef.current) return;
      let top = mousePos.y - toolTipRef.current.offsetHeight + 140;
      let left = mousePos.x - toolTipRef.current.offsetWidth / 8;

      if (left < 0) {
        left = 0;
      } else if (left + toolTipRef.current.offsetWidth > window.innerWidth) {
        left = window.innerWidth - toolTipRef.current.offsetWidth - 10;
      }

      setPosition({ top, left });
    };

    calculatePosition();
  }, [mousePos]);

  return (
    <div
      ref={toolTipRef}
      style={{
        top: showBadgeInfo && position.top,
        left: showBadgeInfo && position.left,
      }}
      className={clsx("emoteTooltip", showBadgeInfo ? "showTooltip" : "")}>
      <img src={badgeInfo.type === "subscriber" ? "https://www.kickdatabase.com/kickBadges/subscriber.svg" : badgeInfo.src} />
      <span>{badgeInfo.title}</span>
    </div>
  );
};

export default EmoteTooltip;
