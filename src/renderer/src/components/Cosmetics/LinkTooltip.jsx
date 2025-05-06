import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const LinkTooltip = ({ showLinkInfo, mousePos, linkInfo }) => {
  const linkTooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!mousePos.x || !mousePos.y || !showLinkInfo || !linkTooltipRef.current) {
      return;
    }

    const calculatePosition = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      const tooltipRect = linkTooltipRef.current.getBoundingClientRect();

      let top = mousePos.y + 15;
      let left = mousePos.x + 15;

      if (left + tooltipRect.width > windowWidth - 20) {
        left = mousePos.x - tooltipRect.width - 15;
      }

      if (left < 20) {
        left = windowWidth - tooltipRect.width - 20;
      }

      if (top + tooltipRect.height > windowHeight - 20) {
        top = mousePos.y - tooltipRect.height - 15;
      }

      if (top < 20) {
        top = windowHeight - tooltipRect.height - 20;
      }

      setPosition({ top, left });
    };

    calculatePosition();
  }, [mousePos, showLinkInfo, linkInfo]);

  if (!showLinkInfo) return null;

  return (
    <div
      ref={linkTooltipRef}
      style={{
        top: position.top,
        left: position.left,
        opacity: showLinkInfo ? 1 : 0,
      }}
      className={clsx("tooltipItem linkTooltip", showLinkInfo ? "showTooltip" : "")}>
      <img
        src={linkInfo?.clipThumbnailUrl}
        alt={linkInfo?.clipTitle}
        className="linkTooltipPreview"
        loading="lazy"
        fetchpriority="low"
        decoding="async"
      />
      <div className="linkTooltipInfo">
        <div className="linkTooltipInfoHeader">
          <h5>Link Title:</h5>
          <span>{linkInfo?.clipTitle}</span>
        </div>
      </div>
    </div>
  );
};

export default LinkTooltip;
