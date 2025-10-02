import { memo, useMemo, useEffect, useState, useRef, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import useChatStore from "../../providers/ChatProvider";
import Message from "./Message";
import MouseScroll from "../../assets/icons/mouse-scroll-fill.svg?asset";

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
    const [silencedUserIds, setSilencedUserIds] = useState(new Set());
    const [atBottom, setAtBottom] = useState(true);
    const [isPaused, setIsPaused] = useState(false);

    const filteredMessages = useMemo(() => {
      if (!messages?.length) return [];

      return messages.filter((message) => {
        if (message?.chatroom_id !== chatroomId) return false;
        if (message?.type === "system" || message?.type === "mod_action")
          return true;
        if (message?.type !== "reply" && message?.type !== "message")
          return true;

        return message?.sender?.id && !silencedUserIds.has(message?.sender?.id);
      });
    }, [messages, chatroomId, silencedUserIds]);

    const handleScroll = useCallback(
      (e) => {
        if (!e?.target) return;
        const { scrollHeight, scrollTop, clientHeight } = e.target;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 250;

        setAtBottom(isNearBottom);

        if (isNearBottom !== !isPaused) {
          setIsPaused(!isNearBottom);
          useChatStore
            .getState()
            .handleChatroomPause(chatroomId, !isNearBottom);
        }
      },
      [chatroomId, isPaused],
    );

    const togglePause = () => {
      const newPausedState = !isPaused;
      setIsPaused(newPausedState);
      useChatStore.getState().handleChatroomPause(chatroomId, newPausedState);

      if (!newPausedState) {
        setAtBottom(true);
      }
    };

    const itemContent = useCallback(
      (index, message) => {
        // if (!message?.id) {
        //   console.warn("[MessagesHandler]: Message without ID at index:", index);
        //   return null;
        // }

        // Hide mod actions if the setting is disabled
        if (
          message?.type === "mod_action" &&
          !settings?.chatrooms?.showModActions
        ) {
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
      [
        chatroomId,
        slug,
        subscriberBadges,
        allStvEmotes,
        kickTalkBadges,
        settings,
        userChatroomInfo,
        username,
        userId,
        donators,
      ],
    );

    useEffect(() => {
      const loadSilencedUsers = () => {
        try {
          const storedUsers = JSON.parse(
            localStorage.getItem("silencedUsers") || "{}",
          );
          const userIds = storedUsers?.data?.map((user) => user.id) || [];
          setSilencedUserIds(new Set(userIds));
        } catch (error) {
          console.error(
            "[MessagesHandler]: Error loading silenced users:",
            error,
          );
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
      >
        <Virtuoso
          ref={virtuosoRef}
          data={filteredMessages}
          itemContent={itemContent}
          computeItemKey={computeItemKey}
          onScroll={handleScroll}
          followOutput={isPaused ? false : "smooth"}
          initialTopMostItemIndex={filteredMessages?.length - 1}
          atBottomThreshold={6}
          overscan={20}
          increaseViewportBy={200}
          defaultItemHeight={45}
          style={{
            height: "100%",
            width: "100%",
            flex: 1,
          }}
        />

        {!atBottom && (
          <div className="scrollToBottomBtn" onClick={togglePause}>
            Scroll To Bottom
            <img
              src={MouseScroll}
              width={24}
              height={24}
              alt="Scroll To Bottom"
            />
          </div>
        )}
      </div>
    );
  },
);

// Add displayName for debugging
MessagesHandler.displayName = "MessagesHandler";

export default MessagesHandler;
