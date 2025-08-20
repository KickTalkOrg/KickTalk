import { useState, useEffect, useCallback, useRef } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../Shared/Tooltip";
import { Slider } from "../Shared/Slider";
import BanIcon from "@assets/icons/gavel-fill.svg?asset";
import TimeoutIcon from "@assets/icons/hourglass.svg?asset";
import UnbanIcon from "@assets/icons/circle-slash.svg?asset";
import { convertSecondsToHumanReadable } from "../../utils/ChatUtils";
import useClickOutside from "../../utils/useClickOutside";
import clsx from "clsx";

const ModActions = ({ chatroomName, message }) => {
  if (!chatroomName) return null;

  const timeoutSliderRef = useRef(null);

  const [showTimeoutSlider, setShowTimeoutSlider] = useState(false);
  const [sliderValue, setSliderValue] = useState(20);

  const sliderToDuration = useCallback((value) => {
    const minDuration = 1; // 1 minute
    const maxDuration = 10080; // 7 days in minutes

    // Convert slider value
    const minLog = Math.log(minDuration);
    const maxLog = Math.log(maxDuration);
    const scale = (maxLog - minLog) / 100;

    // Get the raw minutes value
    const minutes = Math.round(Math.exp(minLog + scale * value));

    const days = minutes / (24 * 60);
    if (days >= 1) {
      return Math.round(days) * 24 * 60;
    }

    const hours = minutes / 60;
    if (hours >= 1) {
      return Math.round(hours) * 60;
    }

    return minutes;
  }, []);

  const handleBan = (username, type) => {
    if (!username) return;
    window.app.modActions.getBanUser(chatroomName, username, type);
  };

  const handleTimeoutSlider = (username, value) => {
    if (!username) return;
    const duration = sliderToDuration(value);
    window.app.modActions.getTimeoutUser(chatroomName, username, duration);
    setShowTimeoutSlider(false);
  };

  const handleUnbanUser = (username) => {
    if (!username) return;
    window.app.modActions.getUnbanUser(chatroomName, username);
  };

  // Close slider when clicking outside
  useClickOutside(timeoutSliderRef, () => setShowTimeoutSlider(false));

  return (
    <>
      <TooltipProvider delayDuration={150} skipDelayDuration={0} disableHoverableContent>
        <div className="quickModTools">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={clsx("quickModToolsBtn", showTimeoutSlider && "active")}
                onClick={() => handleUnbanUser(message?.sender?.username)}>
                <img src={UnbanIcon} width={12} height={12} alt="Unban User" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={5}>
              <p>Unban {message?.sender?.username}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={clsx("quickModToolsBtn", showTimeoutSlider && "active")}
                onClick={() => setShowTimeoutSlider(true)}>
                <img src={TimeoutIcon} width={13} height={13} alt="Timeout Slider" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={5}>
              <p>Timeout Slider</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={clsx("quickModToolsBtn", showTimeoutSlider && "active")}
                onClick={() => handleBan(message?.sender?.username, "ban")}>
                <img src={BanIcon} width={12} height={12} alt="Ban User" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={5}>
              <p>Ban {message?.sender?.username}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {showTimeoutSlider && (
        <div className="timeoutSlider" ref={timeoutSliderRef}>
          <div className="timeoutSliderContent">
            <div className="timeoutSliderBody">
              <div className="timeoutSliderDuration">
                <span>{convertSecondsToHumanReadable(sliderToDuration(sliderValue) * 60)}</span>
                <button
                  className="timeoutSliderButton"
                  onClick={() => handleTimeoutSlider(message?.sender?.username, sliderValue)}>
                  Confirm
                </button>
              </div>
              <Slider
                value={[sliderValue]}
                onValueChange={(value) => setSliderValue(value[0])}
                min={0}
                max={100}
                step={1}
                className="timeoutSliderInput"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ModActions;
