import { useTranslation } from 'react-i18next';

export const useLanguage = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
    localStorage.setItem('kicktalk-language', language);
  };

  const getCurrentLanguage = () => {
    return i18n.language || 'en';
  };

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
    currentLanguage: getCurrentLanguage()
  };
};
