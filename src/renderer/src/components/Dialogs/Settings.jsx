import clsx from "clsx";
import "../../assets/styles/dialogs/Settings.scss";
import X from "../../assets/icons/x-bold.svg?asset";
import { useEffect, useState } from "react";
import Check from "../../assets/icons/check-bold.svg?asset";
import SignOut from "../../assets/icons/sign-out-bold.svg?asset";
import ColorPicker from "../Settings/ColorPicker";
import { useSettings } from "../../providers/SettingsProvider";

const Settings = () => {
  const [activeSection, setActiveSection] = useState("general");
  const [openColorPicker, setOpenColorPicker] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    window.app.store.get("settings").then((settings) => {
      setSettings(settings);
    });
  }, []);

  const changeSetting = async (key, value) => {
    try {
      await updateSettings(key, value);
    } catch (error) {
      console.error("Failed to save setting:", error);
    }
  };

  const handleLogout = () => {
    window.app.logout();
  };

  return (
    <div className="settingsDialogWrapper">
      <div className="settingsDialogHeader">
        <h2>Settings</h2>

        <button className="settingsDialogCloseBtn" onClick={() => window.app.settingsDialog.close()}>
          <img src={X} width={16} height={16} alt="Close" />
        </button>
      </div>
      <div className="settingsDialogContainer">
        <div className="settingsMenu">
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
                Theme
              </button>
              <button
                disabled
                className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "chat" })}
                onClick={() => setActiveSection("chat")}>
                Theme
              </button>
            </div>
          </div>
        </div>

        <div className="settingsContent">
          {activeSection === "general" && (
            <div className="settingsContentGeneral">
              <div className="settingsContentSection">
                <div className="settingsSectionHeader">
                  <h4>Emotes</h4>
                  <p>Select what emotes you want rendered in the chatrooms.</p>
                </div>

                <div className="settingsItem">
                  <button
                    className="settingSwitchItem"
                    onClick={() => changeSetting("sevenTV", { ...settings?.sevenTV, emotes: !settings?.sevenTV?.emotes })}>
                    <div className="checkBox">
                      <img src={Check} width={14} height={14} alt="Check" />
                    </div>
                    <span>7TV Emotes</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
