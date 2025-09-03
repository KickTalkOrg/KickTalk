import KickTalkLogo from "../../../assets/logos/KickTalkLogo.svg?asset";
import SignOut from "../../../assets/icons/sign-out-bold.svg?asset";
import clsx from "clsx";

const SettingsMenu = ({ activeSection, setActiveSection, onLogout }) => (
  <div className="settingsMenu">
    <div className="settingsMenuItems">
      <div className="settingsMenuSection">
        <div className="settingsMenuSectionItem">
          <button
            className={clsx("settingsMenuSectionItemBtn", "settingsMenuSectionAppInfo", {
              active: activeSection === "info",
            })}
            onClick={() => setActiveSection("info")}>
            <span>About KickTalk</span>
            <img src={KickTalkLogo} width={16} height={16} alt="KickTalk Logo" />
          </button>
        </div>
      </div>
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

        <div className="settingsMenuSectionItem">
          <button
            className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "externalPlayers" })}
            onClick={() => setActiveSection("externalPlayers")}>
            External Players
          </button>
        </div>
      </div>
      <div className="settingsMenuSection">
        <div className="settingsMenuSectionHeader">
          <h5>Chat</h5>
        </div>

        <div className="settingsMenuSectionItem">
          <button
            className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "moderation" })}
            onClick={() => setActiveSection("moderation")}>
            Moderation
          </button>
          {/* <button
            disabled
            className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "chat" })}
            onClick={() => setActiveSection("chat")}>
            Highlights
          </button>
          <button
            disabled
            className={clsx("settingsMenuSectionItemBtn", { active: activeSection === "chat" })}
            onClick={() => setActiveSection("chat")}>
            Filters
          </button> */}
        </div>
      </div>
    </div>

    <div className="settingsMenuFooter">
      <button className="settingsMenuFooterBtn" onClick={onLogout}>
        <span>Sign Out</span>
        <img src={SignOut} width={16} height={16} alt="Sign Out" />
      </button>
    </div>
  </div>
);

export default SettingsMenu;
