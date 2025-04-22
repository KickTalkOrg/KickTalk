import { useEffect, useRef, useState } from "react";
import "../../assets/styles/components/Dialogs/UserDialog.css";
import KickBadges from "../Cosmetics/Badges";
import { MessageParser } from "../../utils/MessageParser";

const User = () => {
  const [dialogData, setDialogData] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userLogs, setUserLogs] = useState([]);
  const [chatroomData, setChatroomData] = useState([]);
  const dialogLogsRef = useRef(null);

  useEffect(() => {
    const loadData = async (data) => {
      setDialogData(data);

      const chatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
      const currentChatroom = chatrooms.find((chatroom) => chatroom.id === data.chatroomId);
      setChatroomData(currentChatroom);

      const { messages } = await window.app.logs.get({ chatroomId: data.chatroomId, userId: data.sender.id });

      setUserLogs(messages || []);

      // Fetch User Profile in Channel
      const { data: user } = await window.app.kick.getUserInfo(currentChatroom?.slug, data?.sender?.username);
      setUserProfile(user);
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
        <div className="dialogHeaderOptions"></div>
      </div>

      <div className="dialogLogs">
        <div className="dialogLogsHead">
          <p>Recent Logs</p>
        </div>

        <div className="dialogLogsContent" ref={dialogLogsRef}>
          {userLogs?.map((log) => {
            return (
              <div className="dialogLogItem" key={log.id}>
                <div className="chatroomUser">
                  <div className="chatroomBadges">
                    <KickBadges
                      type={"dialog"}
                      badges={log.sender.identity.badges}
                      subscriberBadges={chatroomData?.streamerData?.subscriber_badges || []}
                    />
                  </div>
                  <p style={{ color: `${log.sender.identity.color}` }}>
                    {log.sender.username}
                    <span>:&nbsp;</span>
                  </p>
                </div>
                <div className="dialogLogMessage">
                  <MessageParser message={log} sevenTVEmotes={chatroomData?.channel7TVEmotes} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default User;
