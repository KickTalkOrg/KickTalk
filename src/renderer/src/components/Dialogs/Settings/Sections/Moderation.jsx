import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../Shared/Tooltip";
import InfoIcon from "../../../../assets/icons/info-fill.svg?asset";
import clsx from "clsx";
import { Switch } from "../../../Shared/Switch";

const ModerationSection = ({ settingsData, onChange }) => {
  const { t } = useTranslation();
  
  return (
    <div className="settingsContentSection">
      <div className="settingsSectionHeader">
        <h4>{t('settings.moderation.title')}</h4>
        <p>{t('settings.moderation.description')}</p>
      </div>

      <div className="settingsItems">
        <div className="settingsItem">
          <div
            className={clsx("settingSwitchItem", {
              active: settingsData?.moderation?.quickModTools,
            })}>
            <div className="settingsItemTitleWithInfo">
              <span className="settingsItemTitle">{t('settings.moderation.quickModTools')}</span>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button className="settingsInfoIcon">
                    <img src={InfoIcon} width={14} height={14} alt="Info" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <img src={InfoIcon} width={14} height={14} alt={t('settings.moderation.quickModTools')} />
                  <p>{t('settings.moderation.quickModToolsDescription')}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <Switch
              checked={settingsData?.moderation?.quickModTools || false}
              onCheckedChange={(checked) =>
                onChange("moderation", {
                  ...settingsData?.moderation,
                  quickModTools: checked,
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export { ModerationSection };
