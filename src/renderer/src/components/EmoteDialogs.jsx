import clsx from "clsx";
import KickLogoFull from "../assets/icons/kickLogoFull.svg";
import { memo, useState } from "react";
import useChatStore from "../providers/ChatProvider";
import { useShallow } from "zustand/react/shallow";
import KickLogo from "../assets/icons/kickLogoIcon.svg";
import STVLogo from "../assets/icons/stvLogo.svg";
import { CaretUp } from "@phosphor-icons/react";

const EmoteSection = ({ emotes, title, handleEmoteClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={clsx("kickDialogBodySection", isOpen && "opened")}>
      <div className="kickDialogRowHead">
        <span>{title}</span>

        <button onClick={() => setIsOpen(!isOpen)} className="kickDialogRowHeadBtn">
          <CaretUp size={20} weight={"bold"} />
        </button>
      </div>
      <div className="kickEmoteItems">
        {emotes?.map((emote) => (
          <button onClick={() => handleEmoteClick(emote)} className="kickEmoteItem" key={emote.id}>
            <img src={`https://files.kick.com/emotes/${emote.id}/fullsize`} alt={emote.name} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
};

const SevenTVEmoteDialog = ({ isDialogOpen, sevenTVEmotes }) => {
  return (
    <div className={clsx("emoteDialog", isDialogOpen && "show")}>
      <div className="kickDialogHead">
        <img src={STVLogo} height={20} alt="Kick.com" />
        {/* <div className="kickDialogHeadSearch">
        <input type="text" placeholder="Search" />
        </div> */}
      </div>

      <div className="kickDialogBody">
        {/* {sevenTVEmotes?.map((emoteSection) => {
          return (
            <EmoteSection
              key={emoteSection.name || "sub_emojis"}
              emotes={emoteSection.emotes}
              title={emoteSection.name || "Subscriber Emojis"}
              handleEmoteClick={handleEmoteClick}
            />
          );
        })} */}
      </div>
    </div>
  );
};

const KickEmoteDialog = ({ isDialogOpen, kickEmotes, handleEmoteClick }) => {
  return (
    <div className={clsx("emoteDialog", isDialogOpen && "show")}>
      <div className="kickDialogHead">
        <img src={KickLogoFull} height={16} alt="Kick.com" />
        {/* <div className="kickDialogHeadSearch">
          <input type="text" placeholder="Search" />
        </div> */}
      </div>

      <div className="kickDialogBody">
        {kickEmotes?.map((emoteSection) => {
          return (
            <EmoteSection
              key={emoteSection.name || "sub_emojis"}
              emotes={emoteSection.emotes}
              title={emoteSection.name || "Subscriber Emojis"}
              handleEmoteClick={handleEmoteClick}
            />
          );
        })}
      </div>
    </div>
  );
};

const EmoteDialogs = memo(
  ({ chatroomId, handleEmoteClick }) => {
    const kickEmotes = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.emotes));
    const [activeDialog, setActiveDialog] = useState(null);

    return (
      <>
        <div className="chatEmoteBtns">
          <button className="emoteBtn" onClick={() => setActiveDialog(activeDialog === "7tv" ? null : "7tv")}>
            <img src={STVLogo} height="24px" width="24px" alt="7TV Emotes" />
          </button>
          <button className="emoteBtn kickEmoteButton" onClick={() => setActiveDialog(activeDialog === "kick" ? null : "kick")}>
            <div className="kickEmoteCarousel">
              <img
                className="kickEmote emote"
                src={"https://files.kick.com/emotes/1730756/fullsize"}
                loading="lazy"
                fetchpriority="low"
                decoding="async"
              />
              <img
                className="kickEmote emote"
                src={"https://files.kick.com/emotes/1730772/fullsize"}
                loading="lazy"
                fetchpriority="low"
                decoding="async"
              />
              <img
                className="kickEmote emote"
                src={"https://files.kick.com/emotes/1730825/fullsize"}
                loading="lazy"
                fetchpriority="low"
                decoding="async"
              />
            </div>
          </button>
        </div>

        <div className="emoteDialogs">
          <SevenTVEmoteDialog isDialogOpen={activeDialog === "7tv"} />
          <KickEmoteDialog isDialogOpen={activeDialog === "kick"} kickEmotes={kickEmotes} handleEmoteClick={handleEmoteClick} />
        </div>
      </>
    );
  },
  (prev, next) => prev.chatroomId === next.chatroomId,
);

export default EmoteDialogs;
