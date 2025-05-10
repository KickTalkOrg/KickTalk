import clsx from "clsx";
import { useEffect, useRef, useState, useCallback } from "react";

const EmoteTooltip = ({ showEmoteInfo, mousePos, emoteInfo, type, emoteSrc }) => {
  const emoteTooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const calculatePosition = useCallback(() => {
    if (!mousePos.x || !mousePos.y || !showEmoteInfo || !emoteTooltipRef.current) {
      return;
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const tooltipRect = emoteTooltipRef.current.getBoundingClientRect();

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

    setPosition((prevPos) => (prevPos.top !== top || prevPos.left !== left ? { top, left } : prevPos));
  }, [mousePos, showEmoteInfo]);

  useEffect(() => {
    calculatePosition();
  }, [calculatePosition]);

  if (!showEmoteInfo || !emoteInfo) return null;

  return (
    <div
      ref={emoteTooltipRef}
      style={{
        top: position.top,
        left: position.left,
        opacity: showEmoteInfo ? 1 : 0,
      }}
      className={clsx("tooltipItem", showEmoteInfo ? "emoteTooltip" : "")}>
      <img
        src={emoteSrc}
        className={type === "stv" ? "stvEmote emote " : "kickEmote emote "}
        width={112}
        height={112}
        loading="lazy"
        fetchpriority="low"
        decoding="async"
      />
      <div className="emoteTooltipInfo">
        <div className="emoteTooltipInfoHeader">
          <span>{emoteInfo?.name}</span>
          <p>
            <span>{emoteInfo?.alias ? `Alias of ${emoteInfo?.alias}` : ""}</span>
            <span className="emoteTooltipPlatform">{emoteInfo?.platform === "7tv" ? <span>7TV</span> : <span>Kick</span>}</span>
          </p>
        </div>
        {type === "stv" && (
          <p>
            Made by <span>{emoteInfo?.owner?.username}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default EmoteTooltip;
