import { useTranslation } from "react-i18next";
import darkProfilePic from "../../../../assets/app/darkProfilePic.jpg";
import ftkProfilePic from "../../../../assets/app/ftk789ProfilePic.jpg";
import XLogo from "../../../../assets/logos/XLogo.svg?asset";
import kickLogoIcon from "../../../../assets/logos/kickLogoIcon.svg?asset";

const AboutSection = ({ appInfo }) => {
  const { t } = useTranslation();
  
  return (
    <div className="settingsContentAbout">
      <div className="settingsContentSection">
        <div className="settingsSectionHeader">
          <h4>{t('settings.about.title')}</h4>
          <p>{t('settings.about.description')}</p>
        </div>

        <div className="settingsContentAboutDevsContainer">
          <div className="settingsContentHeader">
            <h5>{t('settings.about.meetCreators')}</h5>
          </div>
          <div className="settingsContentAboutDevs">
            <div className="settingsContentAboutDev">
              <div className="settingsContentAboutDevInfo">
                <img src={darkProfilePic} alt="dark Profile Pic" width={80} height={80} />
                <div className="settingsContentAboutDevSections">
                  <span>
                    <p>{t('settings.about.kickUsername')}:</p>
                    <h5>DRKNESS_x</h5>
                  </span>
                  <span>
                    <p>{t('settings.about.role')}:</p>
                    <h5>{t('settings.about.developerDesigner')}</h5>
                  </span>
                </div>
              </div>

              <div className="settingsContentAboutDevSocials">
                <a href="https://x.com/drkerco" target="_blank" rel="noopener noreferrer">
                  <span>{t('settings.about.openTwitter')}</span>
                  <img src={XLogo} width={12} height={12} alt="X-Twitter Logo" />
                </a>
                <a href="https://kick.com/drkness-x" target="_blank" rel="noopener noreferrer">
                  <span>{t('settings.about.openChannel')}</span>
                  <img src={kickLogoIcon} width={12} height={12} alt="Kick Logo" />
                </a>
              </div>
            </div>
            <div className="settingsContentAboutDevSeparator" />
            <div className="settingsContentAboutDev">
              <div className="settingsContentAboutDevInfo">
                <img src={ftkProfilePic} alt="ftk789 Profile Pic" width={80} height={80} />
                <div className="settingsContentAboutDevSections">
                  <span>
                    <p>{t('settings.about.kickUsername')}:</p>
                    <h5>ftk789</h5>
                  </span>
                  <span>
                    <p>{t('settings.about.role')}:</p>
                    <h5>{t('settings.about.developer')}</h5>
                  </span>
                </div>
              </div>

              <div className="settingsContentAboutDevSocials">
                <a href="https://x.com/ftk789yt" target="_blank" rel="noopener noreferrer">
                  <span>{t('settings.about.openTwitter')}</span>
                  <img src={XLogo} width={12} height={12} alt="X-Twitter Logo" />
                </a>
                <a href="https://kick.com/ftk789" target="_blank" rel="noopener noreferrer">
                  <span>{t('settings.about.openChannel')}</span>
                  <img src={kickLogoIcon} width={12} height={12} alt="Kick Logo" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="settingsContentSection">
        <div className="settingsContentAboutApp">
          <div className="settingsContentHeader">
            <h5>{t('settings.about.aboutKickTalk')}</h5>
          </div>

          <div className="settingsContentAboutAppContent">
            <p>
              {t('settings.about.appDescription')}
            </p>
          </div>
        </div>
      </div>

      <div className="settingsContentSection">
        <div className="settingsAppDetailsSection">
          <div className="settingsAppDetailsInfo">
            <h5>{t('settings.about.currentVersion')}:</h5>
            <p>{appInfo?.appVersion}</p>
          </div>
          {/* <UpdateButton /> */}
        </div>
      </div>
    </div>
  );
};

export default AboutSection;
