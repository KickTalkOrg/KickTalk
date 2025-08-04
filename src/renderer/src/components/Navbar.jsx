import "../assets/styles/components/Navbar.scss";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useChatStore from "../providers/ChatProvider";
import Plus from "../assets/icons/plus-bold.svg?asset";
import X from "../assets/icons/x-bold.svg?asset";
import useClickOutside from "../utils/useClickOutside";
import { useSettings } from "../providers/SettingsProvider";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import NotificationIcon from "../assets/icons/notification-bell.svg?asset";
import MessageIcon from "../assets/icons/message-bubble.svg?asset";
import ChatroomTab from "./Navbar/ChatroomTab";
import MentionsTab from "./Navbar/MentionsTab";

const Navbar = ({ currentChatroomId, kickId, onSelectChatroom }) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const connections = useChatStore((state) => state.connections);
  const addChatroom = useChatStore((state) => state.addChatroom);
  const removeChatroom = useChatStore((state) => state.removeChatroom);
  const renameChatroom = useChatStore((state) => state.renameChatroom);
  const reorderChatrooms = useChatStore((state) => state.reorderChatrooms);
  const orderedChatrooms = useChatStore((state) => state.getOrderedChatrooms());
  const hasMentionsTab = useChatStore((state) => state.hasMentionsTab);
  const addMentionsTab = useChatStore((state) => state.addMentionsTab);
  const removeMentionsTab = useChatStore((state) => state.removeMentionsTab);

  const [editingChatroomId, setEditingChatroomId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [showNavbarDialog, setShowNavbarDialog] = useState(false);
  const [activeSection, setActiveSection] = useState("chatroom");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmitError, setIsSubmitError] = useState(null);

  const inputRef = useRef(null);
  const renameInputRef = useRef(null);
  const chatroomListRef = useRef(null);
  const addChatroomDialogRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const username = inputRef.current?.value.toLowerCase();
    if (!username) return;

    setIsConnecting(true);

    try {
      const newChatroom = await addChatroom(username);

      if (newChatroom?.username) {
        inputRef.current.value = "";
        setShowNavbarDialog(false);
        setTimeout(() => {
          onSelectChatroom(newChatroom.id);
        }, 0);

        return;
      }

      if (newChatroom?.status)
        setTimeout(() => {
          setIsSubmitError(null);
        }, 2000);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemoveChatroom = async (chatroomId) => {
    if (!connections[chatroomId]) return;

    const currentIndex = orderedChatrooms.findIndex((chatroom) => chatroom.id === chatroomId);
    await removeChatroom(chatroomId);

    // Get the remaining chatrooms after removal
    const remainingChatrooms = orderedChatrooms.filter((chatroom) => chatroom.id !== chatroomId);

    // If there are chatrooms available select next in list else select one behind
    if (remainingChatrooms.length) {
      const nextChatroom = remainingChatrooms[currentIndex] || remainingChatrooms[currentIndex - 1];
      if (nextChatroom) {
        onSelectChatroom(nextChatroom.id);
      }
    } else {
      onSelectChatroom(null);
    }
  };

  // Drag and drop chatrooms
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination } = result;

    if (source.index === destination.index) return;

    const reordered = Array.from(orderedChatrooms);
    const [removed] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, removed);

    // Update state
    reorderChatrooms(reordered);
  };

  // Select first chatroom on mount if no chatroom is currently selected
  useEffect(() => {
    if (orderedChatrooms.length > 0 && !currentChatroomId) {
      onSelectChatroom(orderedChatrooms[0].id);
    }
  }, [orderedChatrooms, currentChatroomId, onSelectChatroom]);

  // Setup event listeners
  useEffect(() => {
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
  }, []);

  useClickOutside(addChatroomDialogRef, () => {
    setActiveSection("chatroom");
    setShowNavbarDialog(false);
  });

  // Handle Add Mentions Tab
  const handleAddMentions = () => {
    if (!kickId) return window.app.authDialog.open();

    addMentionsTab();
    setShowNavbarDialog(false);
    setTimeout(() => {
      onSelectChatroom("mentions");
    }, 0);
  };

  const handleRemoveMentionsTab = () => {
    removeMentionsTab();

    // Handle chatroom switching if mentions tab was active
    if (currentChatroomId === "mentions") {
      if (orderedChatrooms.length > 0) {
        onSelectChatroom(orderedChatrooms[0].id);
      } else {
        onSelectChatroom(null);
      }
    }
  };

  // Handle new chatroom key press (ctrl + t) and close dialog (escape)
  const handleNewChatroomKeyPress = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "t" || e.key.toLowerCase() === "j")) {
      e.preventDefault();

      setShowNavbarDialog(true);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }

    if (e.key === "Escape") {
      setActiveSection("chatroom");
      setShowNavbarDialog(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleNewChatroomKeyPress);
    return () => {
      window.removeEventListener("keydown", handleNewChatroomKeyPress);
    };
  }, [handleNewChatroomKeyPress]);

  // Rename Chatroom
  const handleRename = ({ chatroomId, currentDisplayName }) => {
    setEditingChatroomId(chatroomId);
    setEditingName(currentDisplayName);
    setTimeout(() => {
      renameInputRef.current?.focus();
    }, 250);
  };

  const handleRenameSubmit = (chatroomId) => {
    if (editingName.trim()) {
      renameChatroom(chatroomId, editingName.trim());
    }
    setEditingChatroomId(null);
    setEditingName("");
  };

  return (
    <>
      <div className={clsx("navbarContainer", settings?.general?.wrapChatroomsList && "wrapChatroomList")} ref={chatroomListRef}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="chatrooms" direction="horizontal">
            {(provided) => (
              <div className="chatroomsList" {...provided.droppableProps} ref={provided.innerRef}>
                {orderedChatrooms.map((chatroom, index) => (
                  <ChatroomTab
                    key={chatroom.id}
                    chatroom={chatroom}
                    index={index}
                    currentChatroomId={currentChatroomId}
                    onSelectChatroom={onSelectChatroom}
                    onRemoveChatroom={handleRemoveChatroom}
                    onRename={handleRename}
                    editingChatroomId={editingChatroomId}
                    editingName={editingName}
                    setEditingName={setEditingName}
                    onRenameSubmit={handleRenameSubmit}
                    setEditingChatroomId={setEditingChatroomId}
                    renameInputRef={renameInputRef}
                    settings={settings}
                  />
                ))}
                {provided.placeholder}
                {orderedChatrooms.length > 0 && <span className="chatroomsSeparator" />}
                {hasMentionsTab && (
                  <MentionsTab
                    currentChatroomId={currentChatroomId}
                    onSelectChatroom={onSelectChatroom}
                    onRemoveMentionsTab={handleRemoveMentionsTab}
                  />
                )}
                {settings?.general?.wrapChatroomsList && (
                  <div className="navbarAddChatroomContainer">
                    <button
                      className="navbarAddChatroomButton"
                      onClick={() => {
                        setActiveSection("chatroom");
                        setShowNavbarDialog(!showNavbarDialog);
                        if (!showNavbarDialog) {
                          setTimeout(() => {
                            inputRef.current?.focus();
                          }, 0);
                        }
                      }}
                      disabled={isConnecting}>
                      <span>Add</span>
                      <img src={Plus} width={16} height={16} alt="Add chatroom" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className={clsx("navbarDialog", showNavbarDialog && "open")}>
          <div className="navbarDialogBody" ref={addChatroomDialogRef}>
            <div className="navbarDialogOptions">
              <div className="navbarDialogOptionBtns">
                <button
                  onClick={() => setActiveSection("chatroom")}
                  className={clsx("navbarDialogOptionBtn", activeSection === "chatroom" && "active")}>
                  <img src={MessageIcon} width={24} height={24} alt={t('navbar.addChatroom')} />
                  <span>{t('navbar.chatroom')}</span>
                </button>
                <button
                  onClick={() => setActiveSection("mentions")}
                  className={clsx("navbarDialogOptionBtn", activeSection === "mentions" && "active")}>
                  <img src={NotificationIcon} width={24} height={24} alt={t('navbar.mentions')} />
                  <span>{t('navbar.mentions')}</span>
                </button>
              </div>

              <button className="navbarDialogClose" onClick={() => setShowNavbarDialog(false)} aria-label={t('navbar.closeAddMentions')}>
                <img src={X} width={16} height={16} alt={t('navbar.closeAddMentions')} />
              </button>
            </div>

            <div className={clsx("navbarAddChatroomDialog", activeSection === "chatroom" && "active")}>
              <div className="navbarAddChatroomDialogHead">
                <div className="navbarAddChatroomDialogHeadInfo">
                  <h2>{t('navbar.addChatroom')}</h2>
                  <p>{t('navbar.addChatroomDescription')}</p>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="navbarAddForm">
                <div>
                  <input ref={inputRef} placeholder={t('navbar.enterStreamerName')} disabled={isConnecting} />
                </div>
                <button className="navbarAddChatroomBtn navbarDialogBtn" type="submit" disabled={isConnecting}>
                  {isConnecting ? t('navbar.connecting') : isSubmitError ? isSubmitError?.message : t('navbar.addChatroom')}
                </button>
              </form>
            </div>

            <div className={clsx("navbarAddMentionsDialog", activeSection === "mentions" && "active")}>
              <div className="navbarAddMentionsDialogHead">
                <div className="navbarAddMentionsDialogHeadInfo">
                  <h2>{t('navbar.addMentionsTab')}</h2>
                  <p>{t('navbar.addMentionsDescription')}</p>
                </div>
                <div className="navbarAddMentionsForm">
                  <button className="navbarAddMentionsBtn navbarDialogBtn" onClick={handleAddMentions}>
                    {t('navbar.addMentionsTab')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="dialogBackgroundOverlay" />
        </div>

        {/* Add chatroom button */}
        {!settings?.general?.wrapChatroomsList && (
          <div className="navbarAddChatroomContainer">
            <button
              className="navbarAddChatroomButton"
              onClick={() => {
                setShowNavbarDialog(!showNavbarDialog);
                if (!showNavbarDialog) {
                  setTimeout(() => {
                    inputRef.current?.focus();
                  }, 0);
                }
              }}
              disabled={isConnecting}>
              {t('common.add')}
              <img src={Plus} width={16} height={16} alt={t('navbar.addChatroom')} />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Navbar;
