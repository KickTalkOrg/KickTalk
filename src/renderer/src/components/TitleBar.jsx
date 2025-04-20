import { useState, useEffect } from "react";
import { CaretDown, Minus, Square, X } from "@phosphor-icons/react";
import "../assets/styles/components/TitleBar.css";
import Settings from "./Settings";
import clsx from "clsx";

const TitleBar = () => {
  const [userData, setUserData] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const data = await window.app.kick.getSelfInfo();
        setUserData(data);
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUserData();
  }, []);

  const handleAuthBtn = (e) => {
    const cords = [e.clientX, e.clientY];

    window.app.authDialog.open({ cords });
  };

  return (
    <div className="titleBar">
      <div className="titleBarLeft">
        <span>KickTalk 0.0.1</span>
      </div>

      <div className={clsx("titleBarSettings", settingsModalOpen && "open")}>
        {userData?.id ? (
          <button className="titleBarSettingsBtn" onClick={() => setSettingsModalOpen(!settingsModalOpen)}>
            <span className="titleBarUsername">{userData?.username || "Loading..."}</span>
            <CaretDown weight={"bold"} size={14} />
          </button>
        ) : (
          <button className="titleBarLoginBtn" onClick={handleAuthBtn}>
            Sign In
          </button>
        )}

        <Settings settingsModalOpen={settingsModalOpen} />
      </div>

      <div className="titleBarRight">
        <div className="titleBarControls">
          <button className="minimize" onClick={() => window.app.minimize()}>
            <Minus weight={"bold"} size={14} />
          </button>
          <button className="maximize" onClick={() => window.app.maximize()}>
            <Square weight={"bold"} size={14} />
          </button>
          <button className="close" onClick={() => window.app.close()}>
            <X weight={"bold"} size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
