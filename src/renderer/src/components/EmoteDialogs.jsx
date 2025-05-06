import clsx from "clsx";
import KickLogoFull from "../assets/logos/kickLogoFull.svg?asset";
import { memo, useCallback, useState } from "react";
import useChatStore from "../providers/ChatProvider";
import { useShallow } from "zustand/react/shallow";
import STVLogo from "../assets/logos/stvLogo.svg?asset";
import CaretDown from "../assets/icons/caret-down-bold.svg?asset";
import { useRef, useEffect } from "react";
import useClickOutside from "../utils/useClickOutside";
import { debounce } from "lodash";

const EmoteSection = ({ emotes, title, handleEmoteClick, type }) => {
  const [isSectionOpen, setIsSectionOpen] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreTriggerRef = useRef(null);
  const observerRef = useRef(null);

  const loadMoreEmotes = () => {
    setVisibleCount((prev) => Math.min(prev + 20, emotes.length));
  };

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreEmotes();
        }
      },
      { threshold: 0.5, rootMargin: "100px" },
    );

    if (loadMoreTriggerRef.current) {
      observerRef.current.observe(loadMoreTriggerRef.current);
    }

    return () => {
      if (loadMoreTriggerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [loadMoreEmotes]);

  return (
    <div className={clsx("dialogBodySection", isSectionOpen && "opened")}>
      <div className="dialogRowHead">
        <span>{title}</span>
        <button onClick={() => setIsSectionOpen(!isSectionOpen)} className="dialogRowHeadBtn">
          <img src={CaretDown} width={20} height={20} alt="Caret Down" />
        </button>
      </div>
      <div className="emoteItems">
        {emotes?.slice(0, visibleCount).map((emote, index) => (
          <button onClick={() => handleEmoteClick(emote)} className="emoteItem" key={`${emote.id}-${index}`}>
            {type === "kick" ? (
              <img src={`https://files.kick.com/emotes/${emote.id}/fullsize`} alt={emote.name} loading="lazy" decoding="async" />
            ) : (
              <img src={"https://cdn.7tv.app/emote/" + emote.id + "/1x.webp"} alt={emote.name} loading="lazy" decoding="async" />
            )}
          </button>
        ))}
        {visibleCount < emotes.length && <div ref={loadMoreTriggerRef} className="loadMoreTrigger" />}
      </div>
    </div>
  );
};

const SevenTVEmoteDialog = memo(
  ({ isDialogOpen, sevenTVEmotes, handleEmoteClick }) => {
    const emotes = sevenTVEmotes?.emote_set?.emotes;
    return (
      <>
        {isDialogOpen && (
          <div className={clsx("emoteDialog", isDialogOpen && "show")}>
            <div className={clsx("dialogHead", !emotes?.length && "dialogHeadEmpty")}>
              <img src={STVLogo} height={20} alt="7TV Emotes" />
              {/* <div className="dialogHeadSearch">
              <input type="text" placeholder="Search" />
        </div> */}
            </div>
            <div className="dialogBody">
              {emotes?.length ? (
                <EmoteSection emotes={emotes} title="7TV Emotes" type="7tv" handleEmoteClick={handleEmoteClick} />
              ) : (
                <div className="dialogBodyEmpty">
                  <p>No 7TV Emotes</p>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  },
  (prev, next) => prev.sevenTVEmotes === next.sevenTVEmotes && prev.isDialogOpen === next.isDialogOpen,
);

const KickEmoteDialog = memo(
  ({ isDialogOpen, kickEmotes, handleEmoteClick }) => {
    return (
      <div className={clsx("emoteDialog", isDialogOpen && "show")}>
        <div className="dialogHead">
          <img src={KickLogoFull} height={16} alt="Kick.com" />
          {/* <div className="kickDialogHeadSearch">
          <input type="text" placeholder="Search" />
        </div> */}
        </div>

        <div className="dialogBody">
          {kickEmotes?.map((emoteSection, index) => (
            <EmoteSection
              key={`${emoteSection.name || "sub_emojis"}-${index}`}
              emotes={emoteSection.emotes}
              title={emoteSection.name || "Subscriber Emojis"}
              type={"kick"}
              handleEmoteClick={handleEmoteClick}
            />
          ))}
        </div>
      </div>
    );
  },
  (prev, next) => prev.kickEmotes === next.kickEmotes && prev.isDialogOpen === next.isDialogOpen,
);

const EmoteDialogs = memo(
  ({ chatroomId, handleEmoteClick }) => {
    const kickEmotes = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.emotes));
    const sevenTVEmotes = useChatStore(
      useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.channel7TVEmotes),
    );

    const [activeDialog, setActiveDialog] = useState(null);
    const [currentHoverEmote, setCurrentHoverEmote] = useState({});

    const emoteDialogRef = useRef(null);
    useClickOutside(emoteDialogRef, () => setActiveDialog(null));

    const [randomEmotes, setRandomEmotes] = useState([]);

    // Initialize random emotes array once when kickEmotes changes
    useEffect(() => {
      if (!kickEmotes?.length) return;

      const newRandomEmotes = [];
      const globalSet = kickEmotes.find((set) => set.name === "Emojis");
      if (!globalSet?.emotes?.length) return;

      for (let i = 0; i < 10; i++) {
        const randomEmoteIndex = Math.floor(Math.random() * globalSet.emotes.length);
        newRandomEmotes.push(globalSet.emotes[randomEmoteIndex]);
      }

      setRandomEmotes(newRandomEmotes);
      setCurrentHoverEmote(newRandomEmotes[Math.floor(Math.random() * randomEmotes.length)]);
    }, [kickEmotes]);

    const getRandomKickEmote = useCallback(() => {
      if (!randomEmotes.length) return;

      setCurrentHoverEmote(randomEmotes[Math.floor(Math.random() * randomEmotes.length)]);
    }, [randomEmotes]);

    return (
      <>
        <div className="chatEmoteBtns">
          <button
            className={clsx("emoteBtn", activeDialog === "7tv" && "activeDialog")}
            onClick={() => setActiveDialog(activeDialog === "7tv" ? null : "7tv")}>
            <img src={STVLogo} height="24px" width="24px" alt="7TV Emotes" />
          </button>
          <button
            className={clsx("emoteBtn", "kickEmoteButton", activeDialog === "kick" && "activeDialog")}
            onMouseEnter={getRandomKickEmote}
            onClick={() => setActiveDialog(activeDialog === "kick" ? null : "kick")}>
            <img
              className="kickEmote emote"
              src={`https://files.kick.com/emotes/${currentHoverEmote?.id || "1730762"}/fullsize`}
              loading="lazy"
              fetchpriority="low"
              decoding="async"
            />
          </button>
        </div>

        <div className="emoteDialogs" ref={emoteDialogRef}>
          <SevenTVEmoteDialog
            isDialogOpen={activeDialog === "7tv"}
            sevenTVEmotes={sevenTVEmotes}
            handleEmoteClick={handleEmoteClick}
          />
          <KickEmoteDialog isDialogOpen={activeDialog === "kick"} kickEmotes={kickEmotes} handleEmoteClick={handleEmoteClick} />
        </div>
      </>
    );
  },
  (prev, next) => prev.chatroomId === next.chatroomId,
);

export default EmoteDialogs;
