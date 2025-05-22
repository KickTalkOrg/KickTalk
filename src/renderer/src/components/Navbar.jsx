import "../assets/styles/components/Navbar.scss";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import useChatStore from "../providers/ChatProvider";
import Plus from "../assets/icons/plus-bold.svg?asset";
import X from "../assets/icons/x-bold.svg?asset";
import useClickOutside from "../utils/useClickOutside";
import { useSettings } from "../providers/SettingsProvider";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

const Navbar = ({ currentChatroomId, onSelectChatroom }) => {
  const addChatroom = useChatStore((state) => state.addChatroom);
  const removeChatroom = useChatStore((state) => state.removeChatroom);
  const chatrooms = useChatStore((state) => state.chatrooms);
  const connections = useChatStore((state) => state.connections);
  const [localChatrooms, setLocalChatrooms] = useState([]);
  const { settings } = useSettings();

  const [showAddChatroomDialog, setAddChatroomDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const inputRef = useRef(null);
  const chatroomListRef = useRef(null);
  const addChatroomDialogRef = useRef(null);

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const reordered = Array.from(localChatrooms);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    setLocalChatrooms(reordered);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const username = inputRef.current?.value.toLowerCase();
    if (!username) return;

    setIsConnecting(true);

    try {
      const newChatroom = await addChatroom(username);
      if (newChatroom) {
        setAddChatroomDialog(false);
        inputRef.current.value = "";
        setTimeout(() => {
          onSelectChatroom(newChatroom.id);
        }, 0);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Load chatroom order from localStorage and reorder chatrooms accordingly
  useEffect(() => {
    const storedOrder = JSON.parse(localStorage.getItem("chatroomsOrder") || "[]");
    if (storedOrder.length) {
      const chatroomMap = Object.fromEntries(chatrooms.map((c) => [c.id, c]));
      const ordered = storedOrder.map((id) => chatroomMap[id]).filter(Boolean);
      const unordered = chatrooms.filter((c) => !storedOrder.includes(c.id));
      setLocalChatrooms([...ordered, ...unordered]);
    } else {
      setLocalChatrooms(chatrooms);
    }
  }, [chatrooms]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // ctrl + j to open chat adding dialog
      if (e.ctrlKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setAddChatroomDialog((prev) => !prev);
      }
      // close on esc
      if (e.key === "Escape") {
        setAddChatroomsDialog(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAddChatroomDialog]);

  useEffect(() => {
    localStorage.setItem("chatroomsOrder", JSON.stringify(localChatrooms.map((c) => c.id)));
  }, [localChatrooms]);

  const handleRemoveChatroom = async (chatroomId) => {
    if (!connections[chatroomId]) return;

    const currentIndex = chatrooms.findIndex((chatroom) => chatroom.id === chatroomId);
    const remainingChatrooms = chatrooms.filter((chatroom) => chatroom && chatroom.id !== chatroomId);
    await removeChatroom(chatroomId);
    if (remainingChatrooms.length) {
      const nextChatroom = remainingChatrooms[currentIndex] || remainingChatrooms[currentIndex - 1];
      if (nextChatroom) {
        onSelectChatroom(nextChatroom.id);
      }
    }
  };

  useEffect(() => {
    const storedOrder = JSON.parse(localStorage.getItem("chatroomsOrder") || "[]");
    if (storedOrder.length && chatrooms.length) {
    } else if (chatrooms.length) {
      onSelectChatroom(chatrooms[0].id);
    }

    const handleWheel = (e) => {
      e.preventDefault();

      chatroomListRef?.current?.scrollBy({
        left: e.deltaY < 0 ? -30 : 30,
      });
    };

    chatroomListRef?.current?.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      chatroomListRef?.current?.removeEventListener("wheel", handleWheel);
    };
  }, [chatrooms]);

  useClickOutside(addChatroomDialogRef, () => {
    setAddChatroomDialog(false);
  });

  return (
    <>
      <div className={clsx("navbarContainer", settings?.general?.wrapChatroomsList && "wrapChatroomList")} ref={chatroomListRef}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="chatrooms" direction="horizontal">
            {(provided) => (
              <div
                className="chatroomsList"
                {...provided.droppableProps}
                ref={(el) => {
                  if (typeof provided.innerRef === "function") {
                    provided.innerRef(el);
                  } else if (provided.innerRef) {
                    provided.innerRef.current = el;
                  }
                }}>
                {localChatrooms.map((chatroom, index) => (
                  <Draggable key={`item-${chatroom.id}`} draggableId={`item-${chatroom.id}`} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        onClick={() => onSelectChatroom(chatroom.id)}
                        onMouseDown={async (e) => {
                          if (e.button === 1) {
                            await handleRemoveChatroom(chatroom.id);
                          }
                        }}
                        className={clsx(
                          "chatroomStreamer",
                          chatroom.id === currentChatroomId && "chatroomStreamerActive",
                          chatroom?.isStreamerLive && "chatroomStreamerLive",
                        )}>
                        <div className="streamerInfo">
                          {settings?.general?.showTabImages && chatroom.streamerData?.user?.profile_pic && (
                            <img
                              className="profileImage"
                              src={chatroom.streamerData.user.profile_pic}
                              alt={`${chatroom.username}'s profile`}
                            />
                          )}
                          <span>{chatroom.username}</span>
                        </div>
                        <button
                          className="closeChatroom"
                          onClick={() => handleRemoveChatroom(chatroom.id)}
                          aria-label="Remove chatroom">
                          <img src={X} width={12} height={12} alt="Remove chatroom" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className={clsx("navbarAddChatroomDialog", showAddChatroomDialog && "open")}>
          <div className="navbarAddChatroomDialogBody" ref={addChatroomDialogRef}>
            <div className="navbarAddChatroomDialogHead">
              <div className="navbarAddChatroomDialogHeadInfo">
                <h2>Add Chatroom</h2>
                <p>Enter a channel name to add a new chatroom</p>
              </div>
              <button
                className="navbarAddChatroomDialogClose"
                onClick={() => setAddChatroomDialog(false)}
                aria-label="Close Add Chatroom">
                <img src={X} width={16} height={16} alt="Close Add Chatroom" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="navbarAddForm">
              <div>
                <input ref={inputRef} placeholder="Enter username" disabled={isConnecting} />
              </div>
              <button className="navbarAddChatroom" type="submit" disabled={isConnecting}>
                {isConnecting ? "Connecting..." : "Add Chatroom"}
              </button>
            </form>
          </div>

          <div className="dialogBackgroundOverlay" />
        </div>
        {!settings?.general?.wrapChatroomsList && (
          <div className="navbarAddChatroomContainer">
            <button
              className="navbarAddChatroomButton"
              onClick={() => setAddChatroomDialog(!showAddChatroomDialog)}
              disabled={isConnecting}>
              Add
              <img src={Plus} width={16} height={16} alt="Add chatroom" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Navbar;
