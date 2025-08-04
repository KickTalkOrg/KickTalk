import { useState, useEffect, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/shallow";
import clsx from "clsx";
import useChatStore from "../../providers/ChatProvider";
import PushPin from "../../assets/icons/push-pin-fill.svg?asset";
// import PollIcon from "../../assets/icons/poll-fill.svg?asset";
import UserIcon from "../../assets/icons/user-fill.svg?asset";
import ModSwordFillIcon from "../../assets/icons/sword-fill.svg?asset";
import Pin from "./Pin";
// import Poll from "./Poll";
import { convertDateToHumanReadable } from "../../utils/ChatUtils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../Shared/ContextMenu";

const StreamerInfo = memo(
  ({ streamerData, isStreamerLive, chatroomId, userChatroomInfo, settings, updateSettings, handleSearch }) => {
    const { t } = useTranslation();
    const [showPinnedMessage, setShowPinnedMessage] = useState(true);
    // const [showPollMessage, setShowPollMessage] = useState(false);
    const [showStreamerCard, setShowStreamerCard] = useState(false);

    const refresh7TVEmotes = useChatStore((state) => state.refresh7TVEmotes);
    const refreshKickEmotes = useChatStore((state) => state.refreshKickEmotes);

    const pinDetails = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.pinDetails));
    // const predictions = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.predictions));

    // const pollDetails = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.pollDetails));
    // const handlePollDelete = useChatStore(useShallow((state) => state.handlePollDelete));
    // const handlePollUpdate = useChatStore(useShallow((state) => state.handlePollUpdate));

    useEffect(() => {
      if (pinDetails) {
        setShowPinnedMessage(true);
      }

      // if (pollDetails) {
      //   setShowPollMessage(true);
      // }
    }, [pinDetails]);

    const handleRefresh7TV = () => {
      refresh7TVEmotes(chatroomId);
    };

    const handleRefreshKickEmotes = () => {
      refreshKickEmotes(chatroomId);
    };

    const canModerate = userChatroomInfo?.is_broadcaster || userChatroomInfo?.is_moderator || userChatroomInfo?.is_super_admin;

    // F5 to refresh streamer info
    useEffect(() => {
      const handleKeyPress = (event) => {
        if (event.key === "F5") {
          handleRefresh7TV();
          handleRefreshKickEmotes();
        }
      };

      window.addEventListener("keydown", handleKeyPress);

      return () => {
        window.removeEventListener("keydown", handleKeyPress);
      };
    }, [chatroomId, handleRefresh7TV, handleRefreshKickEmotes]);

    const handleToggleModMode = () => {
      updateSettings("moderation", {
        ...settings?.moderation,
        quickModTools: !settings?.moderation?.quickModTools || false,
      });
    };

    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="chatStreamerInfo">
            <div className="chatStreamerInfoContent">
              <span className="streamerName">{streamerData?.user?.username}</span>
              {isStreamerLive && <span className="liveBadgeDot" />}
            </div>

            <div
              className="chatStreamerLiveStatus"
              onMouseOver={() => setShowStreamerCard(true)}
              onMouseLeave={() => setShowStreamerCard(false)}
              onMouseDown={async (e) => {
                if (e.button === 1 && streamerData?.slug) {
                  window.open(`https://kick.com/${streamerData?.slug}`, "_blank");
                }
              }}>
              {isStreamerLive && <span className="chatStreamerLiveStatusTitle">{streamerData?.livestream?.session_title}</span>}

              {showStreamerCard && isStreamerLive && (
                <div className="chatStreamerCard">
                  <div className="chatStreamerCardContent">
                    <div className="chatStreamerCardHeader">
                      <img
                        src={streamerData?.livestream?.thumbnail?.url || streamerData?.banner_image?.url}
                        alt={streamerData?.user?.username}
                      />
                    </div>

                    <div className="chatStreamerCardBody">
                      <span className="chatStreamerCardTitle">{streamerData?.livestream?.session_title}</span>
                      <p>
                        {t('streamerInfo.liveFor', { 
                          duration: convertDateToHumanReadable(streamerData?.livestream?.created_at),
                          viewers: streamerData?.livestream?.viewer_count?.toLocaleString() || 0
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="chatStreamerInfoActions">
              {canModerate && (
                <button
                  className={clsx("chatStreamerInfoModeratorBtn", {
                    disabled: !settings?.moderation?.quickModTools,
                  })}
                  onClick={handleToggleModMode}>
                  <img src={ModSwordFillIcon} width={20} height={20} alt="Moderator" />
                </button>
              )}

              <ChattersBtn chatroomId={chatroomId} streamerData={streamerData} />

              {pinDetails && (
                <button
                  className={clsx("pinnedMessageBtn", pinDetails && "show", showPinnedMessage && "open")}
                  onClick={() => setShowPinnedMessage(!showPinnedMessage)}>
                  <img src={PushPin} width={20} height={20} alt="Pin Message" />
                </button>
              )}

              {/* {showPollMessage && (
                <button
                  className={clsx("pollMessageBtn", showPollMessage && "open")}
                  onClick={() => setShowPollMessage(!showPollMessage)}>
                  <img src={PollIcon} width={24} height={24} alt="Active Poll" />
                </button>
              )} */}
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem onSelect={handleRefresh7TV}>{t('streamerInfo.refreshEmotes')}</ContextMenuItem>
          <ContextMenuItem onSelect={handleRefreshKickEmotes}>{t('streamerInfo.refreshKickEmotes')}</ContextMenuItem>
          <ContextMenuItem onSelect={handleSearch}>{t('streamerInfo.search')}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => window.open(`https://kick.com/${streamerData?.slug}`, "_blank")}>
            {t('streamerInfo.openStream')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => window.open(`https://player.kick.com/${streamerData?.slug}`, "_blank")}>
            {t('streamerInfo.openPlayer')}
          </ContextMenuItem>
          {canModerate && (
            <ContextMenuItem onSelect={() => window.open(`https://kick.com/${streamerData?.slug}/moderator`, "_blank")}>
              {t('streamerInfo.openModView')}
            </ContextMenuItem>
          )}
        </ContextMenuContent>

        {pinDetails && (
          <Pin
            pinDetails={pinDetails}
            subscriberBadges={streamerData?.subscriber_badges}
            chatroomName={streamerData?.user?.username}
            showPinnedMessage={showPinnedMessage}
            setShowPinnedMessage={setShowPinnedMessage}
            chatroomId={chatroomId}
            canModerate={canModerate}
            userChatroomInfo={userChatroomInfo}
          />
        )}

        {/* {pollDetails && (
          <Poll
            pollDetails={pollDetails}
            chatroomId={chatroomId}
            showPollMessage={showPollMessage}
            setShowPollMessage={setShowPollMessage}
            handlePollDelete={handlePollDelete}
            handlePollUpdate={handlePollUpdate}
            canModerate={canModerate}
            chatroomName={streamerData?.user?.username}
          />
        )} */}
      </ContextMenu>
    );
  },
);

const ChattersBtn = memo(
  ({ chatroomId, streamerData }) => {
    const chatters = useChatStore(useShallow((state) => state.chatters[chatroomId] || []));
    const channel7TVEmotes = useChatStore(
      useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.channel7TVEmotes),
    );
    const personalEmoteSets = useChatStore(useShallow((state) => state.personalEmoteSets));
    const userChatroomInfo = useChatStore(
      useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.userChatroomInfo),
    );

    const allStvEmotes = useMemo(() => {
      return [...(personalEmoteSets || []), ...(channel7TVEmotes || [])];
    }, [personalEmoteSets, channel7TVEmotes]);

    const handleChattersBtn = (e) => {
      e.preventDefault();

      const chattersData = {
        chatters: chatters || [],
        streamerData,
        channel7TVEmotes: allStvEmotes,
        userChatroomInfo,
        chatroomId,
      };

      window.app.chattersDialog.open(chattersData);
    };

    return (
      <button onClick={handleChattersBtn} className="chattersBtn">
        <img src={UserIcon} width={20} height={20} alt="Pin Message" />
      </button>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.chatroomId === nextProps.chatroomId &&
      prevProps.streamerData === nextProps.streamerData &&
      prevProps.isStreamerLive === nextProps.isStreamerLive &&
      prevProps.userChatroomInfo === nextProps.userChatroomInfo
    );
  },
);

export default StreamerInfo;
