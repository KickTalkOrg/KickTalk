import { useMemo, memo, useRef, useState, useEffect } from "react";
import clsx from "clsx";
import { convertSecondsToHumanReadable } from "../../../utils/ChatUtils";
import InfoIcon from "../../../assets/icons/info-fill.svg?asset";

const getModeEnabled = (modeValue) =>
  typeof modeValue === "boolean" ? modeValue : Boolean(modeValue?.enabled);

const getModeMinDuration = (modeValue, fallbackMinutes = 0) => {
  if (typeof modeValue === "object" && modeValue !== null) {
    return modeValue?.min_duration ?? fallbackMinutes;
  }
  return fallbackMinutes;
};

const getSlowMessageInterval = (modeValue, fallbackSeconds = 0) => {
  if (typeof modeValue === "object" && modeValue !== null) {
    return modeValue?.message_interval ?? fallbackSeconds;
  }
  return fallbackSeconds;
};

const InfoBar = memo(
  ({ chatroomInfo, initialChatroomInfo }) => {
    const [showInfoBarTooltip, setShowInfoBarTooltip] = useState(false);
    const lastLoggedModeRef = useRef("");

    const effectiveModeState = useMemo(() => {
      const realtimeSource = chatroomInfo?.chatroom ?? chatroomInfo;
      const hasRealtimeModeData =
        !!realtimeSource &&
        typeof realtimeSource === "object" &&
        ("followers_mode" in realtimeSource ||
          "subscribers_mode" in realtimeSource ||
          "account_age" in realtimeSource ||
          "emotes_mode" in realtimeSource ||
          "slow_mode" in realtimeSource);

      if (hasRealtimeModeData) {
        return {
          followersEnabled: getModeEnabled(realtimeSource?.followers_mode),
          followersMinDuration: getModeMinDuration(
            realtimeSource?.followers_mode,
            realtimeSource?.following_min_duration ?? 0,
          ),
          subscribersEnabled: getModeEnabled(realtimeSource?.subscribers_mode),
          accountAgeEnabled: getModeEnabled(realtimeSource?.account_age),
          accountAgeMinDuration: getModeMinDuration(realtimeSource?.account_age),
          emotesEnabled: getModeEnabled(realtimeSource?.emotes_mode),
          slowEnabled: getModeEnabled(realtimeSource?.slow_mode),
          slowMessageInterval: getSlowMessageInterval(
            realtimeSource?.slow_mode,
            realtimeSource?.message_interval ?? 0,
          ),
        };
      }

      return {
        followersEnabled: getModeEnabled(
          initialChatroomInfo?.chatroom?.followers_mode,
        ),
        followersMinDuration: getModeMinDuration(
          initialChatroomInfo?.chatroom?.followers_mode,
          initialChatroomInfo?.chatroom?.following_min_duration ?? 0,
        ),
        subscribersEnabled: getModeEnabled(
          initialChatroomInfo?.chatroom?.subscribers_mode,
        ),
        accountAgeEnabled: false,
        accountAgeMinDuration: 0,
        emotesEnabled: getModeEnabled(initialChatroomInfo?.chatroom?.emotes_mode),
        slowEnabled: getModeEnabled(initialChatroomInfo?.chatroom?.slow_mode),
        slowMessageInterval: getSlowMessageInterval(
          initialChatroomInfo?.chatroom?.slow_mode,
          initialChatroomInfo?.chatroom?.message_interval ?? 0,
        ),
      };
    }, [chatroomInfo, initialChatroomInfo]);

    const chatroomMode = useMemo(() => {
      switch (true) {
        case effectiveModeState.followersEnabled:
          return `Followers Only Mode [${convertSecondsToHumanReadable(effectiveModeState.followersMinDuration * 60)}]`;
        case effectiveModeState.subscribersEnabled:
          return `Subscribers Only Mode`;
        case effectiveModeState.accountAgeEnabled:
          return `Account Age Mode [${convertSecondsToHumanReadable(effectiveModeState.accountAgeMinDuration * 60)}]`;
        case effectiveModeState.emotesEnabled:
          return `Emote Only Mode`;
        case effectiveModeState.slowEnabled:
          return `Slow Mode [${convertSecondsToHumanReadable(effectiveModeState.slowMessageInterval)}]`;
        default:
          return "";
      }
    }, [effectiveModeState]);

    useEffect(() => {
      const realtimeSource = chatroomInfo?.chatroom ?? chatroomInfo;
      const fallbackSource = initialChatroomInfo?.chatroom;
      const logSnapshot = {
        modeLabel: chatroomMode || "none",
        source:
          realtimeSource && typeof realtimeSource === "object"
            ? "realtime"
            : "initial_fallback",
        effective: effectiveModeState,
        rawRealtimeModes: {
          followers_mode: realtimeSource?.followers_mode,
          subscribers_mode: realtimeSource?.subscribers_mode,
          account_age: realtimeSource?.account_age,
          emotes_mode: realtimeSource?.emotes_mode,
          slow_mode: realtimeSource?.slow_mode,
        },
        rawInitialModes: {
          followers_mode: fallbackSource?.followers_mode,
          subscribers_mode: fallbackSource?.subscribers_mode,
          emotes_mode: fallbackSource?.emotes_mode,
          slow_mode: fallbackSource?.slow_mode,
          following_min_duration: fallbackSource?.following_min_duration,
          message_interval: fallbackSource?.message_interval,
        },
      };

      const serializedSnapshot = JSON.stringify(logSnapshot);
      if (lastLoggedModeRef.current === serializedSnapshot) {
        return;
      }

      lastLoggedModeRef.current = serializedSnapshot;
      console.log("[InfoBar Mode Debug]", logSnapshot);
    }, [chatroomInfo, initialChatroomInfo, effectiveModeState, chatroomMode]);

    return (
      <>
        {chatroomMode && (
          <div className="chatInfoBar">
            <span>{chatroomMode}</span>

            <div className="chatInfoBarIcon">
              <div className={clsx("chatInfoBarIconTooltipContent", showInfoBarTooltip && "show")}>
                {effectiveModeState.followersEnabled && (
                  <div className="chatInfoBarTooltipItem">
                    <span>Followers Only Mode Enabled</span>
                  </div>
                )}
                {effectiveModeState.accountAgeEnabled && (
                  <div className="chatInfoBarTooltipItem">
                    <span>
                      Account Age Restriction Enabled [
                      {convertSecondsToHumanReadable(effectiveModeState.accountAgeMinDuration * 60)}]
                    </span>
                  </div>
                )}
                {effectiveModeState.subscribersEnabled && (
                  <div className="chatInfoBarTooltipItem">
                    <span>Subscribers Only Mode Enabled</span>
                  </div>
                )}
                {effectiveModeState.emotesEnabled && (
                  <div className="chatInfoBarTooltipItem">
                    <span>Emote Only Mode Enabled</span>
                  </div>
                )}
                {effectiveModeState.slowEnabled && (
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
