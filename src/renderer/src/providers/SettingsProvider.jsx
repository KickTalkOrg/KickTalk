import { createContext, useContext, useState, useEffect } from "react";
import { applyTheme } from "../../../../utils/themeUtils";
import i18n from "../utils/i18n";

const SettingsContext = createContext({});

const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});

  const handleThemeChange = async (newTheme) => {
    if (!window.app?.store) {
      console.warn("[SettingsProvider]: window.app.store not available for theme change");
      return;
    }

    const themeData = { current: newTheme };
    setSettings((prev) => ({ ...prev, customTheme: themeData }));
    applyTheme(themeData);
    await window.app.store.set("customTheme", themeData);
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        // Wait for window.app to be available
        if (!window.app?.store) {
          console.warn("[SettingsProvider]: window.app.store not available yet, retrying...");
          setTimeout(loadSettings, 100);
          return;
        }

        const settings = await window.app.store.get();
        setSettings(settings);

        // Apply theme to document
        if (settings?.customTheme?.current) {
          applyTheme(settings.customTheme);
        }

        // Apply language if stored
        if (settings?.language && settings.language !== i18n.language) {
          await i18n.changeLanguage(settings.language);
        }
      } catch (error) {
        console.error("[SettingsProvider]: Error loading settings:", error);
      }
    }

    loadSettings();

    // Setup store update listener with safety check
    let cleanup;
    const setupListener = () => {
      if (window.app?.store?.onUpdate) {
        cleanup = window.app.store.onUpdate((data) => {
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

            // Apply language if changed
            if (data.language && data.language !== i18n.language) {
              i18n.changeLanguage(data.language);
            }

            return newSettings;
          });
        });
      } else {
        setTimeout(setupListener, 100);
      }
    };

    setupListener();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const updateSettings = async (key, value) => {
    try {
      if (!window.app?.store) {
        console.warn("[SettingsProvider]: window.app.store not available for settings update");
        return;
      }

      setSettings((prev) => ({ ...prev, [key]: value }));
      await window.app.store.set(key, value);

      if (key === "customTheme" && value?.current) {
        applyTheme(value);
      }

      // Handle language changes
      if (key === "language" && value !== i18n.language) {
        await i18n.changeLanguage(value);
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
