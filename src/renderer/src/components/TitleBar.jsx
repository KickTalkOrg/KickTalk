import { useState, useEffect } from "react";

import CaretDown from "../assets/icons/caret-down-bold.svg?asset";
import Minus from "../assets/icons/minus-bold.svg?asset";
import Square from "../assets/icons/square-bold.svg?asset";
import X from "../assets/icons/x-bold.svg?asset";

import "../assets/styles/components/TitleBar.scss";
import Settings from "./Settings/Settings";
import clsx from "clsx";
import Updater from "./Updater";

const TitleBar = () => {
  const [userData, setUserData] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [appInfo, setAppInfo] = useState({});

  useEffect(() => {
    const getAppInfo = async () => {
      const appInfo = await window.app.getAppInfo();
      setAppInfo(appInfo);
    };

    const fetchUserData = async () => {
      try {
        const data = await window.app.kick.getSelfInfo();
        const kickId = localStorage.getItem("kickId");

        if (!kickId && data?.id) {
          localStorage.setItem("kickId", data.id);
        }

        setUserData(data);
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    getAppInfo();
    fetchUserData();
  }, []);

  const handleAuthBtn = (e) => {
    const cords = [e.clientX, e.clientY];

    window.app.authDialog.open({ cords });
  };

  return (
    <div className="titleBar">
      <div className="titleBarLeft">
        <span>KickTalk {appInfo.appVersion}</span>
      </div>

      <div className={clsx("titleBarSettings", settingsModalOpen && "open")}>
        {userData?.id ? (
          <button className="titleBarSettingsBtn" onClick={() => setSettingsModalOpen(!settingsModalOpen)}>
            <span className="titleBarUsername">{userData?.username || "Loading..."}</span>
            <img src={CaretDown} width={14} height={14} alt="Caret Down" />
          </button>
        ) : (
          <button className="titleBarLoginBtn" onClick={handleAuthBtn}>
            Sign In
          </button>
        )}

        <Settings settingsModalOpen={settingsModalOpen} setSettingsModalOpen={setSettingsModalOpen} appInfo={appInfo} />
      </div>

      <Updater />

      <div className="titleBarRight">
        <div className="titleBarControls">
          <button className="minimize" onClick={() => window.app.minimize()}>
            <img src={Minus} width={14} height={14} alt="Minimize" />
          </button>
          <button className="maximize" onClick={() => window.app.maximize()}>
            <img src={Square} width={14} height={14} alt="Maximize" />
          </button>
          <button className="close" onClick={() => window.app.close()}>
            <img src={X} width={16} height={16} alt="Close" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
