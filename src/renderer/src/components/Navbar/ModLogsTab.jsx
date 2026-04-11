import { memo } from "react";
import clsx from "clsx";

const ModLogsTab = memo(({ currentChatroomId, onSelectChatroom }) => {
  return (
    <div
      onClick={() => onSelectChatroom("modLogs")}
      className={clsx("chatroomStreamer", currentChatroomId === "modLogs" && "chatroomStreamerActive")}
    >
      <div className="streamerInfo">
        <span>Mod Logs</span>
      </div>
    </div>
  );
});

ModLogsTab.displayName = "ModLogsTab";

export default ModLogsTab;
