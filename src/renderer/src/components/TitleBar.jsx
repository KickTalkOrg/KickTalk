import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import Minus from "../assets/icons/minus-bold.svg?asset";
import Square from "../assets/icons/square-bold.svg?asset";
import X from "../assets/icons/x-bold.svg?asset";
import GearIcon from "../assets/icons/gear-fill.svg?asset";

import "../assets/styles/components/TitleBar.scss";
import clsx from "clsx";
import Updater from "./Updater";

const TitleBar = () => {
  const { t } = useTranslation();
  const [userData, setUserData] = useState(null);
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
        console.error("[TitleBar]: Failed to fetch user data:", error);
      }
    };

    getAppInfo();
    fetchUserData();
  }, []);

  const handleAuthBtn = useCallback((e) => {
    const cords = [e.clientX, e.clientY];

    window.app.authDialog.open({ cords });
  }, []);

  return (
    <div className="titleBar">
      <div className="titleBarLeft">
        <span>KickTalk {appInfo.appVersion}</span>
      </div>

      <div className="titleBarSettings">
        {userData?.id ? (
          <button
            className="titleBarSettingsBtn"
            onClick={() =>
              window.app.settingsDialog.open({
                userData,
              })
            }>
            <span className="titleBarUsername">{userData?.username || t('titleBar.loading')}</span>
            <div className="titleBarDivider" />
            <img className="titleBarSettingsIcon" src={GearIcon} width={16} height={16} alt={t('titleBar.settings')} />
          </button>
        ) : (
          <div className="titleBarLoginBtn">
            <button className="titleBarSignInBtn" onClick={handleAuthBtn}>
              {t('auth.signIn')}
            </button>
            <div className="titleBarDivider" />
            <button
              className="titleBarSettingsBtn"
              onClick={() =>
                window.app.settingsDialog.open({
                  userData,
                })
              }>
              <img src={GearIcon} width={16} height={16} alt={t('titleBar.settings')} />
            </button>
          </div>
        )}
      </div>

      <Updater />

      <div className="titleBarRight">
        <div className="titleBarControls">
          <button className="minimize" onClick={() => window.app.minimize()}>
            <img src={Minus} width={12} height={12} alt={t('titleBar.minimize')} />
          </button>
          <button className="maximize" onClick={() => window.app.maximize()}>
            <img src={Square} width={12} height={12} alt={t('titleBar.maximize')} />
          </button>
          <button className="close" onClick={() => window.app.close()}>
            <img src={X} width={14} height={14} alt={t('titleBar.close')} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
