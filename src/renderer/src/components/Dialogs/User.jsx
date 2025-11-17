import "../../assets/styles/dialogs/UserDialog.scss";
import { useCallback, useEffect, useRef, useState } from "react";
import { userKickTalkBadges } from "../../../../../utils/kickTalkBadges";
import clsx from "clsx";
import Message from "../Messages/Message";
import Pin from "../../assets/icons/push-pin-fill.svg?asset";
import ArrowUpRight from "../../assets/icons/arrow-up-right-bold.svg?asset";
import Copy from "../../assets/icons/copy-simple-fill.svg?asset";
import BanIcon from "../../assets/icons/gavel-fill.svg?asset";
import UnbanIcon from "../../assets/icons/circle-slash.svg?asset";
import Check from "../../assets/icons/check-bold.svg?asset";
import { KickBadges, KickTalkBadges, StvBadges } from "../Cosmetics/Badges";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../Shared/Tooltip";
import log from "electron-log";
console.log = log.log;


// TODO: Add Kick Talk Badges to User Dialog
// TODO: Add Paints to User Dialog
// TODO: Add Slider/Custom Timeout to User Dialog

const User = () => {
  const [dialogData, setDialogData] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userLogs, setUserLogs] = useState([]);
  const [subscriberBadges, setSubscriberBadges] = useState([]);
  const [sevenTVEmotes, setSevenTVEmotes] = useState([]);
  const [isDialogPinned, setIsDialogPinned] = useState(false);
  const [dialogUserStyle, setDialogUserStyle] = useState(null);
  const [isUserSilenced, setIsUserSilenced] = useState(false);
  const [settings, setSettings] = useState({});
  const dialogLogsRef = useRef(null);

  const kickUsername = localStorage.getItem("kickUsername");

  const [silencedUsers, setSilencedUsers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("silencedUsers")) || { data: [] };
    } catch (e) {
      console.error("Error parsing silenced users:", e);
      return { data: [] };
    }
  });

  const loadData = async ({
    sender,
    chatroomId,
    pinned,
    userStyle,
    cords,
    subscriberBadges,
    userChatroomInfo,
    sevenTVEmotes,
    fetchedUser = null,
  }) => {
    try {
      const chatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
      const currentChatroom = chatrooms.find((chatroom) => chatroom.id === chatroomId);
      const settings = await window.app.store.get();

      setSettings(settings);
      setDialogData({
        sender,
        chatroomId,
        pinned,
        userStyle,
        cords,
        fetchedUser,
        subscriberBadges,
        userChatroomInfo,
        chatroom: currentChatroom,
      });
      setDialogUserStyle(userStyle);
      setSevenTVEmotes(sevenTVEmotes || currentChatroom?.channel7TVEmotes || []);
      setSubscriberBadges(currentChatroom?.streamerData?.subscriber_badges || []);

      const messages = await window.app.logs.get({ chatroomId: chatroomId, userId: sender.id });

      setUserLogs(messages);

      // Fetch User Profile in Channel
      if (!fetchedUser) {
        const { data: user } = await window.app.kick.getUserChatroomInfo(currentChatroom?.slug, sender?.username);
        setUserProfile(user);
      } else {
        setUserProfile(fetchedUser);
      }

      // Silenced User Data
      const silencedUsersData = JSON.parse(localStorage.getItem("silencedUsers")) || { data: [] };
      setSilencedUsers(silencedUsersData);

      const isSilenced = silencedUsersData.data?.some((user) => user.id === sender.id);
      setIsUserSilenced(isSilenced);

      // Pin starts unpinned
      await window.app.userDialog.pin(pinned || false);
      setIsDialogPinned(pinned || false);
    } catch (error) {
      console.error("[User Dialog]: Error loading user dialog data:", error);
    }
  };

  const updateData = (data) => {
    setUserLogs((prevLogs) => {
      if (!data?.logs?.length) return prevLogs;
      const existingIds = new Set(prevLogs.map((msg) => msg.id));
      const newLogs = data.logs.filter((msg) => !existingIds.has(msg.id));

      if (!newLogs.length) return prevLogs;
      return [...prevLogs, ...newLogs];
    });
  };

  const getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  useEffect(() => {
    const dataCleanup = window.app.userDialog.onData(loadData);
    const updateCleanup = window.app.logs.onUpdate(updateData);
    console.log(`[System]: ${userProfile?.username || "Unknown User"} dialog opened.`);
    return () => {
      dataCleanup();
      updateCleanup();
    };
  }, []);

  useEffect(() => {
    if (dialogLogsRef.current) {
      dialogLogsRef.current.scrollTop = dialogLogsRef.current.scrollHeight;
    }
  }, [userLogs, dialogData]);

  const silenceUser = useCallback(async () => {
    if (!dialogData?.sender?.id) return;

    console.log("[System]: " + dialogData?.sender?.username);
    const currentSilencedUsers = JSON.parse(localStorage.getItem("silencedUsers")) || { data: [] };
    const userIndex = currentSilencedUsers.data.findIndex((user) => user.id === dialogData?.sender?.id);

    if (userIndex === -1) {
      currentSilencedUsers.data.push({
        id: dialogData?.sender?.id,
        username: dialogData?.sender?.username,
      });

      window.app.kick.getSilenceUser(dialogData?.sender?.id);
      setIsUserSilenced(true);
    } else {
      currentSilencedUsers.data.splice(userIndex, 1);
      window.app.kick.getUnsilenceUser(dialogData?.sender?.id);
      setIsUserSilenced(false);
    }

    localStorage.setItem("silencedUsers", JSON.stringify(currentSilencedUsers));
    setSilencedUsers(currentSilencedUsers);
  }, [dialogData?.sender?.id]);

  const handlePinToggle = async () => {
    await window.app.userDialog.pin(!isDialogPinned);
    setIsDialogPinned(!isDialogPinned);
  };

  const canModerate =
    dialogData?.userChatroomInfo?.is_broadcaster ||
    dialogData?.userChatroomInfo?.is_moderator ||
    dialogData?.userChatroomInfo?.is_super_admin;

  const handleTimeoutUser = async (duration) => {
    await window.app.modActions.getTimeoutUser(dialogData?.chatroom?.username, dialogData?.sender?.username, duration);
  };

  const userBadges = dialogData?.sender?.identity?.badges || [];

  return (
    <TooltipProvider>
      <div className="dialogWrapper">
        <div className="dialogHeader">
          <div className="dialogHeaderUser">
            <div className="dialogHeaderUserImage">
              <img
                src={
                  userProfile?.profile_pic ||
                  `https://kick.com/img/default-profile-pictures/default-avatar-${getRandomInt(1, 6)}.webp`
                }
              />
            </div>
            <div className="dialogHeaderUserInfo">
              <div className="dialogHeaderUserInfoProfile">
                <h1>{dialogData?.sender?.username || "N/A"}</h1>
                {(userBadges?.length > 0 || dialogData?.userStyle?.badge) && (
                  <div className="dialogHeaderUserBadges">
                    {dialogData?.userStyle?.badge && (
                      <StvBadges badge={dialogData?.userStyle?.badge} className="dialogHeaderUserBadges" tooltip={false} />
                    )}
                    {userBadges?.length > 0 && (
                      <KickBadges
                        badges={userBadges}
                        subscriberBadges={dialogData?.subscriberBadges}
                        tooltip={false}
                        className="dialogHeaderUserBadges"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="dialogHeaderUserDates">
                <div className="dialogHeaderDate">
                  <p>Following since:</p>
                  <span>
                    {userProfile?.following_since
                      ? new Date(userProfile?.following_since).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "N/A"}
                  </span>
                </div>

                <div className="dialogHeaderDate">
                  <p>Subscribed for</p>
                  <span>
                    {userProfile?.subscribed_for > 1 || userProfile?.subscribed_for < 1
                      ? `${userProfile?.subscribed_for} months`
                      : `${userProfile?.subscribed_for} month`}
                    .
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="dialogHeaderOptions">
            <div className="dialogHeaderOptionsTop">
              <button
                className={clsx("dialogHeaderOptionsButton", isUserSilenced && "muted")}
                disabled={
                  kickUsername?.replaceAll("-", "_").toLowerCase() === dialogData?.sender?.username?.toLowerCase() ||
                  !kickUsername
                }
                onClick={silenceUser}>
                <span>{isUserSilenced ? "Unmute User" : "Mute User"}</span>
                <div className="checkBox">
                  <img src={Check} width={14} height={14} alt="Check" />
                </div>
              </button>
              <button
                className="dialogHeaderOptionsButton"
                onClick={() => {
                  // TODO: Fix different underscores effects
                  const transformedUsername = dialogData?.sender?.username.toLowerCase();
                  window.open(`https://kick.com/${transformedUsername}`, "_blank", "noopener,noreferrer");
                }}>
                Open Channel <img src={ArrowUpRight} width={18} height={18} />
              </button>
            </div>

            {canModerate && dialogData?.sender?.username !== dialogData?.chatroom?.username && (
              <div className="dialogHeaderModActions">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button
                      className="dialogHeaderModActionsBtn"
                      onClick={() => {
                        window.app.modActions.getUnbanUser(dialogData?.chatroom?.username, dialogData?.sender?.username);
                      }}>
                      <img src={UnbanIcon} width={16} height={16} alt="Unban" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Unban User</p>
                  </TooltipContent>
                </Tooltip>
                <div className="dialogHeaderModActionsTimeout">
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(1)}>
                    1m
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(5)}>
                    5m
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(30)}>
                    30m
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(60)}>
                    1h
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(1440)}>
                    1d
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(10080)}>
                    1w
                  </button>
                  {/* <div className="dialogHeaderModActionsTimeoutCustom">
                <input type="number" placeholder="Custom" />
              </div> */}
                </div>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button
                      className="dialogHeaderModActionsBtn"
                      onClick={() => {
                        window.app.modActions.getBanUser(dialogData?.chatroom?.username, dialogData?.sender?.username);
                      }}>
                      <img src={BanIcon} width={16} height={16} alt="Ban" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Ban User</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          <div className="dialogOptions">
            <button className={clsx("dialogOptionsButton", isDialogPinned ? "pinned" : "")} onClick={handlePinToggle}>
              <img src={Pin} width={16} height={16} alt="Pin" />
            </button>
            <button
              className="dialogOptionsButton"
              onClick={() => navigator.clipboard.writeText(dialogData?.sender?.username ?? "N/A")}>
              <img src={Copy} width={16} height={16} alt="Copy" />
            </button>
          </div>
        </div>

        <div className="dialogLogs">
          <div className="dialogLogsContent" ref={dialogLogsRef}>
            {userLogs?.map((message, i) => {
              return (
                <Message
                  key={`${message.id}-${i}`}
                  message={message}
                  chatroomId={dialogData?.chatroomId}
                  chatroomName={dialogData?.chatroom?.slug}
                  userChatroomInfo={dialogData?.userChatroomInfo}
                  dialogUserStyle={dialogUserStyle}
                  subscriberBadges={subscriberBadges}
                  allStvEmotes={sevenTVEmotes}
                  settings={settings}
                  kickTalkBadges={userKickTalkBadges}
                  type={"dialog"}
                />
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default User;
