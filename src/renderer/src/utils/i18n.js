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

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en',
    
    interpolation: {
      escapeValue: false // React already does escaping
    },
    
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator'],
      
      // Options for localStorage detection
      lookupLocalStorage: 'kicktalk-language',
      
      // Only detect languages that are available
      checkWhitelist: true
    },
    
    whitelist: ['en', 'es', 'pt'],
    
    react: {
      useSuspense: false
    }
  });

export default i18n;
