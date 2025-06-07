import "../../assets/styles/components/Chat/Message.scss";
import { memo, useCallback, useRef, useEffect, useMemo } from "react";
import ModActionMessage from "./ModActionMessage";
import RegularMessage from "./RegularMessage";
import clsx from "clsx";
import { useShallow } from "zustand/shallow";
import useCosmeticsStore from "../../providers/CosmeticsProvider";
import useChatStore from "../../providers/ChatProvider";
import ReplyMessage from "./ReplyMessage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../Shared/ContextMenu";

const Message = ({
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
  const getUpdateSoundPlayed = useChatStore(useShallow((state) => state.getUpdateSoundPlayed));
  const getPinMessage = useChatStore(useShallow((state) => state.getPinMessage));
  const getDeleteMessage = useChatStore(useShallow((state) => state.getDeleteMessage));

  let userStyle;

  if (message?.sender && type !== "replyThread") {
    if (type === "dialog") {
      userStyle = dialogUserStyle;
    } else {
      userStyle = useCosmeticsStore(useShallow((state) => state.getUserStyle(message?.sender?.username)));
    }
  }

  // Check if user can moderate
  const canModerate = useMemo(
    () => userChatroomInfo?.is_broadcaster || userChatroomInfo?.is_moderator || userChatroomInfo?.is_super_admin,
    [userChatroomInfo],
  );

  const handleOpenUserDialog = useCallback(
    (e) => {
      e.preventDefault();

      window.app.userDialog.open({
        sender: message.sender,
        userChatroomInfo,
        chatroomId,
        subscriberBadges,
        sevenTVEmotes,
        cords: [e.clientX, e.clientY],
        userStyle,
      });
    },
    [message?.sender, userChatroomInfo, chatroomId, userStyle, subscriberBadges, sevenTVEmotes],
  );

  // Remove useCallback for these since message changes constantly
  const handleCopyMessage = () => {
    if (message?.content) {
      navigator.clipboard.writeText(message.content);
    }
  };

  const handleReply = () => {
    window.app.reply.open(message);
  };

  const handlePinMessage = () => {
    const data = {
      chatroom_id: message.chatroom_id,
      content: message.content,
      id: message.id,
      sender: message.sender,
      chatroomName: chatroomName,
    };
    window.app.kick.getPinMessage(data);
  };

  const handleDeleteMessage = () => {
    getDeleteMessage(chatroomId, message.id);
  };

  const handleViewProfile = () => {
    if (message?.sender?.username) {
      window.open(`https://kick.com/${message.sender.slug}`, "_blank");
    }
  };

  const filteredKickTalkBadges = kickTalkBadges?.find(
    (badge) => badge.username.toLowerCase() === message?.sender?.username?.toLowerCase(),
  )?.badges;

  const checkForPhrases = () => {
    if (
      settings?.notifications?.enabled &&
      (settings?.notifications?.background || settings?.notifications?.sound) &&
      settings?.notifications?.phrases?.length
    ) {
      return settings?.notifications?.phrases?.some((phrase) => {
        return message.content?.toLowerCase().includes(phrase.toLowerCase());
      });
    }
    return false;
  };

  const shouldDetectPhrases = checkForPhrases();
  const shouldHighlight = shouldDetectPhrases && settings?.notifications?.background;

  // Handle notification sound in useEffect
  useEffect(() => {
    if (type === "dialog" || type === "replyThread") return;

    if (shouldDetectPhrases && settings.notifications.sound && message.soundPlayed !== true && !message?.is_old) {
      // Only play sound for messages created within the last 5 seconds
      const messageTime = new Date(message.created_at).getTime();
      const now = Date.now();
      const isRecentMessage = now - messageTime < 5000; // 5 seconds

      if (isRecentMessage) {
        window.app.notificationSounds
          .getSoundUrl(settings?.notifications?.soundFile)
          .then((soundUrl) => {
            const audio = new Audio(soundUrl);
            audio.volume = settings?.notifications?.volume || 0.1;
            audio.play().catch((error) => {
              console.error("Error playing sound:", error);
            });
          })
          .catch((error) => {
            console.error("Error loading sound file:", error);
          });
      }

      getUpdateSoundPlayed(chatroomId, message.id);
    }
  }, [
    shouldDetectPhrases,
    settings?.notifications?.sound,
    settings?.notifications?.soundFile,
    settings?.notifications?.volume,
    message.soundPlayed,
    message.is_old,
    message.created_at,
    chatroomId,
    message.id,
    getUpdateSoundPlayed,
    type,
  ]);

  const showContextMenu = !message?.deleted && message?.type !== "system" && message?.type !== "mod_action";

  const handleOpenReplyThread = useCallback(
    async (chatStoreMessageThread) => {
      if (!message?.metadata?.original_message?.id) return;

      const messageThread = await window.app.replyLogs.get({
        originalMessageId: message?.metadata?.original_message?.id,
        chatroomId,
      });

      const sortedMessages = [...new Set([...chatStoreMessageThread, ...messageThread].map((m) => m.id))]
        .map((id) => [...chatStoreMessageThread, ...messageThread].find((m) => m.id === id))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      await window.app.replyThreadDialog.open({
        chatroomId,
        messages: sortedMessages,
        originalMessageId: message?.metadata?.original_message?.id,
        sevenTVEmotes,
        subscriberBadges,
        userChatroomInfo,
        chatroomName,
        settings,
      });
    },
    [chatroomId, message, userChatroomInfo, chatroomName, sevenTVEmotes, subscriberBadges, settings],
  );

  const messageContent = (
    <div
      className={clsx(
        "chatMessageItem",
        message.is_old && type !== "replyThread" && "old",
        message.deleted && "deleted",
        type === "dialog" && "dialogChatMessageItem",
        shouldHighlight && "highlighted",
      )}
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
          getPinMessage={getPinMessage}
          handleOpenUserDialog={handleOpenUserDialog}
          userChatroomInfo={userChatroomInfo}
          chatroomName={chatroomName}
          chatroomId={chatroomId}
          settings={settings}
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
          handleOpenReplyThread={handleOpenReplyThread}
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

      {message.type === "mod_action" && (
        <ModActionMessage
          message={message}
          chatroomId={chatroomId}
          subscriberBadges={subscriberBadges}
          channel7TVEmotes={sevenTVEmotes}
          userChatroomInfo={userChatroomInfo}
        />
      )}
    </div>
  );

  if (showContextMenu) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{messageContent}</ContextMenuTrigger>
        <ContextMenuContent>
          {message?.content && <ContextMenuItem onSelect={handleCopyMessage}>Copy Message</ContextMenuItem>}

          <ContextMenuItem onSelect={handleReply}>Reply to Message</ContextMenuItem>

          {canModerate && message?.content && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={handlePinMessage}>Pin Message</ContextMenuItem>
              <ContextMenuItem onSelect={handleDeleteMessage}>Delete Message</ContextMenuItem>
            </>
          )}
          {message?.sender && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={handleOpenUserDialog}>Open User Card</ContextMenuItem>
              <ContextMenuItem onSelect={handleViewProfile}>View Profile on Kick</ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return messageContent;
};

export default Message;
