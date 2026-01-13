import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import enTranslations from '../locales/en.json';
import esTranslations from '../locales/es.json';
import ptTranslations from '../locales/pt.json';

const resources = {
  en: {
    translation: enTranslations
  },
  es: {
    translation: esTranslations
  },
  pt: {
    translation: ptTranslations
  }
};

// Get stored language or default to 'en'
const getStoredLanguage = () => {
  try {
    return localStorage.getItem('kicktalk-language') || 'en';
  } catch (error) {
    console.warn('Could not access localStorage:', error);
    return 'en';
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getStoredLanguage(), // Use stored language
    fallbackLng: 'en',
    
    interpolation: {
      escapeValue: false // React already does escaping
    },
    
    supportedLngs: ['en', 'es', 'pt'],
    
    react: {
      useSuspense: false
    }
  });

// Listen for language changes and persist them
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('kicktalk-language', lng);
    // Also save to app store if available
    if (window.app?.store) {
      window.app.store.set('language', lng);
    }
  } catch (error) {
    console.warn('Could not save language preference:', error);
  }
});

export default i18n;
