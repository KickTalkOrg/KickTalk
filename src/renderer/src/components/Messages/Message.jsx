import "../../assets/styles/components/Chat/Message.scss";
import { useCallback, useRef, useMemo, useState } from "react";
import ModActionMessage from "./ModActionMessage";
import RegularMessage from "./RegularMessage";
import EmoteUpdateMessage from "./EmoteUpdateMessage";
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../Shared/ContextMenu";

const Message = ({
  message,
  userChatroomInfo,
  chatroomId,
  subscriberBadges,
  allStvEmotes,
  existingKickTalkBadges,
  settings,
  dialogUserStyle,
  type,
  username,
  userId,
  chatroomName,
  donators,
}) => {
  const messageRef = useRef(null);
  const getDeleteMessage = useChatStore(useShallow((state) => state.getDeleteMessage));
  const [rightClickedEmote, setRightClickedEmote] = useState(null);

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
    async (e, username) => {
      e.preventDefault();

      if (username) {
        const user = await window.app.kick.getUserChatroomInfo(chatroomName, username);

        if (!user?.data?.id) return;

        const sender = {
          id: user.data.id,
          username: user.data.username,
          slug: user.data.slug,
        };

        window.app.userDialog.open({
          sender,
          fetchedUser: user?.data,
          chatroomId,
          subscriberBadges,
          sevenTVEmotes: allStvEmotes,
          cords: [e.clientX, e.clientY],
          username,
        });
      } else {
        window.app.userDialog.open({
          sender: message.sender,
          userChatroomInfo,
          chatroomId,
          subscriberBadges,
          sevenTVEmotes: allStvEmotes,
          cords: [e.clientX, e.clientY],
          userStyle,
          username,
        });
      }
    },
    [message?.sender, userChatroomInfo, chatroomId, userStyle, subscriberBadges, allStvEmotes, username],
  );

  const rgbaObjectToString = (rgba) => {
    if (!rgba) return "transparent";
    if (typeof rgba === "string") return rgba;
    if (typeof rgba === "object" && rgba.r !== undefined) {
      return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
    }
    return "transparent";
  };

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

  const handleOpenEmoteLink = () => {
    if (rightClickedEmote) {
      let emoteUrl = "";
      if (rightClickedEmote.type === "stv") {
        emoteUrl = `https://7tv.app/emotes/${rightClickedEmote.id}`;
      } else {
        emoteUrl = `https://files.kick.com/emotes/${rightClickedEmote.id}/fullsize`;
      }

      window.open(emoteUrl, "_blank");
    }
  };

  const handleOpen7TVEmoteLink = useCallback(
    (resolution) => {
      if (rightClickedEmote && rightClickedEmote.type === "stv") {
        let emoteUrl = "";
        if (resolution === "page") {
          emoteUrl = `https://7tv.app/emotes/${rightClickedEmote.id}`;
        } else {
          emoteUrl = `https://cdn.7tv.app/emote/${rightClickedEmote.id}/${resolution}.webp`;
        }

        window.open(emoteUrl, "_blank");
      }
    },
    [rightClickedEmote],
  );

  // Handle context menu on the message to detect emote right-clicks
  const handleMessageContextMenu = useCallback((e) => {
    setRightClickedEmote(null);
    let emoteImg = null;
    if (e.target.tagName === "IMG" && e.target.className.includes("emote")) {
      emoteImg = e.target;
    } else if (e.target.className.includes("chatroomEmote")) {
      emoteImg = e.target.querySelector("img.emote");
    }

    if (emoteImg) {
      const alt = emoteImg.getAttribute("alt");
      const src = emoteImg.getAttribute("src");

      let emoteData = null;
      if (src.includes("7tv.app")) {
        const match = src.match(/\/emote\/([^\/]+)\//);
        if (match) {
          emoteData = {
            id: match[1],
            name: alt,
            type: "stv",
          };
        }
      } else if (src.includes("kick.com/emotes")) {
        const match = src.match(/\/emotes\/([^\/]+)/);
        if (match) {
          emoteData = {
            id: match[1],
            name: alt,
            type: "kick",
          };
        }
      }

      if (emoteData) {
        setRightClickedEmote(emoteData);
      }
    }
  }, []);

  // Get existing KickTalk badges (Founder, Beta Tester, etc.)
  const kickTalkBadges =
    existingKickTalkBadges?.find((badge) => badge.username.toLowerCase() === message?.sender?.username?.toLowerCase())?.badges ||
    [];

  // Check if user is a donator
  const donatorBadges = useMemo(() => {
    if (!message?.sender?.username) return [];

    const donator = donators?.find((d) => d.message?.toLowerCase() === message?.sender?.username?.toLowerCase());
    if (donator) {
      return [
        {
          type: "Donator",
          title: "KickTalk Donator",
        },
      ];
    }
    return [];
  }, [message?.sender?.username, donators]);

  const showContextMenu =
    !message?.deleted && message?.type !== "system" && message?.type !== "stvEmoteSetUpdate" && message?.type !== "mod_action";

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
        allStvEmotes,
        subscriberBadges,
        userChatroomInfo,
        chatroomName,
        username,
        settings,
      });
    },
    [chatroomId, message, userChatroomInfo, chatroomName, allStvEmotes, subscriberBadges, settings, username],
  );

  // [Highlights]: Handles highlighting message phrases
  const shouldHighlightMessage = useMemo(() => {
    if (!settings?.notifications?.background || !settings?.notifications?.phrases?.length || type === "dialog") {
      return false;
    }

    // Don't highlight your own messages (including replies)
    if (message?.sender?.slug === username) {
      return false;
    }

    // Check for self-mention in replies
    if (message?.metadata?.original_sender?.id == userId && message?.sender?.id != userId) {
      return true;
    }

    // Check for highlight phrases
    return settings.notifications.phrases.some((phrase) => message?.content?.toLowerCase().includes(phrase.toLowerCase()));
  }, [
    settings?.notifications?.background,
    settings?.notifications?.phrases,
    message?.content,
    message?.sender?.slug,
    message?.sender?.id,
    message?.metadata?.original_sender?.id,
    type,
    username,
    userId,
  ]);

  const messageContent = (
    <div
      className={clsx(
        "chatMessageItem",
        message.is_old && type !== "replyThread" && "old",
        message.deleted && "deleted",
        message.type === "stvEmoteSetUpdate" && "emoteSetUpdate",
        type === "dialog" && "dialogChatMessageItem",
        shouldHighlightMessage && "highlighted",
        message.isOptimistic && message.state === "optimistic" && "optimistic",
        message.isOptimistic && message.state === "failed" && "failed",
      )}
      style={{
        backgroundColor: shouldHighlightMessage ? rgbaObjectToString(settings?.notifications?.backgroundRgba) : "transparent",
      }}
      ref={messageRef}>
      {(message.type === "message" || type === "replyThread") && (
        <RegularMessage
          type={type}
          message={message}
          kickTalkBadges={kickTalkBadges}
          donatorBadges={donatorBadges}
          subscriberBadges={subscriberBadges}
          sevenTVEmotes={allStvEmotes}
          userStyle={userStyle}
          handleOpenUserDialog={handleOpenUserDialog}
          userChatroomInfo={userChatroomInfo}
          chatroomName={chatroomName}
          chatroomId={chatroomId}
          settings={settings}
          username={username}
        />
      )}

      {message.type === "reply" && type !== "replyThread" && (
        <ReplyMessage
          type={type}
          message={message}
          kickTalkBadges={kickTalkBadges}
          donatorBadges={donatorBadges}
          subscriberBadges={subscriberBadges}
          sevenTVEmotes={allStvEmotes}
          userStyle={userStyle}
          handleOpenUserDialog={handleOpenUserDialog}
          userChatroomInfo={userChatroomInfo}
          chatroomName={chatroomName}
          chatroomId={chatroomId}
          handleOpenReplyThread={handleOpenReplyThread}
          settings={settings}
          username={username}
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

      {message.type === "stvEmoteSetUpdate" && <EmoteUpdateMessage message={message} />}

      {message.type === "mod_action" && (
        <ModActionMessage
          message={message}
          chatroomId={chatroomId}
          chatroomName={chatroomName}
          subscriberBadges={subscriberBadges}
          allStvEmotes={allStvEmotes}
          userChatroomInfo={userChatroomInfo}
        />
      )}
    </div>
  );

  if (showContextMenu) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={handleMessageContextMenu}>
          {messageContent}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {message?.content && <ContextMenuItem onSelect={handleCopyMessage}>Copy Message</ContextMenuItem>}

          <ContextMenuItem onSelect={handleReply}>Reply to Message</ContextMenuItem>

          {rightClickedEmote && rightClickedEmote.type === "stv" && (
            <>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger>Open Emote Links</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem onSelect={() => handleOpen7TVEmoteLink("page")}>7TV Link</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => handleOpen7TVEmoteLink("1x")}>1x Link</ContextMenuItem>
                  <ContextMenuItem onSelect={() => handleOpen7TVEmoteLink("2x")}>2x Link</ContextMenuItem>
                  <ContextMenuItem onSelect={() => handleOpen7TVEmoteLink("4x")}>4x Link</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Copy Emote Links</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem
                    onSelect={() => navigator.clipboard.writeText(`https://7tv.app/emotes/${rightClickedEmote.id}`)}>
                    7TV Link
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => navigator.clipboard.writeText(`https://cdn.7tv.app/emote/${rightClickedEmote.id}/1x.webp`)}>
                    1x Link
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => navigator.clipboard.writeText(`https://cdn.7tv.app/emote/${rightClickedEmote.id}/2x.webp`)}>
                    2x Link
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => navigator.clipboard.writeText(`https://cdn.7tv.app/emote/${rightClickedEmote.id}/4x.webp`)}>
                    4x Link
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}

          {rightClickedEmote && rightClickedEmote.type === "kick" && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={handleOpenEmoteLink}>Open Kick Emote</ContextMenuItem>
            </>
          )}

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
