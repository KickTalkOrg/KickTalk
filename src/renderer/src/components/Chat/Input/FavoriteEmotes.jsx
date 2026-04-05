import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../Shared/Tooltip";

const FavoriteEmotes = memo(
  ({ favoriteEmotes, onInsert, onSend, onToggleFavorite }) => {
    if (!favoriteEmotes?.length) return null;

    const handleFavoriteClick = (e, emote) => {
      if (e.shiftKey) {
        onInsert?.(emote);
        return;
      }

      const content =
        emote.platform === "kick"
          ? `[emote:${emote.id}:${emote.name}]`
          : emote.name;
      onSend?.(content);
    };

    return (
      <TooltipProvider>
        <div className="favoriteEmotesRow">
          {favoriteEmotes.map((emote) => (
            <Tooltip key={`fav-${emote.platform}-${emote.id}`} delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  className="favoriteEmoteBtn"
                  onClick={(e) => handleFavoriteClick(e, emote)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onToggleFavorite?.(emote);
                  }}
                >
                  <img
                    src={
                      emote.platform === "kick"
                        ? `https://files.kick.com/emotes/${emote.id}/fullsize`
                        : `https://cdn.7tv.app/emote/${emote.id}/1x.webp`
                    }
                    alt={emote.name}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{emote.name}</p>
                <p>Click send • Shift+Click insert • Right-click remove</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    );
  },
  (prev, next) => prev.favoriteEmotes === next.favoriteEmotes,
);

export default FavoriteEmotes;
