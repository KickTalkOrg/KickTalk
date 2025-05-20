import "../../assets/styles/components/Settings.scss";
import { useState, useRef, useCallback } from "react";
import clsx from "clsx";
import SignOut from "../../assets/icons/sign-out-bold.svg?asset";
import Check from "../../assets/icons/check-bold.svg?asset";
import { useSettings } from "../../providers/SettingsProvider";
import ColorPicker from "./ColorPicker";
import useClickOutside from "../../utils/useClickOutside";

const Settings = ({ settingsModalOpen, setSettingsModalOpen, appInfo }) => {
  const { settings, updateSettings } = useSettings();
  const [openColorPicker, setOpenColorPicker] = useState(false);

  const handleLogout = () => {
    window.app.logout();
  };

  const changeSetting = async (key, value) => {
    try {
      await updateSettings(key, value);
    } catch (error) {
      console.error("[Settings]: Failed to save setting:", error);
    }
  };

  const handleColorChange = useCallback(
    (color) => {
      changeSetting("notifications", {
        ...settings?.notifications,
        backgroundColour: color,
      });
    },
    [settings, changeSetting],
  );

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

  const settingsModalRef = useRef(null);
  useClickOutside(settingsModalRef, () => setSettingsModalOpen(false));

  return (
    <div className={clsx("settingsWrapper", settingsModalOpen && "show")} ref={settingsModalRef}>
      <div className="settingsHead">
        <h4>Settings</h4>
        <button onClick={handleLogout} className="settingsLogoutButton">
          <img src={SignOut} width={20} height={20} alt="Sign Out" />
        </button>
      </div>

      <span className="settingsDivider" />

      <div className="settingsSection settingsCosmetics">
        <h5>Emotes & Badges</h5>

        <div className="settingOptions cosmeticsSettingsOptions">
          <div className="settingItem cosmeticsSetting">
            <button
              className={clsx("settingSwitchItem", settings?.sevenTV?.emotes ? "checked" : "")}
              onClick={() => {
                changeSetting("sevenTV", { ...settings?.sevenTV, emotes: !settings?.sevenTV?.emotes });
              }}>
              <div className="checkBox">
                <img src={Check} width={14} height={14} alt="Check" />
              </div>
              <span>7TV Emotes</span>
            </button>
          </div>
        </div>
      </div>

      <span className="settingsDivider" />

      <div className="settingsSection notifications">
        <h5>Notifications</h5>

        <div className="settingOptions notificationOptions">
          <div className="settingItem notificationSetting">
            <button
              className={clsx("settingSwitchItem", settings?.notifications?.enabled ? "checked" : "")}
              onClick={() =>
                changeSetting("notifications", { ...settings?.notifications, enabled: !settings?.notifications?.enabled })
              }>
              <div className="checkBox">
                <img src={Check} width={14} height={14} alt="Check" />
              </div>
              <span>Enable Notifications</span>
            </button>
          </div>
          <div className="settingItem notificationSetting">
            <button
              className={clsx("settingSwitchItem", settings?.notifications?.sound ? "checked" : "")}
              onClick={() =>
                changeSetting("notifications", { ...settings?.notifications, sound: !settings?.notifications?.sound })
              }>
              <div className="checkBox">
                <img src={Check} width={14} height={14} alt="Check" />
              </div>
              <span>Notification Sound</span>
            </button>
          </div>
          <div className="settingItem notificationSetting">
            <button
              className={clsx("settingSwitchItem", settings?.notifications?.background ? "checked" : "")}
              onClick={() =>
                changeSetting("notifications", { ...settings?.notifications, background: !settings?.notifications?.background })
              }>
              <div className="checkBox">
                <img src={Check} width={14} height={14} alt="Check" />
              </div>
              <span>Background Notifications</span>
            </button>
          </div>

          <span className="miniDivider" />

          <div className="settingItem notificationSetting">
            <ColorPicker
              initialColor={settings?.notifications?.backgroundColour || "#000000"}
              isColorPickerOpen={openColorPicker}
              setIsColorPickerOpen={setOpenColorPicker}
              handleColorChange={handleColorChange}
            />
          </div>
        </div>
      </div>

      <span className="settingsDivider" />

      <div className="settingsSection generalSettings">
        <h5>General Settings</h5>

        <div className="settingItem">
          <button
            className={clsx("settingSwitchItem", settings?.general?.alwaysOnTop ? "checked" : "")}
            onClick={() => changeSetting("general", { ...settings?.general, alwaysOnTop: !settings?.general?.alwaysOnTop })}>
            <div className="checkBox">
              <img src={Check} width={14} height={14} alt="Check" />
            </div>
            <span>Always On Top</span>
          </button>
        </div>

        <div className="settingItem">
          <button
            className={clsx("settingSwitchItem", settings?.general?.wrapChatroomsList ? "checked" : "")}
            onClick={() =>
              changeSetting("general", { ...settings?.general, wrapChatroomsList: !settings?.general?.wrapChatroomsList })
            }>
            <div className="checkBox">
              <img src={Check} width={14} height={14} alt="Check" />
            </div>
            <span>Wrap Chatrooms List</span>
          </button>
        </div>

        <div className="settingItem">
          <button
            className={clsx("settingSwitchItem", settings?.general?.showTimestamps ? "checked" : "")}
            onClick={() =>
              changeSetting("general", { ...settings?.general, showTimestamps: !settings?.general?.showTimestamps })
            }>
            <div className="checkBox">
              <img src={Check} width={14} height={14} alt="Check" />
            </div>
            <span>Show Timestamps</span>
          </button>
        </div>

        <div className="settingItem timestampFormat">
          <span>Timestamp Format</span>
          <select
            value={settings?.general?.timestampFormat}
            onChange={(e) => changeSetting("general", { ...settings?.general, timestampFormat: e.target.value })}>
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

        <div className="settingItem">
          <button
            className={clsx("settingSwitchItem", settings?.general?.showTabImages ? "checked" : "")}
            onClick={() => changeSetting("general", { ...settings?.general, showTabImages: !settings?.general?.showTabImages })}>
            <div className="checkBox">
              <img src={Check} width={14} height={14} alt="Check" />
            </div>
            <span>Show Tab Images</span>
          </button>
        </div>
      </div>

      <span className="settingsDivider" />

      <div className="settingsSection notificationPhrases">
        <h5>Highlight Phrases</h5>

        <div className="highlightPhrases">
          {settings?.notifications?.phrases.map((phrase) => (
            <div key={phrase} className="highlightPhrase" title={phrase}>
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
        </div>

        <div className="highlightAddPhrase">
          <input type="text" placeholder="Add new phrase..." onKeyDown={handleAddPhrase} />
        </div>
      </div>

      <div className="aboutDevelopers">
        <span>Designed & Developed by:</span>

        <div className="aboutDevelopersList">
          <div className="aboutDeveloper">
            <a href="https://x.com/drkerco/" target="_blank" rel="noopener noreferrer">
              dark
            </a>
          </div>
          <div className="aboutDeveloper">
            <a href="https://x.com/ftk789YT/" target="_blank" rel="noopener noreferrer">
              ftk789
            </a>
          </div>
        </div>

        <div className="aboutAppInfo">
          <span>Version: {appInfo.appVersion}</span>
        </div>
      </div>
    </div>
  );
};

export default Settings;
