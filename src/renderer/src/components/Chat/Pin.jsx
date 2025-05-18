import { memo, useState } from "react";
import { clsx } from "clsx";
import { MessageParser } from "../../utils/MessageParser";
import CaretDown from "../../assets/icons/caret-down-bold.svg?asset";
import PushPinSlash from "../../assets/icons/push-pin-slash-fill.svg?asset";
import dayjs from "dayjs";

const Pin = memo(
  ({ showChatters, showPinnedMessage, setShowPinnedMessage, pinDetails, chatroomName, canModerate }) => {
    if (!pinDetails) return null;
    const [isPinnedMessageOpen, setIsPinnedMessageOpen] = useState(false);

    const pinnedBy = pinDetails?.pinned_by || pinDetails?.pinnedBy;
    const originalSender = pinDetails?.message?.sender;

    const getUnpinMessage = async () => {
      const response = await window.app.kick.getUnpinMessage(chatroomName);

      if (response?.code === 201) {
        setShowPinnedMessage(false);
      }
    };

    return (
      <div className={clsx("pinnedMessage", showPinnedMessage && !showChatters && "open", isPinnedMessageOpen && "expanded")}>
        <div className="pinnedMessageHeader">
          <p>Pinned Message by {originalSender?.username}</p>
          <div className="pinnedMessageActions">
            <button onClick={() => setIsPinnedMessageOpen(!isPinnedMessageOpen)}>
              <img
                src={CaretDown}
                width={16}
                height={16}
                alt="Expand Pinned Message"
                style={{ transform: isPinnedMessageOpen ? "rotate(180deg)" : "none" }}
              />
            </button>
            {canModerate && (
              <button onClick={() => getUnpinMessage() && setShowPinnedMessage(false)}>
                <img src={PushPinSlash} width={16} height={16} alt="Hide Pinned Message" />
              </button>
            )}
          </div>
        </div>
        <div className="pinnedMessageContent">
          <MessageParser message={pinDetails?.message} type="minified" />
        </div>
        <div className={clsx("pinnedMessageFooter", isPinnedMessageOpen && "open")}>
          <div className="pinnedMessageFooterContent">
            <span>Pinned by</span>
            <div className="pinnedMessageFooterUsername">
              <span style={{ color: pinnedBy?.identity?.color }}>
                {pinnedBy?.message?.sender?.username || pinnedBy?.username}
              </span>
            </div>
          </div>
          <span>{pinDetails?.finishs_at && `Pin expires ${dayjs(pinDetails?.finish_at).fromNow()}`}</span>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.pinDetails === nextProps.pinDetails &&
      prevProps.showPinnedMessage === nextProps.showPinnedMessage &&
      prevProps.chatroomName === nextProps.chatroomName &&
      prevProps.canModerate === nextProps.canModerate
    );
  },
);

export default Pin;
