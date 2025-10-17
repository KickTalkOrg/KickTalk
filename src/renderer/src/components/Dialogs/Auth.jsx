import React from "react";
import { useTranslation } from "react-i18next";
import "../../assets/styles/dialogs/AuthDialog.scss";
import GoogleIcon from "../../assets/logos/googleLogo.svg?asset";
import AppleIcon from "../../assets/logos/appleLogo.svg?asset";
import KickIconIcon from "../../assets/logos/kickLogoIcon.svg?asset";
import GhostIcon from "../../assets/icons/ghost-fill.svg?asset";

const Auth = () => {
  const { t } = useTranslation();
  const handleAuthLogin = (type) => {
    switch (type) {
      case "kick":
        window.app.authDialog.auth({ type: "kick" });
        break;
      case "google":
        window.app.authDialog.auth({ type: "google" });
        break;
      case "apple":
        window.app.authDialog.auth({ type: "apple" });
        break;
      case "anonymous":
        window.app.authDialog.close();
        break;
      default:
        console.log("[Auth Login]: Invalid action requested");
    }
  };
  return (
    <div className="authLoginContainer">
      <div className="authLoginHeader">
        {t('auth.signInWithKick')}
      </div>
      <div className="authLoginOptions">
        <div className="authLoginOption">
          <p>{t('auth.kickLoginDescription')}</p>
          <button className="authLoginButton kick" onClick={() => handleAuthLogin("kick")}>
            {t('auth.loginWithKick')}
            <img src={KickIconIcon} height="16px" className="icon" alt="Kick" />
          </button>
        </div>
        <div className="authLoginOption">
          <p>{t('auth.googleAppleDescription')}</p>
          <button className="authLoginButton google" onClick={() => handleAuthLogin("google")}>
            {t('auth.loginWithGoogle')}
            <img src={GoogleIcon} className="icon" alt="Google" />
          </button>
          <button className="authLoginButton apple" onClick={() => handleAuthLogin("apple")}>
            {t('auth.loginWithApple')}
            <img src={AppleIcon} className="icon" alt="Apple" />
          </button>
        </div>
        <div className="authLoginOption">
          <button className="authAnonymousButton" onClick={() => handleAuthLogin("anonymous")}>
            {t('auth.continueAnonymous')}
            <img src={GhostIcon} width={20} height={20} alt="Ghost" />
          </button>
        </div>
      </div>
      <p className="authDisclaimer">
        <strong>Disclaimer:</strong> {t('auth.disclaimer')}
      </p>
    </div>
  );
};

export default Auth;
