import "../../../assets/styles/dialogs/Settings.scss";
import { useEffect, useState } from "react";
import { useSettings } from "../../../providers/SettingsProvider";

import { TooltipProvider } from "../../Shared/Tooltip";
import { GeneralSection, ChatroomSection, NotificationsSection, CosmeticsSection, ExternalPlayersSection } from "./Sections/General";
import SettingsHeader from "./SettingsHeader";
import SettingsMenu from "./SettingsMenu";
import AboutSection from "./Sections/About";
import { ModerationSection } from "./Sections/Moderation";

const Settings = () => {
  const { updateSettings, settings } = useSettings();
  const [activeSection, setActiveSection] = useState("general");
  const [settingsData, setSettingsData] = useState(null);
  const [appInfo, setAppInfo] = useState(null);

  useEffect(() => {
    const getAppInfo = async () => {
      const info = await window.app.getAppInfo();
      setAppInfo(info);
    };
    getAppInfo();
  }, []);

  useEffect(() => {
    const handleDialogData = (data) => {
      if (JSON.stringify(data?.settings) !== JSON.stringify(settingsData)) {
        setSettingsData(data?.settings);
      }
    };

    const cleanupUserData = window.app.settingsDialog.onData(handleDialogData);
    return () => {
      cleanupUserData();
    };
  }, [settingsData]);

  useEffect(() => {
    if (settings && JSON.stringify(settings) !== JSON.stringify(settingsData)) {
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

  const handleLogout = () => {
    window.app.logout();
  };

  return (
    <TooltipProvider>
      <div className="settingsDialogWrapper">
        <SettingsHeader onClose={() => window.app.settingsDialog.close()} appInfo={appInfo} />

        <div className="settingsDialogContainer">
          <SettingsMenu activeSection={activeSection} setActiveSection={setActiveSection} onLogout={handleLogout} />

          <div className="settingsContent">
            {activeSection === "info" && <AboutSection appInfo={appInfo} />}
            {activeSection === "general" && (
              <>
                <GeneralSection settingsData={settingsData} onChange={changeSetting} />
                <ChatroomSection settingsData={settingsData} onChange={changeSetting} />
                <CosmeticsSection settingsData={settingsData} onChange={changeSetting} />
                <NotificationsSection settingsData={settingsData} onChange={changeSetting} />
              </>
            )}
            {activeSection === "externalPlayers" && (
              <>
                <ExternalPlayersSection settingsData={settingsData} onChange={changeSetting} />
              </>
            )}
            {activeSection === "moderation" && (
              <>
                <ModerationSection settingsData={settingsData} onChange={changeSetting} />
              </>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Settings;
