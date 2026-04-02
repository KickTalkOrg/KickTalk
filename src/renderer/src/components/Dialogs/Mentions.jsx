import { useState, useMemo } from "react";
import useChatStore from "../../providers/ChatProvider";
import { useShallow } from "zustand/shallow";
import TrashIcon from "../../assets/icons/trash-fill.svg?asset";
import "../../assets/styles/dialogs/mentions.scss";
import clsx from "clsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../Shared/Dropdown";
import CaretDownIcon from "../../assets/icons/caret-down-fill.svg?asset";
import { MessageParser } from "../../utils/MessageParser";
import ArrowRightIcon from "../../assets/icons/arrow-up-right-bold.svg?asset";
import NOWWHAT from "../../assets/images/NOWWHAT.avif?asset";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { KickBadges } from "../Cosmetics/Badges";

dayjs.extend(relativeTime);

const mentionTypeClassMap = {
  mention: "mentionType--mention",
  reply: "mentionType--reply",
  highlight: "mentionType--highlight",
};

const Mentions = ({ setActiveChatroom, chatroomId }) => {
  const [selectedChatroom, setSelectedChatroom] = useState("all");
  const {
    mentions,
    getAllMentions,
    getChatroomMentions,
    getUnreadMentionCount,
    getChatroomUnreadMentionCount,
    markAllMentionsAsRead,
    markChatroomMentionsAsRead,
    clearAllMentions,
    clearChatroomMentions,
    chatrooms,
  } = useChatStore(
    useShallow((state) => ({
      mentions: state.mentions,
      getAllMentions: state.getAllMentions,
      getChatroomMentions: state.getChatroomMentions,
      getUnreadMentionCount: state.getUnreadMentionCount,
      getChatroomUnreadMentionCount: state.getChatroomUnreadMentionCount,
      markMentionAsRead: state.markMentionAsRead,
      markAllMentionsAsRead: state.markAllMentionsAsRead,
      markChatroomMentionsAsRead: state.markChatroomMentionsAsRead,
      clearAllMentions: state.clearAllMentions,
      clearChatroomMentions: state.clearChatroomMentions,
      chatrooms: state.chatrooms,
    })),
  );

  const filteredMentions = useMemo(() => {
    const allMentions =
      selectedChatroom === "all"
        ? getAllMentions()
        : getChatroomMentions(selectedChatroom);
    return allMentions;
  }, [selectedChatroom, mentions, getChatroomMentions]);

  const unreadCount = useMemo(() => {
    return selectedChatroom === "all"
      ? getUnreadMentionCount()
      : getChatroomUnreadMentionCount(selectedChatroom);
  }, [selectedChatroom, getUnreadMentionCount, getChatroomUnreadMentionCount]);

  const handleMarkAllAsRead = () => {
    if (selectedChatroom === "all") {
      markAllMentionsAsRead();
    } else {
      markChatroomMentionsAsRead(selectedChatroom);
    }
  };

  const handleClearAll = () => {
    if (selectedChatroom === "all") {
      clearAllMentions();
    } else {
      clearChatroomMentions(selectedChatroom);
    }
  };

  const formatTimestamp = (timestamp) => {
    return dayjs(timestamp).format("HH:mm A");
  };

  const getReplyContext = (mention) => {
    const originalMessage = mention?.message?.metadata?.original_message;
    if (mention?.type !== "reply" || !originalMessage?.content) return null;

    return {
      content: originalMessage.content,
      sender: mention?.message?.metadata?.original_sender?.username,
    };
  };

  return (
    <div className="mentionsDialog">
      <div className="mentionsHeader">
        <div className="mentionsTitle">
          <h2>All Mentions</h2>
        </div>

        <div className="mentionsGlobalActions">
          {filteredMentions.length > 0 && (
            <button
              className="mentionsGlobalActionBtn"
              onClick={handleClearAll}
              title="Clear all mentions"
            >
              <span>Clear all</span>
              <img src={TrashIcon} alt="Clear all" width={16} height={16} />
            </button>
          )}
        </div>
      </div>

      <div className="mentionsFilters">
        <div className="mentionsFilter">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mentionsFilterBtn">
                {selectedChatroom === "all"
                  ? "All Chatrooms"
                  : chatrooms.find(
                      (chatroom) => chatroom.id === selectedChatroom,
                    )?.displayName ||
                    chatrooms.find(
                      (chatroom) => chatroom.id === selectedChatroom,
                    )?.username}

                <img
                  src={CaretDownIcon}
                  alt="arrow down icon"
                  width={16}
                  height={16}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                className="mentionsFilterItem"
                onClick={() => setSelectedChatroom("all")}
              >
                All Chatrooms
              </DropdownMenuItem>
              {chatrooms.map((chatroom) => (
                <DropdownMenuItem
                  className="mentionsFilterItem"
                  key={chatroom.id}
                  onClick={() => setSelectedChatroom(chatroom.id)}
                >
                  {chatroom.displayName || chatroom.username}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mentionsContent">
        {filteredMentions.length === 0 ? (
          <div className="mentionsEmpty">
            <img src={NOWWHAT} alt="No mentions" />
            <p>
              {selectedChatroom === "all"
                ? "No Mentions..."
                : "No mentions in this chatroom..."}
            </p>
          </div>
        ) : (
          <div className="mentionsList">
            {filteredMentions.map((mention) => {
              const replyContext = getReplyContext(mention);

              return (
                <div
                  key={mention.id}
                  className={clsx("mentionItem", !mention.isRead && "unread")}
                >
                  <div className="mentionHeader">
                    <div className="mentionMeta">
                      <span
                        className={clsx(
                          "mentionType",
                          mentionTypeClassMap[mention?.type] ||
                            "mentionType--mention",
                        )}
                      >
                        {mention.type}
                      </span>
                      <span className="mentionChatroom">
                        #
                        {mention.chatroomInfo?.displayName ||
                          mention.chatroomInfo?.streamerUsername}
                      </span>
                      <span className="mentionTime">
                        {formatTimestamp(mention.timestamp)}
                      </span>
                    </div>

                    <div className="mentionActions">
                      <button
                        className="mentionActionBtn"
                        onClick={() => setActiveChatroom(mention.chatroomId)}
                        title="Go to channel"
                      >
                        <img
                          src={ArrowRightIcon}
                          alt="Go to channel"
                          width={14}
                          height={14}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="mentionMessage">
                    {replyContext && (
                      <div className="mentionReplyContext">
                        <span className="mentionReplyLabel">
                          Replying to{" "}
                          {replyContext.sender
                            ? `@${replyContext.sender}`
                            : "your message"}
                          :
                        </span>
                        <span className="mentionReplyText">
                          {replyContext.content}
                        </span>
                      </div>
                    )}

                    {mention?.message?.sender?.identity?.badges?.length > 0 && (
                      <KickBadges
                        badges={mention?.message?.sender?.identity?.badges}
                      />
                    )}
                    <span
                      className="mentionSender"
                      style={{
                        color: mention?.message?.sender?.identity?.color,
                      }}
                    >
                      {mention?.message?.sender?.username}:{" "}
                    </span>

                    <MessageParser
                      message={mention.message}
                      chatroomId={mention.chatroomId}
                      chatroomName={mention.chatroomInfo?.slug}
                      type="minified"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Mentions;
