import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import languageSync from './languageSync';

export const useLanguage = () => {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState(languageSync.getCurrentLanguage());

  useEffect(() => {
    // Listen for language changes from sync utility
    const unsubscribe = languageSync.addListener((language) => {
      setCurrentLanguage(language);
    });

    return unsubscribe;
  }, []);

  const changeLanguage = useCallback(async (language) => {
    const success = await languageSync.changeLanguage(language);
    if (success) {
      setCurrentLanguage(language);
    }
    return success;
  }, []);

  const getCurrentLanguage = useCallback(() => {
    return currentLanguage;
  }, [currentLanguage]);

  const getAvailableLanguages = () => {
    return [
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'pt', name: 'Português', flag: '🇧🇷' }
    ];
  };

  return {
    changeLanguage,
    getCurrentLanguage,
    getAvailableLanguages,
    currentLanguage
  };
};
