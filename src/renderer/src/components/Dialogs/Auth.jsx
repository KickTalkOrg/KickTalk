import React from "react";
import "../../assets/styles/components/Dialogs/AuthDialog.scss";
import GoogleIcon from "../../assets/logos/googleLogo.svg?asset";
import AppleIcon from "../../assets/logos/appleLogo.svg?asset";
import KickIconIcon from "../../assets/logos/kickLogoIcon.svg?asset";
import GhostIcon from "../../assets/icons/ghost-fill.svg?asset";
const Auth = () => {
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
        Sign in with your <br /> Kick account
      </div>
      <div className="authLoginOptions">
        <div className="authLoginOption">
          <p>Use username and password for login? Continue to Kick.com</p>
          <button className="authLoginButton kick" onClick={() => handleAuthLogin("kick")}>
            Login with Kick
            <img src={KickIconIcon} height="16px" className="icon" alt="Kick" />
          </button>
        </div>
        <div className="authLoginOption">
          <p>Already have a Kick account with Google or Apple login?</p>
          <button className="authLoginButton google" onClick={() => handleAuthLogin("google")}>
            Login with Google
            <img src={GoogleIcon} className="icon" alt="Google" />
          </button>
          <button className="authLoginButton apple" onClick={() => handleAuthLogin("apple")}>
            Login with Apple
            <img src={AppleIcon} className="icon" alt="Apple" />
          </button>
        </div>
        <div className="authLoginOption">
          <button className="authAnonymousButton" onClick={() => handleAuthLogin("anonymous")}>
            Continue anonymous
            <img src={GhostIcon} width={20} height={20} alt="Ghost" />
          </button>
        </div>
      </div>
      <p className="authDisclaimer">
        <strong>Disclaimer:</strong> We do <strong>NOT</strong> save any emails or passwords.
      </p>
    </div>
  );
};

export default Auth;
