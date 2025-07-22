import { MessageParser } from "../../utils/MessageParser";
import RegularMessage from "./RegularMessage";
import ArrowReplyLineIcon from "../../assets/icons/arrow_reply_line.svg?asset";
import useChatStore from "../../providers/ChatProvider";
import { useShallow } from "zustand/shallow";
import { memo, useMemo } from "react";

const ReplyMessage = ({
  message,
  sevenTVEmotes,
  sevenTVSettings,
  subscriberBadges,
  kickTalkBadges,
  donatorBadges,
  handleOpenUserDialog,
  userStyle,
  chatroomId,
  chatroomName,
  userChatroomInfo,
  handleOpenReplyThread,
  username,
  settings,
}) => {
  const chatStoreMessageThread = useChatStore(
    useShallow((state) =>
      state.messages[chatroomId]?.filter((m) => m?.metadata?.original_message?.id === message?.metadata?.original_message?.id),
    ),
  );

  return (
    <div className="chatMessageReply">
      <span className="chatMessageReplyText">
        <img className="chatMessageReplySymbol" src={ArrowReplyLineIcon} />
        <span className="chatMessageReplyTextSender">
          <button
            className="chatMessageReplyTextSenderUsername"
            onClick={(e) => handleOpenUserDialog(e, message?.metadata?.original_sender?.username.toLowerCase())}>
            @{message?.metadata?.original_sender?.username}:
          </button>
        </span>
        <span
          className="chatMessageReplyTextContent"
          onClick={() => handleOpenReplyThread(chatStoreMessageThread)}
          title={message?.metadata?.original_message?.content}>
          <MessageParser
            type="reply"
            message={message?.metadata?.original_message}
            sevenTVEmotes={sevenTVEmotes}
            sevenTVSettings={sevenTVSettings}
            userChatroomInfo={userChatroomInfo}
            chatroomId={chatroomId}
            chatroomName={chatroomName}
            subscriberBadges={subscriberBadges}
          />
        </span>
      </span>

      <RegularMessage
        message={message}
        subscriberBadges={subscriberBadges}
        kickTalkBadges={kickTalkBadges}
        donatorBadges={donatorBadges}
        sevenTVEmotes={sevenTVEmotes}
        handleOpenUserDialog={handleOpenUserDialog}
        userStyle={userStyle}
        chatroomId={chatroomId}
        chatroomName={chatroomName}
        userChatroomInfo={userChatroomInfo}
        settings={settings}
        username={username}
      />
    </div>
  );
};

export default ReplyMessage;
