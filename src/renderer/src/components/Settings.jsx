import { useState, useEffect } from "react";
import "../styles/Settings.css";
import clsx from "clsx";
import { Check } from "@phosphor-icons/react";

// TODO: Click away to close settings dropdown
const Settings = ({ settingsModalOpen }) => {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      const settingsStore = await window.app.store.get();
      console.log(settingsStore);
      setSettings(settingsStore);
    };

    loadSettings();
  }, []);

  const changeSetting = async (key, value) => {
    try {
      await window.app.store.set(key, value);
      setSettings(await window.app.store.get());
    } catch (error) {
      console.error("Failed to save setting:", error);
    }
  };

  const handlePhraseAdd = (phrase) => {
    if (phrase && !settings?.notifications?.phrases.includes(phrase)) {
      changeSetting("notifications.phrases", [...settings?.notifications?.phrases, phrase]);
    }
  };

  const handlePhraseRemove = (phrase) => {
    changeSetting(
      "notifications.phrases",
      settings?.notifications?.phrases.filter((p) => p !== phrase),
    );
  };

  return (
    <div className={clsx("settingsWrapper", settingsModalOpen && "show")}>
      <div className="settingsHead">
        <h4>Settings</h4>
      </div>

      <span className="settingsDivider" />

      <div className="settingsSection settingsCosmetics">
        <h5>Emotes & Badges</h5>

        <div className="settingsSwitch">
          <button
            className={clsx("settingSwitchItem", settings?.sevenTV?.emotes ? "checked" : "")}
            onClick={() => changeSetting("sevenTV.emotes", !settings?.sevenTV?.emotes)}>
            <div className="checkBox">{settings?.sevenTV?.emotes && <Check weight={"bold"} size={14} />}</div>
            <span>7TV Emotes</span>
          </button>
        </div>
        <div className="settingsSwitch">
          <button
            className={clsx("settingSwitchItem", settings?.sevenTV?.badges ? "checked" : "")}
            onClick={() => changeSetting("sevenTV.badges", !settings?.sevenTV?.badges)}>
            <div className="checkBox">{settings?.sevenTV?.badges && <Check weight={"bold"} size={14} />}</div>
            <span>7TV Badges</span>
          </button>
        </div>
        <div className="settingsSwitch">
          <button
            className={clsx("settingSwitchItem", settings?.sevenTV?.paints ? "checked" : "")}
            onClick={() => changeSetting("sevenTV.paints", !settings?.sevenTV?.paints)}>
            <div className="checkBox">{settings?.sevenTV?.paints && <Check weight={"bold"} size={14} />}</div>
            <span>7TV Paints</span>
          </button>
        </div>
      </div>

      <span className="settingsDivider" />

      <div className="settingsSection notifications">
        <h5>Notifications</h5>

        <div className="notificationOptions"></div>
      </div>

      <span className="settingsDivider" />

      <div className="settingsSection notificationPhrases">
        <h5>Highlight Phrases</h5>

        <div className="highlightPhrases">
          {settings?.notifications?.phrases.map((phrase) => (
            <div key={phrase} className="highlightPhrase">
              <span>{phrase}</span>
              <button onClick={() => handlePhraseRemove(phrase)}>&times;</button>
            </div>
          ))}
        </div>

        <div className="highlightAddPhrase">
          <input
            type="text"
            placeholder="Add new phrase..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handlePhraseAdd(e.target.value);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Settings;
