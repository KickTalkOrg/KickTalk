import "../assets/styles/components/Navbar.css";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import useChatStore from "../providers/ChatProvider";
import Plus from "../assets/icons/plus-bold.svg?asset";
import X from "../assets/icons/x-bold.svg?asset";
import useClickOutside from "../utils/useClickOutside";

const Navbar = ({ currentChatroomId, onSelectChatroom }) => {
  const addChatroom = useChatStore((state) => state.addChatroom);
  const removeChatroom = useChatStore((state) => state.removeChatroom);
  const chatrooms = useChatStore((state) => state.chatrooms);
  const connections = useChatStore((state) => state.connections);

  const [showAddChatroomDialog, setAddChatroomDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const inputRef = useRef(null);
  const chatroomListRef = useRef(null);
  const addChatroomDialogRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const username = inputRef.current?.value.toLowerCase();
    if (!username) return;

    setIsConnecting(true);

    try {
      const newChatroom = await addChatroom(username);
      if (newChatroom) {
        onSelectChatroom(newChatroom.id);
        setAddChatroomDialog(false);
      }

      inputRef.current.value = "";
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemoveChatroom = async (chatroomId) => {
    if (!connections[chatroomId]) return;

    const currentIndex = chatrooms.findIndex((chatroom) => chatroom.id === chatroomId);
    const remainingChatrooms = chatrooms.filter((chatroom) => chatroom && chatroom.id !== chatroomId);

    await removeChatroom(chatroomId);

    // If there are chatrooms available select next in list else select one behind
    if (remainingChatrooms.length) {
      const nextChatroom = remainingChatrooms[currentIndex] || remainingChatrooms[currentIndex - 1];
      onSelectChatroom(nextChatroom.id);
    } else {
      onSelectChatroom(null);
    }
  };

  // Set first chatroom as active on mount
  // TODO: Update to last selected chatroom store in json
  useEffect(() => {
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];

    if (!savedChatrooms.length) return;
    onSelectChatroom(savedChatrooms[0].id);
  }, []);

  useClickOutside(addChatroomDialogRef, () => setAddChatroomDialog(false));

  return (
    <div className="navbarContainer" ref={chatroomListRef}>
      <div className="chatroomsList">
        {chatrooms.map((chatroom) => (
          <div
            key={chatroom.id}
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
              {chatroom.streamerData?.user?.profile_pic && (
                <img
                  className="profileImage"
                  src={chatroom.streamerData.user.profile_pic}
                  alt={`${chatroom.username}'s profile`}
                />
              )}
              <span>{chatroom.username}</span>
            </div>
            <button className="closeChatroom" onClick={() => handleRemoveChatroom(chatroom.id)} aria-label="Remove chatroom">
              <img src={X} width={12} height={12} alt="Remove chatroom" />
            </button>
          </div>
        ))}
      </div>

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

      <div className="navbarAddChatroomContainer">
        <button
          className="navbarAddChatroomButton"
          onClick={() => setAddChatroomDialog(!showAddChatroomDialog)}
          disabled={isConnecting}>
          Add
          <img src={Plus} width={16} height={16} alt="Add chatroom" />
        </button>
      </div>
    </div>
  );
};

export default Navbar;
