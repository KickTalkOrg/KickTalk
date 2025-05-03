import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const EmoteTooltip = ({ showEmoteInfo, mousePos, emoteInfo, type }) => {
  const emoteTooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!mousePos.x || !mousePos.y || !showEmoteInfo || !emoteTooltipRef.current) {
      return;
    }

    const calculatePosition = () => {
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

      setPosition({ top, left });
    };

    calculatePosition();
  }, [mousePos, showEmoteInfo]);

  if (!showEmoteInfo) return null;

  return (
    <div
      ref={emoteTooltipRef}
      style={{
        top: position.top,
        left: position.left,
        opacity: showEmoteInfo ? 1 : 0,
      }}
      className={clsx("tooltipItem", showEmoteInfo ? "showTooltip" : "")}>
      <img
        src={
          type === "stv"
            ? `https://cdn.7tv.app/emote/${emoteInfo?.id}/1x.webp`
            : `https://files.kick.com/emotes/${emoteInfo?.id}/fullsize`
        }
        className={type === "stv" ? "stvEmote emote" : "kickEmote emote"}
        width={emoteInfo?.width}
        height={emoteInfo?.height}
        loading="lazy"
        fetchpriority="low"
        decoding="async"
      />
      <div className="emoteTooltipInfo">
        <div className="emoteTooltipInfoHeader">
          <span>{emoteInfo?.name}</span>
          <p>{emoteInfo?.alias ? `Alias of ${emoteInfo?.alias}` : ""}</p>
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
