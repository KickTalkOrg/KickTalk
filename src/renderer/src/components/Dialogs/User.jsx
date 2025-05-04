import { useEffect, useRef, useState } from "react";
import "../../assets/styles/components/Dialogs/UserDialog.scss";
import Message from "../../utils/Message";
import Pin from "../../assets/icons/push-pin-fill.svg?asset";
import clsx from "clsx";
const User = () => {
  const [dialogData, setDialogData] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userLogs, setUserLogs] = useState([]);
  const [subscriberBadges, setSubscriberBadges] = useState([]);
  const [sevenTVEmotes, setSevenTVEmotes] = useState([]);
  const [kickTalkBadges, setKickTalkBadges] = useState(null);
  const [isDialogPinned, setIsDialogPinned] = useState(false);
  const dialogLogsRef = useRef(null);

  useEffect(() => {
    const loadData = async (data) => {
      setDialogData(data);

      const chatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
      const currentChatroom = chatrooms.find((chatroom) => chatroom.id === data.chatroomId);

      setSevenTVEmotes(currentChatroom?.channel7TVEmotes || []);
      setSubscriberBadges(currentChatroom?.streamerData?.subscriber_badges || []);

      const { messages } = await window.app.logs.get({ chatroomId: data.chatroomId, userId: data.sender.id });
      const badges = await window.app.utils.getBadges();
      setKickTalkBadges(badges || []);

      setUserLogs(messages || []);

      // Fetch User Profile in Channel
      const { data: user } = await window.app.kick.getUserChatroomInfo(currentChatroom?.slug, data?.sender?.username);
      setUserProfile(user);

      // Always make sure dialog starts unpinned
      await window.app.userDialog.pin(false);
    };

    const updateData = (data) => {
      setUserLogs(data.logs?.messages || []);
    };

    const dataCleanup = window.app.userDialog.onData(loadData);
    const updateCleanup = window.app.logs.onUpdate(updateData);

    return () => {
      dataCleanup();
      updateCleanup();
    };
  }, []);

  useEffect(() => {
    dialogLogsRef.current.scrollTop = dialogLogsRef.current.scrollHeight;
  }, [userLogs]);

  const handlePinToggle = async () => {
    await window.app.userDialog.pin(!isDialogPinned);
    setIsDialogPinned(!isDialogPinned);
  };

  return (
    <div className="dialogWrapper">
      <div className="dialogHeader">
        <div className="dialogHeaderUser">
          <div className="dialogHeaderUserImage">
            <img src={userProfile?.profile_pic || "https://kick.com/img/default-profile-pictures/default2.jpeg"} />
          </div>
          <div className="dialogHeaderUserInfo">
            <h1>{dialogData?.sender?.username || "N/A"}</h1>

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
          <button>Mute User</button>
          <button>User Card </button>
        </div>

        <div className="dialogOptions">
          <button className={clsx("dialogOptionsPin", isDialogPinned ? "pinned" : "")} onClick={handlePinToggle}>
            <img src={Pin} width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="dialogLogs">
        <div className="dialogLogsHead">
          <p>Recent Logs</p>
        </div>

        <div className="dialogLogsContent" ref={dialogLogsRef}>
          {userLogs?.map((message, i) => {
            return (
              <Message
                key={`${message.id}-${i}`}
                message={message}
                chatroomId={dialogData?.chatroomId}
                subscriberBadges={subscriberBadges}
                sevenTVEmotes={sevenTVEmotes}
                kickTalkBadges={kickTalkBadges}
                type={"dialog"}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default User;
