import React, { useState, useCallback, useEffect } from "react";
import { Switch } from "../../../Shared/Switch";
import { Slider } from "../../../Shared/Slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../Shared/Tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../Shared/Dropdown";
import InfoIcon from "../../../../assets/icons/info-fill.svg?asset";
import CaretDownIcon from "../../../../assets/icons/caret-down-fill.svg?asset";
import ColorPicker from "../../../Shared/ColorPicker";
import folderOpenIcon from "../../../../assets/icons/folder-open-fill.svg?asset";
import playIcon from "../../../../assets/icons/play-fill.svg?asset";
import NotificationFilePicker from "../../../Shared/NotificationFilePicker";
import clsx from "clsx";

const GeneralSection = ({ settingsData, onChange }) => {
  return (
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
                  onChange("general", {
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
                active: settingsData?.general?.autoUpdate !== false,
              })}>
              <div className="settingsItemTitleWithInfo">
                <span className="settingsItemTitle">Auto Update</span>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button className="settingsInfoIcon">
                      <img src={InfoIcon} width={14} height={14} alt="Info" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Automatically check for and download KickTalk updates on startup</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <Switch
                checked={settingsData?.general?.autoUpdate !== false}
                onCheckedChange={(checked) =>
                  onChange("general", {
                    ...settingsData?.general,
                    autoUpdate: checked,
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
                  onChange("general", {
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
                active: settingsData?.general?.compactChatroomsList,
              })}
            >
              <div className="settingsItemTitleWithInfo">
                <span className="settingsItemTitle">Compact Chatroom List</span>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button className="settingsInfoIcon">
                      <img src={InfoIcon} width={14} height={14} alt="Info" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Display chatroom tabs in a more compact layout to save
                      space
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <Switch
                checked={settingsData?.general?.compactChatroomsList || false}
                onCheckedChange={(checked) =>
                  onChange("general", {
                    ...settingsData?.general,
                    compactChatroomsList: checked,
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
                  onChange("general", {
                    ...settingsData?.general,
                    showTabImages: checked,
                  })
                }
              />
            </div>
          </div>
          <div className="settingsItem">
            <div
              className={clsx("settingSwitchItem", {
                active: settingsData?.general?.timestampFormat !== "disabled",
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
                    <p>Display timestamps next to chat messages (12-hour vs 24-hour, with/without seconds)</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <DropdownMenu value={settingsData?.general?.timestampFormat}>
                <DropdownMenuTrigger asChild>
                  <button className="timestampFormat">
                    {settingsData?.general?.timestampFormat === "disabled" ? "Disabled" : settingsData?.general?.timestampFormat}
                    <img src={CaretDownIcon} width={14} height={14} alt="Chevron" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom">
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "disabled" })}
                    value="disabled">
                    Disabled
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "h:mm" })}
                    value="h:mm">
                    h:mm
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "hh:mm" })}
                    value="hh:mm">
                    hh:mm
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "h:mm a" })}
                    value="h:mm a">
                    h:mm a
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "hh:mm a" })}
                    value="hh:mm a">
                    hh:mm a
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "h:mm:ss" })}
                    value="h:mm:ss">
                    h:mm:ss
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "hh:mm:ss" })}
                    value="hh:mm:ss">
                    hh:mm:ss
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "h:mm:ss a" })}
                    value="h:mm:ss a">
                    h:mm:ss a
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("general", { ...settingsData?.general, timestampFormat: "hh:mm:ss a" })}
                    value="hh:mm:ss a">
                    hh:mm:ss a
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="settingsItem">
            <div
              className={clsx("settingSwitchItem", {
                active: settingsData?.customTheme?.current !== "default",
              })}>
              <div className="settingsItemTitleWithInfo">
                <span className="settingsItemTitle">Theme</span>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button className="settingsInfoIcon">
                      <img src={InfoIcon} width={14} height={14} alt="Info" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select the theme you want to use for the app</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <DropdownMenu value={settingsData?.customTheme?.current || "default"}>
                <DropdownMenuTrigger asChild>
                  <button className="timestampFormat">
                    {settingsData?.customTheme?.current === "default"
                      ? "Default"
                      : settingsData?.customTheme?.current.charAt(0).toUpperCase() + settingsData?.customTheme?.current.slice(1)}
                    <img src={CaretDownIcon} width={14} height={14} alt="Chevron" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom">
                  <DropdownMenuItem
                    onClick={() => onChange("customTheme", { ...settingsData?.customTheme, current: "default" })}
                    value="default">
                    Default
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("customTheme", { ...settingsData?.customTheme, current: "dark" })}
                    value="dark">
                    Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("customTheme", { ...settingsData?.customTheme, current: "blue" })}
                    value="blue">
                    Blue
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("customTheme", { ...settingsData?.customTheme, current: "purple" })}
                    value="purple">
                    Purple
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChange("customTheme", { ...settingsData?.customTheme, current: "red" })}
                    value="red">
                    Red
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChatroomSection = ({ settingsData, onChange }) => {
  return (
    <div className="settingsContentSection">
      <div className="settingsSectionHeader">
        <h4>Chatroom</h4>
        <p>Select what chatroom settings you want to change.</p>
      </div>

      <div className="settingsItems">
        <div className="settingsItem">
          <div
            className={clsx("settingSwitchItem", {
              active: settingsData?.chatrooms?.batching,
            })}>
            <div className="settingsItemTitleWithInfo">
              <span className="settingsItemTitle">Enable Batching</span>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button className="settingsInfoIcon">
                    <img src={InfoIcon} width={14} height={14} alt="Info" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Enable <b>Visual</b> batching of messages. This means that messages will be displayed in a batch, rather than
                    one by one.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            <Switch
              checked={settingsData?.chatrooms?.batching || false}
              onCheckedChange={(checked) =>
                onChange("chatrooms", {
                  ...settingsData?.chatrooms,
                  batching: checked,
                })
              }
            />
          </div>
        </div>
        <div className="settingsItem">
          <div
            className={clsx("settingSwitchItem", {
              active: settingsData?.chatrooms?.batching,
            })}>
            <div className="settingsItemTitleWithInfo">
              <span className="settingsItemTitle">Batching Interval</span>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button className="settingsInfoIcon">
                    <img src={InfoIcon} width={14} height={14} alt="Info" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>The interval at which the chatroom will batch messages (in milliseconds)</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <Slider
              className="settingsSlider"
              defaultValue={[settingsData?.chatrooms?.batchingInterval || 0]}
              max={1000}
              min={0}
              step={100}
              disabled={!settingsData?.chatrooms?.batching}
              showTooltip={true}
              onValueChange={(value) => {
                if (!value.length) return;
                onChange("chatrooms", { ...settingsData?.chatrooms, batchingInterval: value[0] });
              }}
            />
          </div>
        </div>
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
                onChange("chatrooms", {
                  ...settingsData?.chatrooms,
                  showModActions: checked,
                })
              }
            />
          </div>
        </div>
        <div className="settingsItem">
          <div
            className={clsx("settingSwitchItem", {
              active: settingsData?.chatrooms?.showInfoBar,
            })}>
            <div className="settingsItemTitleWithInfo">
              <span className="settingsItemTitle">Show Chat Mode Info Bar</span>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button className="settingsInfoIcon">
                    <img src={InfoIcon} width={14} height={14} alt="Info" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Display the info bar above chat input showing current chat modes (emote only, followers only, etc.)</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <Switch
              checked={settingsData?.chatrooms?.showInfoBar || false}
              onCheckedChange={(checked) =>
                onChange("chatrooms", {
                  ...settingsData?.chatrooms,
                  showInfoBar: checked,
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const CosmeticsSection = ({ settingsData, onChange }) => {
  return (
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
                onChange("sevenTV", {
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
  );
};

const NotificationsSection = ({ settingsData, onChange }) => {
  const [openColorPicker, setOpenColorPicker] = useState(false);

  const handleColorChange = useCallback(
    (color) => {
      onChange("notifications", {
        ...settingsData?.notifications,
        backgroundRgba: color,
      });
    },
    [settingsData, onChange],
  );

  const handleAddPhrase = useCallback(
    (e) => {
      const value = e.target.value.trim();
      if (settingsData?.notifications?.phrases.includes(value)) return;
      if (e.key === "Enter" && value.length > 0) {
        onChange("notifications", {
          ...settingsData?.notifications,
          phrases: [...settingsData?.notifications?.phrases, value],
        });
        e.target.value = "";
      }
    },
    [settingsData?.notifications?.phrases, onChange],
  );

  const getNotificationFiles = useCallback(async () => {
    const files = await window.app.notificationSounds.getAvailable();
    return files;
  }, []);

  return (
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
                onChange("notifications", {
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
                onChange("notifications", {
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
                onChange("notifications", {
                  ...settingsData?.notifications,
                  volume: value[0],
                });
              }}
            />
          </div>
          <div
            className={clsx("settingSliderItem settingsExtendedItem", {
              active: settingsData?.notifications?.sound,
            })}>
            <div className="settingsItemTitleWithInfo">
              <span className="settingsItemTitle">Upload Sound</span>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button className="settingsInfoIcon">
                    <img src={InfoIcon} width={14} height={14} alt="Info" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload a custom sound file to play when notifications are triggered (mp3 or wav)</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <button
              className="soundFileName"
              disabled={!settingsData?.notifications?.sound}
              onClick={() => window.app.notificationSounds.openFolder()}>
              Select File <img src={folderOpenIcon} width={14} height={14} alt="Caret Down" />
            </button>
          </div>
          <div
            className={clsx("settingSliderItem settingsExtendedItem", {
              active: settingsData?.notifications?.sound,
            })}>
            <div className="settingsItemTitleWithInfo">
              <span className="settingsItemTitle">Sound File</span>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button className="settingsInfoIcon">
                    <img src={InfoIcon} width={14} height={14} alt="Info" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Select the sound file to play when notifications are triggered</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <NotificationFilePicker
              disabled={!settingsData?.notifications?.sound}
              getOptions={getNotificationFiles}
              onChange={onChange}
              settingsData={settingsData}
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
                onChange("notifications", {
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
              initialColor={settingsData?.notifications?.backgroundRgba || { r: 255, g: 255, b: 0, a: 0.5 }}
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
              {settingsData?.notifications?.phrases.length > 0 ? (
                <>
                  {settingsData?.notifications?.phrases.map((phrase) => (
                    <div
                      key={phrase}
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          onChange("notifications", {
                            ...settingsData?.notifications,
                            phrases: settingsData?.notifications?.phrases.filter((p) => p !== phrase),
                          });
                        }
                      }}
                      className="highlightPhrase"
                      title={phrase}>
                      <span>{phrase}</span>
                      <button
                        onClick={() => {
                          onChange("notifications", {
                            ...settingsData?.notifications,
                            phrases: settingsData?.notifications?.phrases.filter((p) => p !== phrase),
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
  );
};

export { GeneralSection, ChatroomSection, CosmeticsSection, NotificationsSection };
