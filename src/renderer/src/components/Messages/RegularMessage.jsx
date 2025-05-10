import { memo } from "react";
import { MessageParser } from "../../utils/MessageParser";
import { KickBadges, KickTalkBadges, StvBadges } from "../Cosmetics/Badges";
import CopyIcon from "../../assets/icons/copy-simple-fill.svg";
import PinIcon from "../../assets/icons/pin-filled.svg";
import clsx from "clsx";
import dayjs from "dayjs";
import { useSettings } from "../../providers/SettingsProvider";
const RegularMessage = memo(
  ({
    message,
    filteredKickTalkBadges,
    subscriberBadges,
    userStyle,
    sevenTVEmotes,
    handleOpenUserDialog,
    sevenTVSettings,
    type,
    chatroomName,
  }) => {

    const { settings } = useSettings();

    return (
      <span className={`chatMessageContainer ${message.deleted ? "deleted" : ""}`}>
        <div className="chatMessageUser">
          {settings?.general?.showTimestamps && (
            <span className="chatMessageTimestamp">{dayjs(message.timestamp).format("HH:mm")}</span>
          )}
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

        <div className="chatMessageContent">
          <MessageParser type={type} message={message} sevenTVEmotes={sevenTVEmotes} sevenTVSettings={sevenTVSettings} />
        </div>
        <div className="chatMessageActions">
              <button
            onClick={() => {
              console.log("message", message);
              const data ={
                chatroom_id: message.chatroom_id,
                content: message.content,
                id: message.id,
                sender: message.sender,
                chatroomName: chatroomName,
              }
              window.app.kick.pinMessage(data);
            }}
            className="chatMessageActionButton">
            <img src={PinIcon} alt="Pin Message" width={16} height={16} />
          </button>
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
    return (
      prevProps.message === nextProps.message &&
      prevProps.sevenTVSettings === nextProps.sevenTVSettings &&
      prevProps.sevenTVEmotes === nextProps.sevenTVEmotes &&
      prevProps.userStyle === nextProps.userStyle
    );
  },
);

export default RegularMessage;
