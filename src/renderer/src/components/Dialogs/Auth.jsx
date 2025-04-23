import React from "react";
import "../../assets/styles/components/Dialogs/AuthDialog.css";
import KickIcon from "../../assets/icons/kickLogo.svg";
import GoogleIcon from "../../assets/icons/googleLogo.svg";
import AppleIcon from "../../assets/icons/appleLogo.svg";
import { Ghost } from "@phosphor-icons/react";
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
            Login with Kick <img src={KickIcon} className="icon" alt="Kick" />
          </button>
        </div>
        <div className="authLoginOption">
          <p>Already have a Kick account with Google or Apple login?</p>
          <button className="authLoginButton google" onClick={() => handleAuthLogin("google")}>
            Login with Google <img src={GoogleIcon} className="icon" alt="Google" />
          </button>
          <button className="authLoginButton apple" onClick={() => handleAuthLogin("apple")}>
            Login with Apple <img src={AppleIcon} className="icon" alt="Apple" />
          </button>
        </div>
        <div className="authLoginOption">
          <button className="authAnonymousButton" onClick={() => handleAuthLogin("anonymous")}>
            Continue anonymous <Ghost size={20} weight="fill" />
          </button>
        </div>
      </div>
      <p className="authDisclaimer">
        <strong>Disclaimer:</strong> We do <strong>NOT</strong> save any emails or passwords. Your privacy is our priority.
      </p>
    </div>
  );
};

export default Auth;
