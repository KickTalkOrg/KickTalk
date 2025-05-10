import { memo, useCallback, useState, useMemo } from "react";
import EmoteTooltip from "./EmoteTooltip";

const Emote = ({ emote, type }) => {
  const { id, name, width, height } = emote;

  const [showEmoteInfo, setShowEmoteInfo] = useState(false);
  const [mousePos, setMousePos] = useState({ x: null, y: null });

  const emoteImageSrc = useMemo(() => {
    return type === "stv" ? `https://cdn.7tv.app/emote/${id}/1x.webp` : `https://files.kick.com/emotes/${id}/fullsize`;
  }, [type, id]);

  // Optimize event handlers with useCallback
  const handleMouseEnter = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    setShowEmoteInfo(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowEmoteInfo(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (showEmoteInfo) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    },
    [showEmoteInfo],
  );

  return (
    <>
      <EmoteTooltip type={type} showEmoteInfo={showEmoteInfo} emoteSrc={emoteImageSrc} mousePos={mousePos} emoteInfo={emote} />
      <div
        className="chatroomEmoteWrapper"
        style={{ width: type === "stv" ? width : "32px", height: type === "stv" ? height : "32px" }}>
        <div
          className="chatroomEmote"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}>
          <img
            className={type === "stv" ? "stvEmote emote" : "kickEmote emote"}
            src={emoteImageSrc}
            alt={name}
            title={name}
            loading="lazy"
            fetchpriority="low"
            decoding="async"
          />
        </div>
      </div>
    </>
  );
};

export default Emote;
