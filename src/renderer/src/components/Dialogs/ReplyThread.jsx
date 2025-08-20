import { useEffect, useRef, useState } from "react";
import Message from "../Messages/Message";
import { userKickTalkBadges } from "@utils/kickTalkBadges";
import CloseIcon from "../../assets/icons/x-bold.svg?asset";
import { MessageParser } from "../../utils/MessageParser";
import ChatInput from "../Chat/Input";

const ReplyThread = () => {
  const [dialogData, setDialogData] = useState(null);
  const [replyThreadMessages, setReplyThreadMessages] = useState([]);
  const [originalMessage, setOriginalMessage] = useState(null);
  const replyThreadRef = useRef(null);

  useEffect(() => {
    const loadData = async ({
      chatroomId,
      messages,
      originalMessageId,
      userChatroomInfo,
      chatroomName,
      username,
      settings,
      sevenTVEmotes,
      subscriberBadges,
    }) => {
      setDialogData({
        chatroomId,
        originalMessageId,
        userChatroomInfo,
        chatroomName,
        username,
        settings,
        sevenTVEmotes,
        subscriberBadges,
      });

      setReplyThreadMessages(messages);

      const originalMessage = messages?.[0]?.metadata;
      setOriginalMessage(originalMessage);

      if (!originalMessage) {
        return;
      }
    };

    const updateData = (data) => {
      setReplyThreadMessages(data?.messages);
    };

    const dataCleanup = window.app.replyThreadDialog.onData(loadData);
    const updateCleanup = window.app.replyLogs.onUpdate(updateData);

    return () => {
      dataCleanup();
      updateCleanup();
    };
  }, []);

  useEffect(() => {
    if (replyThreadRef.current) {
      replyThreadRef.current.scrollTop = replyThreadRef.current.scrollHeight;
    }
  }, [replyThreadMessages]);

  return (
    <>
      <div className="replyThreadWrapper">
        <div className="replyThreadHead">
          <p>Reply Thread</p>

          <button className="replyThreadCloseBtn" onClick={() => window.app.replyThreadDialog.close()}>
            <img src={CloseIcon} width={16} height={16} alt="Close" />
          </button>
        </div>

        <div className="replyThreadContent" ref={replyThreadRef}>
          {originalMessage?.original_message?.id && (
            <div className="replyThreadOriginalMessage">
              <span>
                <p>{originalMessage?.original_sender?.username}: </p>
                <MessageParser message={originalMessage?.original_message} type="minified" />
              </span>
            </div>
          )}

          <div className="replyThreadMessages">
            {replyThreadMessages?.map((message, i) => {
              return (
                <Message
                  key={`${message.id}-${i}`}
                  message={message}
                  chatroomId={dialogData?.chatroomId}
                  subscriberBadges={dialogData?.subscriberBadges}
                  sevenTVEmotes={dialogData?.sevenTVEmotes}
                  kickTalkBadges={userKickTalkBadges}
                  userChatroomInfo={dialogData?.userChatroomInfo}
                  chatroomName={dialogData?.chatroomName}
                  username={dialogData?.username}
                  settings={dialogData?.settings}
                  type="replyThread"
                />
              );
            })}
          </div>
        </div>

        <div className="replyThreadInput">
          {originalMessage?.original_message?.id && (
            <ChatInput chatroomId={dialogData?.chatroomId} isReplyThread={true} replyMessage={originalMessage} />
          )}
        </div>
      </div>
    </>
  );
};

export default ReplyThread;
