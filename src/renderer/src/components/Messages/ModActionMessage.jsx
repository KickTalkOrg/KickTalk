import { convertMinutesToHumanReadable } from "../../utils/ChatUtils";

const ModActionMessage = ({ message }) => {
  const { modAction, modActionDetails } = message;
  const actionTaker = modActionDetails?.banned_by?.username || modActionDetails?.unbanned_by?.username;
  const moderator = actionTaker !== "moderated" ? actionTaker : "Bot";
  const username = modActionDetails?.user?.username;
  const duration = modActionDetails?.duration;

  const isBanAction = modAction === "banned" || modAction === "ban_temporary";

  return (
    <div className="modActionContainer">
      <div className="modActionMessage">
        {isBanAction ? (
          <>
            <span>{moderator}</span> {modAction === "banned" ? "permanently banned " : "timed out "}
            <span>{username}</span> {modAction === "ban_temporary" && ` for ${convertMinutesToHumanReadable(duration)}`}
          </>
        ) : (
          <>
            <span>{moderator}</span> {modAction === "unbanned" ? "unbanned" : "removed timeout on"} <span>{username}</span>
          </>
        )}
      </div>
    </div>
  );
};

export default ModActionMessage;
