import "../../assets/styles/components/Chat/Message.scss";
import { memo, useCallback, useRef } from "react";
import ModActionMessage from "./ModActionMessage";
import RegularMessage from "./RegularMessage";
import clsx from "clsx";
import { useShallow } from "zustand/shallow";
import useCosmeticsStore from "../../providers/CosmeticsProvider";
import useChatStore from "../../providers/ChatProvider";
import ReplyMessage from "./ReplyMessage";

const Message = memo(
  ({
    message,
    userChatroomInfo,
    chatroomId,
    subscriberBadges,
    sevenTVEmotes,
    kickTalkBadges,
    settings,
    dialogUserStyle,
    type,
    username,
    chatroomName,
  }) => {
    const messageRef = useRef(null);

    const updateSoundPlayed = useChatStore((state) => state.updateSoundPlayed);

    let userStyle;

    if (message?.sender && type !== "replyThread") {
      if (type === "dialog") {
        userStyle = dialogUserStyle;
      } else {
        userStyle = useCosmeticsStore(useShallow((state) => state.getUserStyle(message?.sender?.username)));
      }
    }

    const handleOpenUserDialog = useCallback(
      (e) => {
        e.preventDefault();

        window.app.userDialog.open({
          sender: message.sender,
          userChatroomInfo,
          chatroomId,
          cords: [e.clientX, e.clientY],
          userStyle,
        });
      },
      [message?.sender, userChatroomInfo, chatroomId, userStyle],
    );

    const filteredKickTalkBadges = kickTalkBadges?.find(
      (badge) => badge.username.toLowerCase() === message?.sender?.username?.toLowerCase(),
    )?.badges;

    const checkForPhrases = () => {
      if (settings?.notifications?.enabled && settings?.notifications?.phrases?.length && message?.sender?.slug !== username) {
        return settings?.notifications?.phrases?.some((phrase) => {
          return message.content?.toLowerCase().includes(phrase.toLowerCase());
        });
      }
    };

    const shouldHighlight = checkForPhrases();

    if (shouldHighlight && settings.notifications.sound && message.soundPlayed !== true && !message?.is_old) {
      window.app.utils.getSoundUrl(settings?.notifications?.soundFile)
        .then((soundUrl) => {
          const audio = new Audio(soundUrl);
          audio.volume = settings?.notifications?.soundVolume || 0.1;
          console.log("Playing sound:", soundUrl);
          audio.play().catch((error) => {
            console.error("Error playing sound:", error);
          });
        })
        .catch((error) => {
          console.error("Error loading sound file:", error);
        });
      updateSoundPlayed(chatroomId, message.id);
    }

    const handleContextMenu = () => {
      window.app.contextMenu.messages(message);
    };

    return (
      <div
        className={clsx(
          "chatMessageItem",
          message.is_old && type !== "replyThread" && "old",
          message.deleted && "deleted",
          type === "dialog" && "dialogChatMessageItem",
          shouldHighlight && "highlighted",
        )}
        onContextMenu={handleContextMenu}
        style={{
          backgroundColor: shouldHighlight ? settings?.notifications?.backgroundColour : "transparent",
        }}
        ref={messageRef}>
        {(message.type === "message" || type === "replyThread") && (
          <RegularMessage
            type={type}
            message={message}
            filteredKickTalkBadges={filteredKickTalkBadges}
            subscriberBadges={subscriberBadges}
            sevenTVEmotes={sevenTVEmotes}
            userStyle={userStyle}
            sevenTVSettings={settings?.sevenTV}
            handleOpenUserDialog={handleOpenUserDialog}
            userChatroomInfo={userChatroomInfo}
            chatroomName={chatroomName}
            chatroomId={chatroomId}
          />
        )}

        {message.type === "reply" && type !== "replyThread" && (
          <ReplyMessage
            type={type}
            message={message}
            filteredKickTalkBadges={filteredKickTalkBadges}
            subscriberBadges={subscriberBadges}
            sevenTVEmotes={sevenTVEmotes}
            userStyle={userStyle}
            sevenTVSettings={settings?.sevenTV}
            handleOpenUserDialog={handleOpenUserDialog}
            userChatroomInfo={userChatroomInfo}
            chatroomName={chatroomName}
            chatroomId={chatroomId}
          />
        )}

        {message.type === "system" && (
          <span className="systemMessage">
            {message.content === "connection-pending"
              ? "Connecting to Channel..."
              : message.content === "connection-success"
                ? "Connected to Channel"
                : message.content}
          </span>
        )}

        {message.type === "mod_action" && <ModActionMessage message={message} />}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.deleted === nextProps.message.deleted &&
      prevProps.settings === nextProps.settings &&
      prevProps.sevenTVEmotes === nextProps.sevenTVEmotes &&
      prevProps.userChatroomInfo === nextProps.userChatroomInfo
    );
  },
);

export default Message;
