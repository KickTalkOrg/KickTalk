import React, { useEffect, useState } from "react";
import "@assets/styles/loader.css";
import Klogo from "@assets/icons/K.svg";
import clsx from "clsx";

const Loader = ({ onFinish }) => {
  const [showText, setShowText] = useState(false);
  const [hideLoader, setHideLoader] = useState(false);
  const [appVersion, setAppVersion] = useState(null);

  useEffect(() => {
    const getAppInfo = async () => {
      const appInfo = await window.app.getAppInfo();
      setAppVersion(appInfo.appVersion);
    };

    getAppInfo();
  }, []);

  useEffect(() => {
    const textTimer = setTimeout(() => setShowText(true), 100);
    const finishTimer = setTimeout(() => {
      setHideLoader(true);
      setTimeout(onFinish, 1000);
    }, 1500);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div className={clsx("loaderContainer", hideLoader && "slideUp")}>
      <div className={clsx("logoWrapper", hideLoader && "logoWrapperFadeOut")}>
        <img src={Klogo} alt="Loader Logo" width={200} height={200} className="logoImage" />
      </div>
      {showText && (
        <div className="textContainer">
          <p className="creatorText">
            Created by <span>DRKNESS</span> and <span>ftk789</span>
          </p>
          {appVersion && <p className="appVersion">v{appVersion}</p>}
        </div>
      )}
    </div>
  );
};

export default Loader;
