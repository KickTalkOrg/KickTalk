import { memo } from "react";
import { MessageParser } from "../../utils/MessageParser";
import { KickBadges, KickTalkBadges, StvBadges } from "../Cosmetics/Badges";
import CopyIcon from "../../assets/icons/copy-simple-fill.svg";
import clsx from "clsx";
import { useShallow } from "zustand/shallow";
import useCosmeticsStore from "../../providers/CosmeticsProvider";

const RegularMessage = memo(
  ({ message, filteredKickTalkBadges, subscriberBadges, sevenTVEmotes, handleOpenUserDialog, sevenTVSettings, type }) => {
    const userStyle = useCosmeticsStore(useShallow((state) => state.getUserStyle(message.sender.username)));

    return (
      <span className={`chatMessageContainer ${message.deleted ? "deleted" : ""}`}>
        <div className="chatMessageUser">
          <div className="chatMessageBadges">
            {filteredKickTalkBadges && <KickTalkBadges badges={filteredKickTalkBadges} />}
            {userStyle?.badge && <StvBadges badge={userStyle?.badge} />}
            <KickBadges
              badges={message.sender.identity?.badges}
              subscriberBadges={subscriberBadges}
              kickTalkBadges={filteredKickTalkBadges}
            />
          </div>

          <button
            onClick={handleOpenUserDialog}
            className={clsx("chatMessageUsername", userStyle?.paint && "chatMessageUsernamePaint")}
            style={
              userStyle?.paint
                ? { backgroundImage: userStyle?.paint?.backgroundImage, filter: userStyle?.paint?.shadows }
                : { color: message.sender.identity?.color }
            }>
            <span>{message.sender.username}:&nbsp;</span>
          </button>
        </div>

        <span className="chatMessageContent">
          <MessageParser type={type} message={message} sevenTVEmotes={sevenTVEmotes} sevenTVSettings={sevenTVSettings} />
        </span>

        <div className="chatMessageActions">
          <button
            onClick={() => {
              navigator.clipboard.writeText(message.content);
            }}
            className="chatMessageActionButton">
            <img src={CopyIcon} alt="Copy Message" width={16} height={16} />
          </button>
        </div>
      </span>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.message === nextProps.message && prevProps.sevenTVSettings === nextProps.sevenTVSettings;
  },
);

export default RegularMessage;
