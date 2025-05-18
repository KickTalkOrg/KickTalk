import { useState, useEffect } from "react";
import { useShallow } from "zustand/shallow";
import clsx from "clsx";
import useChatStore from "../../providers/ChatProvider";
import PushPin from "../../assets/icons/push-pin-fill.svg?asset";
import PollIcon from "../../assets/icons/poll-fill.svg?asset";
import UserIcon from "../../assets/icons/user-fill.svg?asset";
import Pin from "./Pin";
import Poll from "./Poll";

const StreamerInfo = ({ streamerData, streamStatus, isStreamerLive, chatroomId, userChatroomInfo }) => {
  const [showPinnedMessage, setShowPinnedMessage] = useState(true);
  const [showPollMessage, setShowPollMessage] = useState(false);

  const pinDetails = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.pinDetails));
  // const predictions = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.predictions));
  const pollDetails = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.pollDetails));
  const handlePollDelete = useChatStore(useShallow((state) => state.handlePollDelete));
  const chatters = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.chatters));

  const handleChattersBtn = (e) => {
    const chattersData = {
      chatters: chatters || [],
      streamerData,
    };

    window.app.chattersDialog.open(chattersData);
  };

  useEffect(() => {
    if (pinDetails) {
      setShowPinnedMessage(true);
    }

    if (pollDetails) {
      setShowPollMessage(true);
    }
  }, [pinDetails, pollDetails]);

  const handleContextMenu = () => {
    window.app.contextMenu.streamerInfo(streamerData);
  };

  const canModerate = userChatroomInfo?.is_broadcaster || userChatroomInfo?.is_moderator || userChatroomInfo?.is_super_admin;

  return (
    <div className="chatStreamerInfo" onContextMenu={handleContextMenu}>
      <div
        className="chatStreamerInfoContent"
        onMouseDown={async (e) => {
          if (e.button === 1 && streamerData?.slug) {
            window.open(`https://kick.com/${streamerData?.slug}`, "_blank");
          }
        }}>
        <span className="streamerName">{streamerData?.user?.username}</span>
        {isStreamerLive && <span className="liveBadgeDot" />}
      </div>

      <div className="chatStreamerLiveStatus">
        {streamStatus?.session_title && (
          <span className="chatStreamerLiveStatusTitle" title={streamStatus?.session_title}>
            {streamStatus?.session_title}
          </span>
        )}
      </div>
      <div className="chatStreamerInfoActions">
        <button onClick={handleChattersBtn} className="chattersBtn">
          <img src={UserIcon} width={20} height={20} alt="Pin Message" />
        </button>
        {pinDetails && (
          <button
            className={clsx("pinnedMessageBtn", pinDetails && "show", showPinnedMessage && "open")}
            onClick={() => setShowPinnedMessage(!showPinnedMessage)}>
            <img src={PushPin} width={20} height={20} alt="Pin Message" />
          </button>
        )}
        {pollDetails && (
          <button
            className={clsx("pollMessageBtn", showPollMessage && "open")}
            onClick={() => setShowPollMessage(!showPollMessage)}>
            <img src={PollIcon} width={24} height={24} alt="Active Poll" />
          </button>
        )}
      </div>

      {pinDetails && (
        <Pin
          pinDetails={pinDetails}
          chatroomName={streamerData?.user?.username}
          showPinnedMessage={showPinnedMessage}
          setShowPinnedMessage={setShowPinnedMessage}
          chatroomId={chatroomId}
          canModerate={canModerate}
          userChatroomInfo={userChatroomInfo}
        />
      )}

      {/* {pollDetails && ( */}
      <Poll
        pollDetails={pollDetails}
        chatroomId={chatroomId}
        showPollMessage={showPollMessage}
        setShowPollMessage={setShowPollMessage}
        handlePollDelete={handlePollDelete}
        canModerate={canModerate}
      />
      {/* )} */}
    </div>
  );
};

export default StreamerInfo;
