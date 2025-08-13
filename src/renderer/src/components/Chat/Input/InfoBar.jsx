import { useMemo, memo, useState } from "react";
import clsx from "clsx";
import { convertSecondsToHumanReadable } from "../../../utils/ChatUtils";
import InfoIcon from "../../../assets/icons/info-fill.svg?asset";

const InfoBar = memo(
  ({ chatroomInfo, initialChatroomInfo }) => {
    const [showInfoBarTooltip, setShowInfoBarTooltip] = useState(false);

    const chatroomMode = useMemo(() => {
      if (chatroomInfo) {
        switch (true) {
          case chatroomInfo?.followers_mode?.enabled:
            return `Followers Only Mode [${convertSecondsToHumanReadable(chatroomInfo?.followers_mode?.min_duration * 60)}]`;
          case chatroomInfo?.subscribers_mode?.enabled:
            return `Subscribers Only Mode`;
          case chatroomInfo?.account_age?.enabled:
            return `Account Age Mode [${convertSecondsToHumanReadable(chatroomInfo?.account_age?.min_duration * 60)}]`;
          case chatroomInfo?.emotes_mode?.enabled:
            return `Emote Only Mode`;
          case chatroomInfo?.slow_mode?.enabled:
            return `Slow Mode [${convertSecondsToHumanReadable(chatroomInfo?.slow_mode?.message_interval)}]`;
          default:
            return "";
        }
      } else if (initialChatroomInfo) {
        const {
          followers_mode,
          subscribers_mode,
          emotes_mode,
          slow_mode,
          message_interval,
          following_min_duration,
        } = initialChatroomInfo?.chatroom ?? {};

        switch (true) {
          case followers_mode:
            return `Followers Only Mode [${convertSecondsToHumanReadable(following_min_duration * 60)}]`;
          case subscribers_mode:
            return `Subscribers Only Mode`;
          case emotes_mode:
            return `Emote Only Mode`;
          case slow_mode:
            return `Slow Mode [${convertSecondsToHumanReadable(message_interval)}]`;
          default:
            return "";
        }
      }
    }, [chatroomInfo, initialChatroomInfo]);

    return (
      <>
        {chatroomMode && (
          <div className="chatInfoBar">
            <span>{chatroomMode}</span>

            <div className="chatInfoBarIcon">
              <div className={clsx("chatInfoBarIconTooltipContent", showInfoBarTooltip && "show")}>
                {(chatroomInfo?.followers_mode?.enabled || initialChatroomInfo?.chatroom?.followers_mode) && (
                  <div className="chatInfoBarTooltipItem">
                    <span>Followers Only Mode Enabled</span>
                  </div>
                )}
                {chatroomInfo?.account_age?.enabled && (
                  <div className="chatInfoBarTooltipItem">
                    <span>
                      Account Age Restriction Enabled [
                      {convertSecondsToHumanReadable(chatroomInfo?.account_age?.min_duration * 60)}]
                    </span>
                  </div>
                )}
                {(chatroomInfo?.subscribers_mode?.enabled || initialChatroomInfo?.chatroom?.subscribers_mode) && (
                  <div className="chatInfoBarTooltipItem">
                    <span>Subscribers Only Mode Enabled</span>
                  </div>
                )}
                {(chatroomInfo?.emotes_mode?.enabled || initialChatroomInfo?.chatroom?.emotes_mode) && (
                  <div className="chatInfoBarTooltipItem">
                    <span>Emote Only Mode Enabled</span>
                  </div>
                )}
                {(chatroomInfo?.slow_mode?.enabled || initialChatroomInfo?.chatroom?.slow_mode) && (
                  <div className="chatInfoBarTooltipItem">
                    <span>Slow Mode Enabled</span>
                  </div>
                )}
              </div>
              <div
                className="chatInfoBarIconTooltip"
                onMouseOver={() => setShowInfoBarTooltip(true)}
                onMouseLeave={() => setShowInfoBarTooltip(false)}>
                <img src={InfoIcon} alt="Info" width={16} height={16} />
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
  (prev, next) => prev.chatroomInfo === next.chatroomInfo && prev.initialChatroomInfo === next.initialChatroomInfo,
);

export default InfoBar;
