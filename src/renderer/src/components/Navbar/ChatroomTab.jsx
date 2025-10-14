import { memo, useMemo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../Shared/ContextMenu";
import clsx from "clsx";
import useChatStore from "../../providers/ChatProvider";
import { useShallow } from "zustand/react/shallow";
import X from "../../assets/icons/x-bold.svg?asset";

const ChatroomTab = memo(
  ({
    chatroom,
    index,
    currentChatroomId,
    onSelectChatroom,
    onRemoveChatroom,
    onRename,
    editingChatroomId,
    editingName,
    setEditingName,
    onRenameSubmit,
    setEditingChatroomId,
    renameInputRef,
    settings,
  }) => {
    const chatroomMessages = useChatStore(useShallow((state) => state.messages[chatroom.id] || []));

    const unreadCount = useMemo(() => {
      return chatroomMessages.filter((message) => !message.isRead && message.type !== "system").length;
    }, [chatroomMessages]);

    return (
      <Draggable key={chatroom.id} draggableId={`item-${chatroom.id}`} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={{
              ...provided.draggableProps.style,
              opacity: snapshot.isDragging ? 0.8 : 1,
            }}>
            <ContextMenu>
              <ContextMenuTrigger>
                <div
                  onDoubleClick={(e) =>
                    onRename({ chatroomId: chatroom.id, currentDisplayName: chatroom.displayName || chatroom.username })
                  }
                  onClick={() => onSelectChatroom(chatroom.id)}
                  onMouseDown={async (e) => {
                    if (e.button === 1) {
                      await onRemoveChatroom(chatroom.id);
                    }
                  }}
                  className={clsx(
                    "chatroomStreamer",
                    chatroom.id === currentChatroomId && "chatroomStreamerActive",
                    chatroom?.isStreamerLive && "chatroomStreamerLive",
                    snapshot.isDragging && "dragging",
                    unreadCount > 0 && chatroom.id !== currentChatroomId && "hasUnread",
                  )}>
                  <div className="streamerInfo">
                    {settings?.general?.showTabImages && chatroom.streamerData?.user?.profile_pic && (
                      <img
                        className="profileImage"
                        src={chatroom.streamerData.user.profile_pic}
                        alt={`${chatroom.username}'s profile`}
                      />
                    )}
                    {editingChatroomId === chatroom.id ? (
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => onRenameSubmit(chatroom.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRenameSubmit(chatroom.id);
                          } else if (e.key === "Escape") {
                            setEditingChatroomId(null);
                            setEditingName("");
                          }
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        ref={renameInputRef}
                      />
                    ) : (
                      <>
                        <span>{chatroom.displayName || chatroom.username}</span>
                        <span className={clsx("unreadCountIndicator", unreadCount > 0 && "hasUnread")} />
                      </>
                    )}
                  </div>
                  <button
                    className="closeChatroom"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveChatroom(chatroom.id);
                    }}
                    aria-label="Remove chatroom">
                    <img src={X} width={12} height={12} alt="Remove chatroom" />
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => window.open(`https://kick.com/${chatroom.username}`, "_blank")}>
                  Open Stream in Browser
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => window.open(`https://player.kick.com/${chatroom.username}`, "_blank")}>
                  Open Player in Browser
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() =>
                    onRename({ chatroomId: chatroom.id, currentDisplayName: chatroom.displayName || chatroom.username })
                  }>
                  Rename Tab
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onRemoveChatroom(chatroom.id)}>Remove Chatroom</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        )}
      </Draggable>
    );
  },
);

ChatroomTab.displayName = "ChatroomTab";

export default ChatroomTab;
