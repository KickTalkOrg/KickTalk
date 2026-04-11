import { useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import useChatStore from "../../providers/ChatProvider";
import "../../assets/styles/dialogs/modLogs.scss";
import NOWWHAT from "../../assets/images/NOWWHAT.avif?asset";
import dayjs from "dayjs";
import ArrowRightIcon from "../../assets/icons/arrow-up-right-bold.svg?asset";

const ModLogs = ({ setActiveChatroom }) => {
  const [selectedChatroom, setSelectedChatroom] = useState("all");
  const { chatrooms, modLogs, getAllModLogs } = useChatStore(
    useShallow((state) => ({
      chatrooms: state.chatrooms,
      modLogs: state.modLogs,
      getAllModLogs: state.getAllModLogs,
    })),
  );

  const filteredLogs = useMemo(() => {
    if (selectedChatroom === "all") {
      return getAllModLogs();
    }
    return (modLogs[selectedChatroom] || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [selectedChatroom, modLogs, getAllModLogs]);

  const formatActionLabel = (action) => {
    switch (action) {
      case "banned":
        return "Banned";
      case "ban_temporary":
        return "Timed Out";
      case "unbanned":
        return "Unbanned";
      case "removed_timeout":
        return "Timeout Removed";
      case "message_deleted":
        return "Message Deleted";
      default:
        return "Moderation Action";
    }
  };

  return (
    <div className="modLogsDialog">
      <div className="modLogsHeader">
        <h2>Mod Logs</h2>
        <select
          className="modLogsChatroomFilter"
          value={selectedChatroom}
          onChange={(event) => setSelectedChatroom(event.target.value)}
        >
          <option value="all">All Chatrooms</option>
          {chatrooms.map((chatroom) => (
            <option key={chatroom.id} value={chatroom.id}>
              {chatroom.displayName || chatroom.username}
            </option>
          ))}
        </select>
      </div>

      <div className="modLogsContent">
        {filteredLogs.length === 0 ? (
          <div className="modLogsEmpty">
            <img src={NOWWHAT} alt="No mod logs" />
            <p>No moderation actions yet...</p>
          </div>
        ) : (
          <div className="modLogsList">
            {filteredLogs.map((log) => {
              const chatroomName = log.chatroomInfo?.displayName || log.chatroomInfo?.streamerUsername || "Unknown";
              const moderator = log.modActionDetails?.banned_by?.username || log.modActionDetails?.unbanned_by?.username || "Bot";
              const targetUser = log.modActionDetails?.user?.username || "Unknown user";
              return (
                <div key={log.id} className="modLogItem">
                  <div className="modLogMeta">
                    <span className="modLogAction">{formatActionLabel(log.modAction)}</span>
                    <span className="modLogChatroom">#{chatroomName}</span>
                    <span className="modLogTime">{dayjs(log.timestamp).format("HH:mm A")}</span>
                  </div>
                  <div className="modLogBody">
                    <span>{moderator}</span>
                    <span>{formatActionLabel(log.modAction).toLowerCase()}</span>
                    <span>{targetUser}</span>
                  </div>
                  <button className="modLogJumpBtn" onClick={() => setActiveChatroom(log.chatroomId)} title="Go to chatroom">
                    <img src={ArrowRightIcon} alt="Go to chatroom" width={14} height={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModLogs;
