/**
 * Language synchronization utility
 * Ensures all windows/dialogs stay in sync when language changes
 */

import i18n from './i18n';

class LanguageSync {
  constructor() {
    this.listeners = new Set();
    this.init();
  }

  init() {
    // Listen for storage changes (from other windows)
    window.addEventListener('storage', (e) => {
      if (e.key === 'kicktalk-language' && e.newValue !== i18n.language) {
        i18n.changeLanguage(e.newValue);
      }
    });

    // Listen for i18n language changes
    i18n.on('languageChanged', (lng) => {
      this.notifyListeners(lng);
    });
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(language) {
    this.listeners.forEach(callback => {
      try {
        callback(language);
      } catch (error) {
        console.error('Language sync listener error:', error);
      }
    });
  }

  getCurrentLanguage() {
    return i18n.language || 'en';
  }

  async changeLanguage(language) {
    try {
      await i18n.changeLanguage(language);
      
      // Notify main process if available
      if (window.app?.onLanguageChange) {
        window.app.onLanguageChange(language);
      }
      
      return true;
    } catch (error) {
      console.error('Error changing language:', error);
      return false;
    }
  }
}

// Create singleton instance
const languageSync = new LanguageSync();

export default languageSync;
