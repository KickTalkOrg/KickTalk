import "../../assets/styles/components/Chat/Message.scss";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import { useDebounceValue } from "../../utils/hooks";
import X from "@assets/icons/x-bold.svg";
import RegularMessage from "../Messages/RegularMessage";

const Search = () => {
  const [searchData, setSearchData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [debouncedValue, setDebouncedValue] = useDebounceValue("", 200);
  const virtuosoRef = useRef(null);
  const inputRef = useRef(null);

  const filteredMessages = useMemo(() => {
    if (!messages?.length) return [];

    // Filter to only message types first
    const messageTypeOnly = messages.filter((message) => message.type === "message");

    if (!debouncedValue.trim()) {
      return messageTypeOnly;
    }

    return messageTypeOnly.filter((message) => {
      if (!message.content) return false;
      return message.content.toLowerCase().includes(debouncedValue.toLowerCase());
    });
  }, [messages, debouncedValue]);

  useEffect(() => {
    const handleData = ({
      messages,
      chatroomId,
      sevenTVEmotes,
      subscriberBadges,
      userChatroomInfo,
      chatroomSlug,
      chatroomName,
      filteredKickTalkBadges,
      userStyle,
      settings,
    }) => {
      setSearchData({
        chatroomId,
        sevenTVEmotes,
        subscriberBadges,
        userChatroomInfo,
        chatroomSlug,
        chatroomName,
        filteredKickTalkBadges,
        userStyle,
        settings,
      });

      setMessages(messages);
    };

    setTimeout(() => {
      inputRef.current.focus();
    }, 0);

    const searchDataCleanup = window.app.searchDialog.onData(handleData);
    return () => {
      searchDataCleanup();
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0 && virtuosoRef.current) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: "end",
          behavior: "auto",
        });
      }, 100);
    }
  }, [messages]);

  const handleOpenUserDialog = useCallback(
    async (e, username) => {
      e.preventDefault();

      const user = await window.app.kick.getUserChatroomInfo(searchData?.chatroomName, username);

      if (!user?.data?.id) return;

      const sender = {
        id: user.data.id,
        username: user.data.username,
        slug: user.data.slug,
      };

      window.app.userDialog.open({
        sender,
        fetchedUser: user?.data,
        chatroomId: searchData?.chatroomId,
        sevenTVEmotes: searchData?.sevenTVEmotes,
        subscriberBadges: searchData?.subscriberBadges,
        userChatroomInfo: searchData?.userChatroomInfo,
        cords: [0, 300],
      });
    },
    [searchData],
  );

  const MessageItem = useCallback(
    (index) => {
      const message = filteredMessages[index];

      return (
        <div key={`${message.id}-${index}`} className="searchResultItem">
          <div className="searchResultItemContent">
            <RegularMessage
              message={message}
              sevenTVEmotes={searchData?.sevenTVEmotes}
              subscriberBadges={searchData?.subscriberBadges}
              chatroomId={searchData?.chatroomId}
              userChatroomInfo={searchData?.userChatroomInfo}
              filteredKickTalkBadges={searchData?.filteredKickTalkBadges}
              userStyle={searchData?.userStyle}
              handleOpenUserDialog={handleOpenUserDialog}
              type={message.type}
              chatroomName={searchData?.chatroomSlug}
              isSearch={true}
              settings={searchData?.settings}
            />
          </div>
        </div>
      );
    },
    [filteredMessages, handleOpenUserDialog, searchData],
  );

  return (
    <div className="searchDialogContainer">
      <div className="searchDialogHead">
        {debouncedValue ? (
          <h2>
            <p>
              Searching History in <span>{searchData?.chatroomName}</span>
            </p>
            <p>
              Messages: <span>{filteredMessages.length}</span> of{" "}
              <span>{messages?.filter((m) => m.type === "message")?.length || 0}</span>
            </p>
          </h2>
        ) : (
          <h2>
            <p>
              Searching History in <span>{searchData?.chatroomName}</span>
            </p>
            <p>
              Messages: <span>{messages?.filter((m) => m.type === "message")?.length || 0}</span>
            </p>
          </h2>
        )}
        <button className="searchDialogCloseBtn" onClick={() => window.app.searchDialog.close()}>
          <img src={X} width={18} height={18} alt="Close" />
        </button>
      </div>

      <div className="searchInput">
        <input
          type="text"
          placeholder="Search messages..."
          onChange={(e) => setDebouncedValue(e.target.value.trim())}
          ref={inputRef}
        />
      </div>

      <div className="searchResults">
        {!filteredMessages?.length && debouncedValue ? (
          <div className="searchResultItem">
            <span>No messages found</span>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: "100%" }}
            totalCount={filteredMessages.length}
            itemContent={MessageItem}
            overscan={5}
            className="virtualSearchResults"
          />
        )}
      </div>
    </div>
  );
};

export default Search;
