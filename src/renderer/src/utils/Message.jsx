import "../assets/styles/components/Chat/Message.scss";
import { memo, useCallback, useRef } from "react";
import ModActionMessage from "../components/Messages/ModActionMessage";
import RegularMessage from "../components/Messages/RegularMessage";
import ArrowReplyLineIcon from "../assets/app/arrow_reply_line.svg?asset";
import clsx from "clsx";
import { useShallow } from "zustand/shallow";
import useCosmeticsStore from "../providers/CosmeticsProvider";
import { MessageParser } from "./MessageParser";

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

    let userStyle;
    if (message?.sender) {
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
      [message?.sender, chatroomId, userChatroomInfo],
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

    // if (shouldHighlight && settings.notifications.sound && message.soundPlayed !== true && !message?.is_old) {
    //   const audio = new Audio(settings?.notifications?.soundFile);
    //   audio.volume = settings?.notifications?.soundVolume || 0.1;
    //   audio.play().catch((error) => {
    //     console.error("Error playing sound:", error);
    //   });
    //   updateSoundPlayed(chatroomId, message.id);
    // }

    return (
      <div
        className={clsx(
          "chatMessageItem",
          message.is_old && "old",
          message.deleted && "deleted",
          type === "dialog" && "dialogChatMessageItem",
        )}
        style={{
          backgroundColor: shouldHighlight ? settings?.notifications?.backgroundColour : "transparent",
        }}
        ref={messageRef}>
        {message.type === "message" && (
          <RegularMessage
            type={type}
            message={message}
            filteredKickTalkBadges={filteredKickTalkBadges}
            subscriberBadges={subscriberBadges}
            sevenTVEmotes={sevenTVEmotes}
            userStyle={userStyle}
            sevenTVSettings={settings?.sevenTV}
            handleOpenUserDialog={handleOpenUserDialog}
            chatroomName={chatroomName}
          />
        )}
        {message.type === "reply" && (
          <div className="chatMessageReply">
            <span className="chatMessageReplyText">
              <img className="chatMessageReplySymbol" src={ArrowReplyLineIcon} />
              <span className="chatMessageReplyTextSender">{message?.metadata?.original_sender?.username}:</span>
              <span className="chatMessageReplyTextContent" title={message?.metadata?.original_message?.content}>
                <MessageParser message={message?.metadata?.original_message} type="reply" sevenTVEmotes={sevenTVEmotes} />
              </span>
            </span>

            <RegularMessage
              message={message}
              subscriberBadges={subscriberBadges}
              filteredKickTalkBadges={filteredKickTalkBadges}
              sevenTVEmotes={sevenTVEmotes}
              handleOpenUserDialog={handleOpenUserDialog}
              sevenTVSettings={settings?.sevenTV}
            />
          </div>
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
