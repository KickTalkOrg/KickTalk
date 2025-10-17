import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { convertMinutesToHumanReadable } from "../../utils/ChatUtils";
import useCosmeticsStore from "../../providers/CosmeticsProvider";
import { useShallow } from "zustand/react/shallow";

const ModActionMessage = ({ message, chatroomId, allStvEmotes, subscriberBadges, chatroomName, userChatroomInfo }) => {
  const { t } = useTranslation();
  const { modAction, modActionDetails } = message;
  const getUserStyle = useCosmeticsStore(useShallow((state) => state.getUserStyle));

  const actionTaker = modActionDetails?.banned_by?.username || modActionDetails?.unbanned_by?.username;
  const moderator = actionTaker !== "moderated" ? actionTaker : "Bot";
  const username = modActionDetails?.user?.username;
  const duration = modActionDetails?.duration;

  const isBanAction = modAction === "banned" || modAction === "ban_temporary";

  const handleOpenUserDialog = useCallback(
    async (usernameDialog) => {
      if (usernameDialog === "moderator" || usernameDialog === "Bot") return;
      const user = await window.app.kick.getUserChatroomInfo(chatroomName, usernameDialog);
      if (!user?.data?.id) return;

      const userStyle = getUserStyle(usernameDialog);

      const userDialogInfo = {
        id: user.data.id,
        username: user.data.username,
        slug: user.data.slug,
        identity: {
          badges: user.data?.badges,
        },
      };

      window.app.userDialog.open({
        sender: userDialogInfo,
        fetchedUser: user?.data,
        chatroomId,
        userStyle,
        sevenTVEmotes: allStvEmotes,
        subscriberBadges,
        userChatroomInfo,
        cords: [0, 300],
      });
    },
    [chatroomName, username, chatroomId, allStvEmotes, subscriberBadges],
  );

  return (
    <div className="modActionContainer">
      <div className="modActionMessage">
        {isBanAction ? (
          <>
            <button onClick={() => handleOpenUserDialog(moderator)}>{moderator}</button>{" "}
            {modAction === "banned" 
              ? t('messages.modAction.permanentlyBanned')
              : t('messages.modAction.timedOut')
            }{" "}
            <button onClick={() => handleOpenUserDialog(username)}>{username}</button>{" "}
            {modAction === "ban_temporary" && t('messages.modAction.forDuration', { duration: convertMinutesToHumanReadable(duration) })}
          </>
        ) : (
          <>
            <button onClick={() => handleOpenUserDialog(moderator)}>{moderator}</button>{" "}
            {modAction === "unbanned" 
              ? t('messages.modAction.unbanned') 
              : t('messages.modAction.removedTimeoutOn')
            }{" "}
            <button onClick={() => handleOpenUserDialog(username)}>{username}</button>
          </>
        )}
      </div>
    </div>
  );
};

export default ModActionMessage;
