import { createContext, useContext, useState, useEffect } from "react";
import { applyTheme } from "../../../../utils/themeUtils";
import { DEFAULT_CHAT_HISTORY_LENGTH } from "@utils/constants";

const SettingsContext = createContext({});

const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});

  const handleThemeChange = async (newTheme) => {
    const themeData = { current: newTheme };
    setSettings((prev) => ({ ...prev, customTheme: themeData }));
    applyTheme(themeData);
    await window.app.store.set("customTheme", themeData);
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await window.app.store.get();
        
        // Apply default chat history settings if not present
        const settingsWithDefaults = {
          ...settings,
          chatHistory: {
            chatHistoryLength: DEFAULT_CHAT_HISTORY_LENGTH,
            ...settings?.chatHistory
          }
        };
        
        setSettings(settingsWithDefaults);

        // Apply theme to document
        if (settingsWithDefaults?.customTheme?.current) {
          applyTheme(settingsWithDefaults.customTheme);
        }
      } catch (error) {
        console.error("[SettingsProvider]: Error loading settings:", error);
      }
    }

    loadSettings();

    const cleanup = window.app.store.onUpdate((data) => {
      setSettings((prev) => {
        const newSettings = { ...prev };

        Object.entries(data).forEach(([key, value]) => {
          if (typeof value === "object" && value !== null) {
            newSettings[key] = {
              ...newSettings[key],
              ...value,
            };
          } else {
            newSettings[key] = value;
          }
        });

        if (data.customTheme?.current) {
          applyTheme(data.customTheme);
        }

        return newSettings;
      });
    });

    return () => cleanup();
  }, []);

  const updateSettings = async (key, value) => {
    try {
      setSettings((prev) => ({ ...prev, [key]: value }));
      await window.app.store.set(key, value);

      if (key === "customTheme" && value?.current) {
        applyTheme(value);
      }
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
    }
  };

  return <SettingsContext.Provider value={{ settings, updateSettings, handleThemeChange }}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};

export default SettingsProvider;
