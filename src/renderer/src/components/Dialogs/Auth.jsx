import React from "react";
import "../../assets/styles/components/Dialogs/AuthDialog.css";
import KickIcon from "../../assets/icons/brand-kick.svg";
import GoogleIcon from "../../assets/icons/google-logo.svg";
import AppleIcon from "../../assets/icons/apple-logo.svg";
import GhostIcon from "../../assets/icons/ghost.svg";

const Auth = () => {
  const handleButtonClick = (type) => {
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
        console.log("Unknown action");
    }
  };
  return (
    <div className="login-container">
      <h1>Sign in with your<br />Kick account</h1>
      <p>Use username and password for login? Continue to Kick.com</p>
      <button className="btn" onClick={() => handleButtonClick("kick")}>
        Login with Kick <img src={KickIcon} className="icon" alt="Kick" />
      </button>
      <p>Already have a Kick account with Google or Apple login?</p>
      <button className="btn" onClick={() => handleButtonClick("google")}>
        Login with Google <img src={GoogleIcon} className="icon" alt="Google" />
      </button>
      <button className="btn" onClick={() => handleButtonClick("apple")}>
        Login with Apple <img src={AppleIcon} className="icon" alt="Apple" />
      </button>
      <button className="btn green" onClick={() => handleButtonClick("anonymous")}>
        Continue anonymous <img src={GhostIcon} className="icon" alt="Anonymous" />
      </button>
      <p className="disclaimer">
        <strong>Disclaimer:</strong> We do <strong>NOT</strong> save any emails or passwords. Your privacy is our priority.
      </p>
    </div>
  );
};

export default Auth;
