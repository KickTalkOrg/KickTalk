import "../../assets/styles/dialogs/Settings.scss";
import { useEffect, useState, useCallback } from "react";
import { useSettings } from "../../providers/SettingsProvider";
import { Switch } from "../Shared/Switch";
import { Slider } from "../Shared/Slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../Shared/Tooltip";
import clsx from "clsx";
import X from "../../assets/icons/x-bold.svg?asset";
import InfoIcon from "../../assets/icons/info-fill.svg?asset";
import KickTalkLogo from "../../assets/logos/KickTalkLogo.svg?asset";
import SignOut from "../../assets/icons/sign-out-bold.svg?asset";
import ColorPicker from "../Shared/ColorPicker";
import darkProfilePic from "../../assets/app/darkProfilePic.jpg";
import ftkProfilePic from "../../assets/app/ftk789ProfilePic.jpg";
import XLogo from "../../assets/logos/XLogo.svg?asset";
import kickLogoIcon from "../../assets/logos/kickLogoIcon.svg?asset";

const Settings = () => {
  const { updateSettings, settings } = useSettings();
  const [activeSection, setActiveSection] = useState("general");
  const [userData, setUserData] = useState(null);
  const [openColorPicker, setOpenColorPicker] = useState(false);
  const [settingsData, setSettingsData] = useState(null);
  const [appInfo, setAppInfo] = useState(null);

  useEffect(() => {
    const cleanupUserData = window.app.settingsDialog.onData((data) => {
      setUserData(data?.userData);
      setSettingsData(data?.settings);
    });

    const getAppInfo = async () => {
      const appInfo = await window.app.getAppInfo();
      setAppInfo(appInfo);
    };

    getAppInfo();

    return () => {
      cleanupUserData();
    };
  }, []);

  useEffect(() => {
    if (settings) {
      setSettingsData(settings);
    }
  }, [settings]);

  const changeSetting = (key, value) => {
    try {
      updateSettings(key, value);
    } catch (error) {
      console.error("[Settings]: Failed to save setting:", error);
    }
  };

  const handleAddPhrase = useCallback(
    (e) => {
      const value = e.target.value.trim();
      if (settings?.notifications?.phrases.includes(value)) return;
      if (e.key === "Enter" && value.length > 0) {
        changeSetting("notifications", {
          ...settings?.notifications,
          phrases: [...settings?.notifications?.phrases, value],
        });
        e.target.value = "";
      }
    },
    [settings?.notifications?.phrases, changeSetting],
  );

  const handleColorChange = useCallback(
    (color) => {
      changeSetting("notifications", {
        ...settingsData?.notifications,
        backgroundColour: color,
      });
    },
    [settingsData, settings, changeSetting],
  );

  const handleLogout = () => {
    window.app.logout();
  };

  return (
    <TooltipProvider>
      <div className="settingsDialogWrapper">
        <div className="settingsDialogHeader">
          <h2>Settings</h2>

          <button className="settingsDialogCloseBtn" onClick={() => window.app.settingsDialog.close()}>
            <img src={X} width={16} height={16} alt="Close" />
          </button>
        </div>
        <div className="settingsDialogContainer">
          <div className="settingsMenu">
            <div className="settingsMenuItems">
              <div className="settingsMenuSection">
                <div className="settingsMenuSectionItem">
                  <button
                    className={clsx("settingsMenuSectionItemBtn", "settingsMenuSectionAppInfo", {
                      active: activeSection === "info",
                    })}
                    onClick={() => setActiveSection("info")}>
                    <span>About KickTalk</span>
                    <img src={KickTalkLogo} width={16} height={16} alt="KickTalk Logo" />
                  </button>
                </div>
              </div>
              <div className="settingsMenuSection">
                <div className="settingsMenuSectionHeader">
                  <h5>General</h5>
                </div>

                <div className="settingsMenuSectionItem">
                  <button
                    className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "general" })}
                    onClick={() => setActiveSection("general")}>
                    General
                  </button>
                </div>
              </div>
              <div className="settingsMenuSection">
                <div className="settingsMenuSectionHeader">
                  <h5>Chat</h5>
                </div>

                <div className="settingsMenuSectionItem">
                  <button
                    disabled
                    className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "chat" })}
                    onClick={() => setActiveSection("chat")}>
                    Commands
                  </button>
                  <button
                    disabled
                    className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "chat" })}
                    onClick={() => setActiveSection("chat")}>
                    Highlights
                  </button>
                  <button
                    disabled
                    className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "chat" })}
                    onClick={() => setActiveSection("chat")}>
                    Filters
                  </button>
                </div>
              </div>
            </div>

            <div className="settingsMenuFooter">
              <button className="settingsMenuFooterBtn" onClick={handleLogout}>
                <span>Sign Out</span>
                <img src={SignOut} width={16} height={16} alt="Sign Out" />
              </button>
            </div>
          </div>

          <div className="settingsContent">
            {activeSection === "info" && (
              <div className="settingsContentAbout">
                <div className="settingsContentSection">
                  <div className="settingsSectionHeader">
                    <h4>About KickTalk</h4>
                    <p>A chat client for Kick.com.</p>
                  </div>

                  <div className="settingsContentAboutDevsContainer">
                    <div className="settingsContentHeader">
                      <h5>Meet the Creators</h5>
                    </div>
                    <div className="settingsContentAboutDevs">
                      <div className="settingsContentAboutDev">
                        <div className="settingsContentAboutDevInfo">
                          <img src={darkProfilePic} alt="dark Profile Pic" width={80} height={80} />
                          <div className="settingsContentAboutDevSections">
                            <span>
                              <p>Kick Username:</p>
                              <h5>DRKNESS_x</h5>
                            </span>
                            <span>
                              <p>Role:</p>
                              <h5>Developer & Designer</h5>
                            </span>
                          </div>
                        </div>

                        <div className="settingsContentAboutDevSocials">
                          <a href="https://x.com/drkerco" target="_blank" rel="noopener noreferrer">
                            <span>Open Twitter</span>
                            <img src={XLogo} width={12} height={12} alt="X-Twitter Logo" />
                          </a>
                          <a href="https://kick.com/drkness-x" target="_blank" rel="noopener noreferrer">
                            <span>Open Channel</span>
                            <img src={kickLogoIcon} width={12} height={12} alt="Kick Logo" />
                          </a>
                        </div>
                      </div>
                      <div className="settingsContentAboutDevSeparator" />
                      <div className="settingsContentAboutDev">
                        <div className="settingsContentAboutDevInfo">
                          <img src={ftkProfilePic} alt="ftk789 Profile Pic" width={80} height={80} />
                          <div className="settingsContentAboutDevSections">
                            <span>
                              <p>Kick Username:</p>
                              <h5>ftk789</h5>
                            </span>
                            <span>
                              <p>Role:</p>
                              <h5>Developer</h5>
                            </span>
                          </div>
                        </div>

                        <div className="settingsContentAboutDevSocials">
                          <a href="https://x.com/ftk789yt" target="_blank" rel="noopener noreferrer">
                            <span>Open Twitter</span>
                            <img src={XLogo} width={12} height={12} alt="X-Twitter Logo" />
                          </a>
                          <a href="https://kick.com/ftk789" target="_blank" rel="noopener noreferrer">
                            <span>Open Channel</span>
                            <img src={kickLogoIcon} width={12} height={12} alt="Kick Logo" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="settingsContentSection">
                  <div className="settingsContentAboutApp">
                    <div className="settingsContentHeader">
                      <h5>About KickTalk</h5>
                    </div>

                    <div className="settingsContentAboutAppContent">
                      <p>
                        We created this application because we felt the current solution Kick was offering couldn't meet the needs
                        of users who want more from their chatting experience. From multiple chatrooms to emotes and native Kick
                        functionality all in one place.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="settingsContentSection">
                  <div className="settingsAppDetailsSection">
                    <div className="settingsAppDetailsInfo">
                      <h5>Current Version:</h5>
                      <p>{appInfo?.appVersion}</p>
                    </div>
                    {/* <UpdateButton /> */}
                  </div>
                </div>
              </div>
            )}

            {activeSection === "general" && (
              <div className="settingsContentGeneral">
                <div className="settingsContentSection">
                  <div className="settingsSectionHeader">
                    <h4>General</h4>
                    <p>Select what general app settings you want to change.</p>
                  </div>

                  <div className="settingsItems">
                    <div className="settingsItem">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.general?.alwaysOnTop,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Always on Top</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Keep the KickTalk window always visible above other applications</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.general?.alwaysOnTop || false}
                          onCheckedChange={(checked) =>
                            changeSetting("general", {
                              ...settingsData?.general,
                              alwaysOnTop: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="settingsItem">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.general?.wrapChatroomsList,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Wrap Chatrooms List</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Allow chatroom tabs to wrap to multiple lines when there are many open</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.general?.wrapChatroomsList || false}
                          onCheckedChange={(checked) =>
                            changeSetting("general", {
                              ...settingsData?.general,
                              wrapChatroomsList: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="settingsItem">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.general?.showTabImages,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Show Tab Images</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Display streamer profile pictures in chatroom tabs</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.general?.showTabImages || false}
                          onCheckedChange={(checked) =>
                            changeSetting("general", {
                              ...settingsData?.general,
                              showTabImages: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="settingsItem extended">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.general?.showTimestamps,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Show Timestamps</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Display timestamps next to chat messages</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.general?.showTimestamps || false}
                          onCheckedChange={(checked) =>
                            changeSetting("general", {
                              ...settingsData?.general,
                              showTimestamps: checked,
                            })
                          }
                        />
                      </div>
                      <div
                        className={clsx("settingsTimestampFormat settingsExtendedItem", {
                          active: settingsData?.general?.showTimestamps,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Timestamp Format</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Choose how timestamps are displayed (12-hour vs 24-hour, with/without seconds)</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <select
                          disabled={!settingsData?.general?.showTimestamps}
                          className="timestampFormat"
                          value={settingsData?.general?.timestampFormat}
                          onChange={(e) =>
                            changeSetting("general", { ...settingsData?.general, timestampFormat: e.target.value })
                          }>
                          <option value="disabled">Disabled</option>
                          <option value="h:mm">h:mm</option>
                          <option value="hh:mm">hh:mm</option>
                          <option value="h:mm a">h:mm a</option>
                          <option value="hh:mm a">hh:mm a</option>
                          <option value="h:mm:ss">h:mm:ss</option>
                          <option value="hh:mm:ss">hh:mm:ss</option>
                          <option value="h:mm:ss a">h:mm:ss a</option>
                          <option value="hh:mm:ss a">hh:mm:ss a</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="settingsContentSection">
                  <div className="settingsSectionHeader">
                    <h4>Chatroom</h4>
                    <p>Select what chatroom settings you want to change.</p>
                  </div>

                  <div className="settingsItems">
                    <div className="settingsItem">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.chatrooms?.showModActions,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Show Mod Actions</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Display moderation actions (timeouts, bans, etc.) in chat</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.chatrooms?.showModActions || false}
                          onCheckedChange={(checked) =>
                            changeSetting("chatrooms", {
                              ...settingsData?.chatrooms,
                              showModActions: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="settingsContentSection">
                  <div className="settingsSectionHeader">
                    <h4>Cosmetics</h4>
                    <p>Select what cosmetics you want rendered in the chatrooms.</p>
                  </div>

                  <div className="settingsItems">
                    <div className="settingsItem">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.sevenTV?.emotes,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">7TV Emotes</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Enable 7TV emotes in chat messages and emote picker</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.sevenTV?.emotes || false}
                          onCheckedChange={(checked) =>
                            changeSetting("sevenTV", {
                              ...settingsData?.sevenTV,
                              emotes: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                    {/* <div className="settingsItem">
                    <div
                      className={clsx("settingSwitchItem", {
                        active: settingsData?.sevenTV?.paints,
                      })}>
                      <span className="settingsItemTitle">7TV Paints</span>

                      <Switch
                        checked={settingsData?.sevenTV?.paints || false}
                        onCheckedChange={(checked) =>
                          changeSetting("sevenTV", {
                            ...settingsData?.sevenTV,
                            paints: checked,
                          })
                        }
                      />
                    </div>
                  </div> */}
                    {/* <div className="settingsItem">
                    <div
                      className={clsx("settingSwitchItem", {
                        active: settingsData?.sevenTV?.badges,
                      })}>
                      <span className="settingsItemTitle">7TV Badges</span>

                      <Switch
                        checked={settingsData?.sevenTV?.badges || false}
                        onCheckedChange={(checked) =>
                          changeSetting("sevenTV", {
                            ...settingsData?.sevenTV,
                            badges: checked,
                          })
                        }
                      />
                    </div>
                  </div> */}
                  </div>
                </div>
                <div className="settingsContentSection">
                  <div className="settingsSectionHeader">
                    <h4>Notifications</h4>
                    <p>Select what notifications you want to receive.</p>
                  </div>

                  <div className="settingsItems">
                    <div className="settingsItem">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.notifications?.enabled,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Enable Notifications</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Enable desktop notifications when mentioned or highlighted phrases are detected</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.notifications?.enabled || false}
                          onCheckedChange={(checked) =>
                            changeSetting("notifications", {
                              ...settingsData?.notifications,
                              enabled: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="settingsItem extended">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.notifications?.sound,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Play Sound</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Play a sound when notifications are triggered</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.notifications?.sound || false}
                          onCheckedChange={(checked) =>
                            changeSetting("notifications", {
                              ...settingsData?.notifications,
                              sound: checked,
                            })
                          }
                        />
                      </div>

                      <div
                        className={clsx("settingSliderItem settingsExtendedItem", {
                          active: settingsData?.notifications?.sound,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Volume</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Adjust the volume level for notification sounds</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Slider
                          className="settingsSlider"
                          defaultValue={[settingsData?.notifications?.volume || 0.1]}
                          max={1}
                          min={0}
                          step={0.1}
                          disabled={!settingsData?.notifications?.sound}
                          showTooltip={true}
                          onValueChange={(value) => {
                            if (!value.length) return;
                            changeSetting("notifications", {
                              ...settingsData?.notifications,
                              volume: value[0],
                            });
                          }}
                        />
                      </div>
                    </div>

                    <div className="settingsItem extended">
                      <div
                        className={clsx("settingSwitchItem", {
                          active: settingsData?.notifications?.background,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Show Highlights</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Highlight messages containing your username or custom phrases with a background color</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Switch
                          checked={settingsData?.notifications?.background || false}
                          onCheckedChange={(checked) =>
                            changeSetting("notifications", {
                              ...settingsData?.notifications,
                              background: checked,
                            })
                          }
                        />
                      </div>

                      <div
                        className={clsx("settingSwitchItem settingsExtendedItem", {
                          active: settingsData?.notifications?.background,
                        })}>
                        <div className="settingsItemTitleWithInfo">
                          <span className="settingsItemTitle">Highlight Color</span>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <button className="settingsInfoIcon">
                                <img src={InfoIcon} width={14} height={14} alt="Info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Choose the background color for highlighted messages</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <ColorPicker
                          initialColor={settingsData?.notifications?.backgroundColour || "#000000"}
                          isColorPickerOpen={openColorPicker}
                          setIsColorPickerOpen={setOpenColorPicker}
                          handleColorChange={handleColorChange}
                          disabled={!settingsData?.notifications?.background}
                        />
                      </div>

                      <div
                        className={clsx("settingInputItem settingsExtendedItem", {
                          active: settingsData?.notifications?.background,
                        })}>
                        <div className="highlightPhrasesHeader">
                          <div className="settingsItemTitleWithInfo">
                            <span className="settingsItemTitle">Highlight Phrases</span>
                            <Tooltip delayDuration={100}>
                              <TooltipTrigger asChild>
                                <button className="settingsInfoIcon">
                                  <img src={InfoIcon} width={14} height={14} alt="Info" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Add custom words or phrases that will trigger highlights and notifications</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="highlightAddPhrase">
                            <input type="text" placeholder="Add new phrase..." onKeyDown={handleAddPhrase} />
                          </div>
                        </div>

                        <div className="highlightPhrases">
                          {settings?.notifications?.phrases.length > 0 ? (
                            <>
                              {settings?.notifications?.phrases.map((phrase) => (
                                <div
                                  key={phrase}
                                  onMouseDown={(e) => {
                                    if (e.button === 1) {
                                      changeSetting("notifications", {
                                        ...settings?.notifications,
                                        phrases: settings?.notifications?.phrases.filter((p) => p !== phrase),
                                      });
                                    }
                                  }}
                                  className="highlightPhrase"
                                  title={phrase}>
                                  <span>{phrase}</span>
                                  <button
                                    onClick={() => {
                                      changeSetting("notifications", {
                                        ...settings?.notifications,
                                        phrases: settings?.notifications?.phrases.filter((p) => p !== phrase),
                                      });
                                    }}>
                                    &times;
                                  </button>
                                </div>
                              ))}
                            </>
                          ) : (
                            <p>No highlight phrases added.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Settings;
