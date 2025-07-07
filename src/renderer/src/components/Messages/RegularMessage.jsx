import { memo, useCallback, useMemo } from "react";
import { MessageParser } from "../../utils/MessageParser";
import { KickBadges, KickTalkBadges, StvBadges } from "../Cosmetics/Badges";
import { getTimestampFormat } from "../../utils/ChatUtils";
import CopyIcon from "../../assets/icons/copy-simple-fill.svg?asset";
import ReplyIcon from "../../assets/icons/reply-fill.svg?asset";
import Pin from "../../assets/icons/push-pin-fill.svg?asset";
import clsx from "clsx";
import ModActions from "./ModActions";
import useChatStore from "../../providers/ChatProvider";

const RegularMessage = memo(
  ({
    message,
    kickTalkBadges,
    donatorBadges,
    subscriberBadges,
    userStyle,
    sevenTVEmotes,
    handleOpenUserDialog,
    type,
    chatroomName,
    username,
    chatroomId,
    userChatroomInfo,
    isSearch = false,
    settings,
  }) => {
    const getPinMessage = useChatStore((state) => state.getPinMessage);

    const canModerate = useMemo(
      () => userChatroomInfo?.is_broadcaster || userChatroomInfo?.is_moderator || userChatroomInfo?.is_super_admin,
      [userChatroomInfo],
    );

    const timestamp = useMemo(
      () => getTimestampFormat(message?.created_at, settings?.general?.timestampFormat),
      [message?.created_at, settings?.general?.timestampFormat],
    );

    const handleReply = useCallback(() => {
      window.app.reply.open(message);
    }, [message?.id]);

    const handleCopyMessage = useCallback(() => {
      navigator.clipboard.writeText(message?.content);
    }, [message?.content]);

    const handlePinMessage = useCallback(() => {
      const data = {
        chatroom_id: chatroomId,
        content: message.content,
        id: message.id,
        sender: message.sender,
        chatroomName,
        type,
      };

      getPinMessage(chatroomId, data);
    }, [message?.id, message?.chatroom_id, message?.content, message?.sender, chatroomName, getPinMessage, chatroomId]);

    const usernameStyle = useMemo(() => {
      if (userStyle?.paint) {
        return {
          backgroundImage: userStyle.paint.backgroundImage,
          filter: userStyle.paint.shadows,
        };
      }
      return { 
        color: message.sender.identity?.color || 'var(--text-primary)'
      };
    }, [userStyle?.paint, message.sender.identity?.color]);

    const messageContent = useMemo(
      () => (
        <MessageParser
          type={type}
          message={message}
          chatroomId={chatroomId}
          chatroomName={chatroomName}
          sevenTVEmotes={sevenTVEmotes}
          sevenTVSettings={settings?.sevenTV}
          subscriberBadges={subscriberBadges}
          userChatroomInfo={userChatroomInfo}
        />
      ),
      [type, message, chatroomId, chatroomName, sevenTVEmotes, settings, subscriberBadges, userChatroomInfo],
    );

    const shouldShowModActions = useMemo(() => {
      if (!username || !chatroomName) return false;

      return (
        canModerate &&
        settings?.moderation?.quickModTools &&
        message?.sender?.username.toLowerCase() !== chatroomName.toLowerCase() &&
        message?.sender?.username.toLowerCase() !== username.replace("-", "_").toLowerCase()
      );
    }, [canModerate, settings?.moderation?.quickModTools, message?.deleted, message?.sender?.username, chatroomName, username]);

    return (
      <span className={clsx("chatMessageContainer", {
        deleted: message.deleted
      })}>
        <div className="chatMessageUser">
          {settings?.general?.timestampFormat !== "disabled" && <span className="chatMessageTimestamp">{timestamp}</span>}
          {shouldShowModActions && <ModActions chatroomName={chatroomName} message={message} />}

          <div className="chatMessageBadges">
            {kickTalkBadges && <KickTalkBadges badges={kickTalkBadges} />}
            {donatorBadges && <KickTalkBadges badges={donatorBadges} />}
            {userStyle?.badge && <StvBadges badge={userStyle?.badge} />}
            <KickBadges badges={message?.sender?.identity?.badges} subscriberBadges={subscriberBadges} />
          </div>

          <button
            onClick={(e) => {
              e.preventDefault();
              if (isSearch) {
                return handleOpenUserDialog(e, message.sender.username);
              } else {
                return handleOpenUserDialog(e);
              }
            }}
            className={clsx("chatMessageUsername", userStyle?.paint && "chatMessageUsernamePaint")}
            style={usernameStyle}>
            <span>{message.sender.username}:&nbsp;</span>
          </button>
        </div>

        <div className="chatMessageContent">{messageContent}</div>

        <div className="chatMessageActions">
          {canModerate && !message?.deleted && (
            <button onClick={handlePinMessage} className="chatMessageActionButton">
              <img src={Pin} alt="Pin Message" width={16} height={16} loading="lazy" />
            </button>
          )}

          {!message?.deleted && (
            <button onClick={handleReply} className="chatMessageActionButton">
              <img src={ReplyIcon} alt={`Reply to ${message?.sender?.username}`} width={16} height={16} loading="lazy" />
            </button>
          )}

          <button onClick={handleCopyMessage} className="chatMessageActionButton">
            <img src={CopyIcon} alt="Copy Message" width={16} height={16} loading="lazy" />
          </button>
        </div>
      </span>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message === nextProps.message &&
      prevProps.sevenTVEmotes === nextProps.sevenTVEmotes &&
      prevProps.userChatroomInfo === nextProps.userChatroomInfo &&
      prevProps.userStyle === nextProps.userStyle &&
      prevProps.kickTalkBadges === nextProps.kickTalkBadges &&
      prevProps.donatorBadges === nextProps.donatorBadges &&
      prevProps.subscriberBadges === nextProps.subscriberBadges &&
      prevProps.type === nextProps.type &&
      prevProps.settings === nextProps.settings
    );
  },
);

export default RegularMessage;
