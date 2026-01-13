import { useTranslation } from "react-i18next";
import stvLogo from "../../assets/logos/stvLogo.svg?asset";

const EmoteUpdateMessage = ({ message }) => {
  const { t } = useTranslation();
  return (
    <>
      {message.data.added?.length > 0 &&
        message.data.added.map((e, index) => (
          <div key={`added-${e.id}-${index}`} className="emoteSetUpdateMessage added">
            <div className="emoteSetUpdateHeader">
              <img src={stvLogo} alt="7TV Logo" className="emoteSetUpdateLogo" />
              <div className="emoteSetUpdateTags">
                <span className="emoteSetUpdateLabel">
                  {message.data.setType === "personal" ? t('messages.emoteUpdate.personal') : t('messages.emoteUpdate.channel')}
                </span>
                <span className="emoteSetUpdateLabel added">{t('messages.emoteUpdate.added')}</span>
              </div>
              {message.data.authoredBy && <span className="emoteSetUpdateAddedBy">{message.data.authoredBy?.display_name}</span>}
            </div>
            <div className="emoteSetUpdateDetails">
              <div className="emoteSetUpdateItem added">
                <img src={`https://cdn.7tv.app/emote/${e.id}/1x.webp`} alt={e.name} className="emoteSetUpdateEmote" />
                <div className="emoteSetUpdateEmoteInfo">
                  <span className="emoteSetUpdateEmoteName">{e.name}</span>
                  <span className="emoteSetUpdateEmoteOwner">{t('messages.emoteUpdate.madeBy', { creator: e.owner?.display_name })}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      {message.data.removed?.length > 0 &&
        message.data.removed.map((e, index) => (
          <div key={`removed-${e.id}-${index}`} className="emoteSetUpdateMessage removed">
            <div className="emoteSetUpdateHeader">
              <img src={stvLogo} alt="7TV Logo" className="emoteSetUpdateLogo" />
              <div className="emoteSetUpdateTags">
                <span className="emoteSetUpdateLabel">
                  {message.data.setType === "personal" ? t('messages.emoteUpdate.personal') : t('messages.emoteUpdate.channel')}
                </span>
                <span className="emoteSetUpdateLabel removed">{t('messages.emoteUpdate.removed')}</span>
              </div>
              {message.data.authoredBy && <span className="emoteSetUpdateAddedBy">{message.data.authoredBy?.display_name}</span>}
            </div>
            <div className="emoteSetUpdateDetails">
              <div className="emoteSetUpdateItem removed">
                <img src={`https://cdn.7tv.app/emote/${e.id}/1x.webp`} alt={e.name} className="emoteSetUpdateEmote" />
                <div className="emoteSetUpdateEmoteInfo">
                  <span className="emoteSetUpdateEmoteName">{e.name}</span>
                  <span className="emoteSetUpdateEmoteOwner">{t('messages.emoteUpdate.madeBy', { creator: e.owner?.display_name })}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      {message.data.updated?.length > 0 &&
        message.data.updated.map((e, index) => (
          <div key={`updated-${e.id}-${index}`} className="emoteSetUpdateMessage updated">
            <div className="emoteSetUpdateHeader">
              <img src={stvLogo} alt="7TV Logo" className="emoteSetUpdateLogo" />
              <div className="emoteSetUpdateTags">
                <span className="emoteSetUpdateLabel">
                  {message.data.setType === "personal" ? t('messages.emoteUpdate.personal') : t('messages.emoteUpdate.channel')}
                </span>
                <span className="emoteSetUpdateLabel updated">{t('messages.emoteUpdate.renamed')}</span>
              </div>
              {message.data.authoredBy && <span className="emoteSetUpdateAddedBy">{message.data.authoredBy?.display_name}</span>}
            </div>
            <div className="emoteSetUpdateDetails">
              <div className="emoteSetUpdateItem updated">
                <img src={`https://cdn.7tv.app/emote/${e.id}/1x.webp`} alt={e.name} className="emoteSetUpdateEmote" />
                <div className="emoteSetUpdateEmoteInfo updated">
                  <p className="emoteSetUpdateEmoteName">
                    <span>{e.oldName}</span>
                  </p>
                  <span className="emoteSetUpdateEmoteNameSeparator">→</span>
                  <p className="emoteSetUpdateEmoteName">
                    <span>{e.newName}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
    </>
  );
};

export default EmoteUpdateMessage;
