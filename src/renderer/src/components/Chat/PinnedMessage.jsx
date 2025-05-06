import CaretDown from "../../assets/icons/caret-down-bold.svg?asset";
import PushPinSlash from "../../assets/icons/push-pin-slash-fill.svg?asset";
import { clsx } from "clsx";
import { MessageParser } from "../../utils/MessageParser";
import dayjs from "dayjs";
import { memo } from "react";

const PinnedMessage = memo(
  ({ pinnedMessage, showPinnedMessage, setShowPinnedMessage, pinnedMessageExpanded, setPinnedMessageExpanded }) => {
    const pinnedBy = pinnedMessage?.pinned_by || pinnedMessage?.pinnedBy;
    const originalSender = pinnedMessage?.message?.sender;

    return (
      <div className={clsx("pinnedMessage", showPinnedMessage && "open", pinnedMessageExpanded && "expanded")}>
        <div className="pinnedMessageHeader">
          <p>Pinned Message by {originalSender?.username}</p>
          <div className="pinnedMessageActions">
            <button onClick={() => setPinnedMessageExpanded(!pinnedMessageExpanded)}>
              <img
                src={CaretDown}
                width={16}
                height={16}
                alt="Expand Pinned Message"
                style={{ transform: pinnedMessageExpanded ? "rotate(180deg)" : "none" }}
              />
            </button>
            <button onClick={() => setShowPinnedMessage(!showPinnedMessage)}>
              <img src={PushPinSlash} width={14} height={14} alt="Hide Pinned Message" />
            </button>
          </div>
        </div>
        <div className="pinnedMessageContent">
          <p>
            <MessageParser message={pinnedMessage?.message} />
          </p>
        </div>
        <div className={clsx("pinnedMessageFooter", pinnedMessageExpanded && "open")}>
          <div className="pinnedMessageFooterContent">
            <span>Pinned by</span>
            <div className="pinnedMessageFooterUsername">
              <span style={{ color: pinnedBy?.identity?.color }}>
                {pinnedBy?.message?.sender?.username || pinnedBy?.username}
              </span>
            </div>
          </div>
          <span>{pinnedMessage?.finishs_at && `Pin expires ${dayjs(pinnedMessage?.finish_at).fromNow()}`}</span>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.showPinnedMessage === nextProps.showPinnedMessage &&
      prevProps.pinnedMessageExpanded === nextProps.pinnedMessageExpanded &&
      prevProps.pinnedMessage?.id === nextProps.pinnedMessage?.id
    );
  },
);

export default PinnedMessage;
