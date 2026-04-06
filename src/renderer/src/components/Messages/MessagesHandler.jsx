import { memo, useMemo, useEffect, useState, useRef, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import useChatStore from "../../providers/ChatProvider";
import Message from "./Message";
import MouseScroll from "../../assets/icons/mouse-scroll-fill.svg?asset";

const kickInlineEmoteRegex = /\[emote:\d+[:]?[a-zA-Z0-9-_!]*[:]?\]/g;
const tokenTrimRegex = /^[.,!?;:()[\]{}"'`]+|[.,!?;:()[\]{}"'`]+$/g;

const isEmoteOnlyMessage = (content, stvEmoteNames) => {
  if (!content || typeof content !== "string") return false;

  const contentWithoutKickInlineEmotes = content.replaceAll(kickInlineEmoteRegex, " ");
  const rawTokens = contentWithoutKickInlineEmotes
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (!rawTokens.length) return true;

  const normalizedTokens = rawTokens
    .map((token) => token.replace(tokenTrimRegex, ""))
    .filter(Boolean);

  if (!normalizedTokens.length) return true;

  return normalizedTokens.every((token) => stvEmoteNames.has(token));
};

const MessagesHandler = memo(
  ({
    messages,
    chatroomId,
    slug,
    allStvEmotes,
    subscriberBadges,
    kickTalkBadges,
    settings,
    userChatroomInfo,
    username,
    userId,
    donators,
  }) => {
    const virtuosoRef = useRef(null);
    const chatContainerRef = useRef(null);
    const hoverPauseTimeoutRef = useRef(null);
    const latestFilteredMessageCountRef = useRef(0);
    const latestIsScrollPausedRef = useRef(false);
    const [silencedUserIds, setSilencedUserIds] = useState(new Set());
    const [atBottom, setAtBottom] = useState(true);
    const [isScrollPaused, setIsScrollPaused] = useState(false);
    const [isHoverPaused, setIsHoverPaused] = useState(false);

    const hoverPauseDurationMs = useMemo(() => {
      const hoverPauseSetting = settings?.chatrooms?.pauseOnMouseoverDuration || "disabled";
      if (hoverPauseSetting === "disabled") return null;
      if (hoverPauseSetting === "infinite") return Infinity;

      const seconds = Number(hoverPauseSetting);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      return seconds * 1000;
    }, [settings?.chatrooms?.pauseOnMouseoverDuration]);

    const isHoverPauseEnabled = hoverPauseDurationMs !== null;
    const isPaused = isScrollPaused || isHoverPaused;
    const stvEmoteNames = useMemo(
      () =>
        new Set(
          (allStvEmotes || [])
            .flatMap((set) => set?.emotes || [])
            .map((emote) => emote?.name)
            .filter(Boolean),
        ),
      [allStvEmotes],
    );

    const clearHoverPauseTimeout = useCallback(() => {
      if (hoverPauseTimeoutRef.current) {
        clearTimeout(hoverPauseTimeoutRef.current);
        hoverPauseTimeoutRef.current = null;
      }
    }, []);

    const filteredMessages = useMemo(() => {
      if (!messages?.length) return [];

      return messages.filter((message) => {
        if (message?.chatroom_id != chatroomId) return false;
        if (message?.type === "system" || message?.type === "mod_action") return true;
        if (message?.type !== "reply" && message?.type !== "message") return true;
        if (
          settings?.chatrooms?.hideEmoteOnlyMessages &&
          isEmoteOnlyMessage(message?.content, stvEmoteNames)
        ) {
          return false;
        }

        return message?.sender?.id && !silencedUserIds.has(message?.sender?.id);
      });
    }, [
      messages,
      chatroomId,
      silencedUserIds,
      settings?.chatrooms?.hideEmoteOnlyMessages,
      stvEmoteNames,
    ]);

    useEffect(() => {
      latestFilteredMessageCountRef.current = filteredMessages.length;
    }, [filteredMessages.length]);

    useEffect(() => {
      latestIsScrollPausedRef.current = isScrollPaused;
    }, [isScrollPaused]);

    const resumeHoverPause = useCallback(() => {
      clearHoverPauseTimeout();
      setIsHoverPaused(false);

      if (latestIsScrollPausedRef.current) return;

      const messageCount = latestFilteredMessageCountRef.current;
      if (messageCount > 0) {
        virtuosoRef.current?.scrollToIndex({
          index: messageCount - 1,
          align: "start",
          behavior: "instant",
        });
      }
      setAtBottom(true);
    }, [clearHoverPauseTimeout]);

    const handleScroll = useCallback(
      (e) => {
        if (!e?.target) return;
        const { scrollHeight, scrollTop, clientHeight } = e.target;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 250;

        setAtBottom(isNearBottom);
        setIsScrollPaused(!isNearBottom);
      },
      [],
    );

    const togglePause = useCallback(() => {
      setIsScrollPaused(false);
      resumeHoverPause();
      virtuosoRef.current?.scrollToIndex({
        index: filteredMessages.length - 1,
        align: "start",
        behavior: "instant",
      });
      setAtBottom(true);
    }, [filteredMessages.length, resumeHoverPause]);

    const handleMouseEnter = useCallback(() => {
      if (!isHoverPauseEnabled || isScrollPaused) return;
      clearHoverPauseTimeout();
      setIsHoverPaused(true);
    }, [clearHoverPauseTimeout, isHoverPauseEnabled, isScrollPaused]);

    const handleMouseLeave = useCallback(() => {
      if (!isHoverPaused) return;
      resumeHoverPause();
    }, [isHoverPaused, resumeHoverPause]);

    const itemContent = useCallback(
      (index, message) => {
        // Hide mod actions if the setting is disabled
        if (message?.type === "mod_action" && !settings?.chatrooms?.showModActions) {
          return false;
        }

        return (
          <Message
            key={message?.id}
            data-message-id={message.id}
            message={message}
            chatroomId={chatroomId}
            chatroomName={slug}
            subscriberBadges={subscriberBadges}
            allStvEmotes={allStvEmotes}
            existingKickTalkBadges={kickTalkBadges}
            settings={settings}
            userChatroomInfo={userChatroomInfo}
            username={username}
            userId={userId}
            donators={donators}
          />
        );
      },
      [chatroomId, slug, subscriberBadges, allStvEmotes, kickTalkBadges, settings, userChatroomInfo, username, userId, donators],
    );

    useEffect(() => {
      const loadSilencedUsers = () => {
        try {
          const storedUsers = JSON.parse(localStorage.getItem("silencedUsers") || "{}");
          const userIds = storedUsers?.data?.map((user) => user.id) || [];
          setSilencedUserIds(new Set(userIds));
        } catch (error) {
          console.error("[MessagesHandler]: Error loading silenced users:", error);
          setSilencedUserIds(new Set());
        }
      };

      const handleStorageChange = (e) => {
        if (e.key === "silencedUsers") {
          loadSilencedUsers();
        }
      };

      loadSilencedUsers();
      window.addEventListener("storage", handleStorageChange);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
      };
    }, []);

    useEffect(() => {
      useChatStore.getState().handleChatroomPause(chatroomId, isPaused);
    }, [chatroomId, isPaused]);

    useEffect(() => {
      if (!isHoverPaused) {
        clearHoverPauseTimeout();
        return;
      }

      if (hoverPauseDurationMs === Infinity) {
        clearHoverPauseTimeout();
        return;
      }

      clearHoverPauseTimeout();
      hoverPauseTimeoutRef.current = setTimeout(() => {
        hoverPauseTimeoutRef.current = null;
        resumeHoverPause();
      }, hoverPauseDurationMs);

      return () => {
        clearHoverPauseTimeout();
      };
    }, [clearHoverPauseTimeout, hoverPauseDurationMs, isHoverPaused, resumeHoverPause]);

    useEffect(() => {
      if (isHoverPauseEnabled) return;
      if (!isHoverPaused) return;
      resumeHoverPause();
    }, [isHoverPauseEnabled, isHoverPaused, resumeHoverPause]);

    useEffect(() => {
      return () => {
        clearHoverPauseTimeout();
      };
    }, [clearHoverPauseTimeout]);

    const computeItemKey = useCallback(
      (index, message) => {
        return `${message?.id || index}-${chatroomId}`;
      },
      [chatroomId],
    );

    return (
      <div
        className="chatContainer"
        style={{ height: "100%", flex: 1 }}
        ref={chatContainerRef}
        data-chatroom-id={chatroomId}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}>
        <Virtuoso
          ref={virtuosoRef}
          data={filteredMessages}
          itemContent={itemContent}
          computeItemKey={computeItemKey}
          onScroll={handleScroll}
          followOutput={isPaused ? false : "smooth"}
          initialTopMostItemIndex={filteredMessages?.length - 1}
          atBottomThreshold={6}
          overscan={50}
          increaseViewportBy={400}
          defaultItemHeight={50}
          style={{
            height: "100%",
            width: "100%",
            flex: 1,
          }}
        />

        {isPaused && (
          <div className="chatPausedIndicator">{isHoverPaused ? "Paused on hover" : "Paused"}</div>
        )}

        {!atBottom && (
          <div className="scrollToBottomBtn" onClick={togglePause}>
            Scroll To Bottom
            <img src={MouseScroll} width={24} height={24} alt="Scroll To Bottom" />
          </div>
        )}
      </div>
    );
  },
);

MessagesHandler.displayName = "MessagesHandler";

export default MessagesHandler;
