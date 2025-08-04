import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../utils/useLanguage';
import clsx from 'clsx';
import './LanguageSelector.scss';

const LanguageSelector = ({ className, showFlags = true, compact = false }) => {
  const { t } = useTranslation();
  const { changeLanguage, getCurrentLanguage, getAvailableLanguages } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const languages = getAvailableLanguages();
  const currentLanguage = getCurrentLanguage();
  const currentLangData = languages.find(lang => lang.code === currentLanguage);

  const handleLanguageChange = (languageCode) => {
    changeLanguage(languageCode);
    setIsOpen(false);
  };

  return (
    <div className={clsx('language-selector', className, { compact, open: isOpen })}>
      <button
        className="language-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('settings.language')}
      >
        {showFlags && currentLangData?.flag && (
          <span className="language-flag">{currentLangData.flag}</span>
        )}
        <span className="language-name">
          {compact ? currentLangData?.code?.toUpperCase() : currentLangData?.name}
        </span>
        <span className={clsx('dropdown-arrow', { rotated: isOpen })}>▼</span>
      </button>

      {isOpen && (
        <div className="language-dropdown">
          {languages.map((language) => (
            <button
              key={language.code}
              className={clsx('language-option', {
                active: language.code === currentLanguage
              })}
              onClick={() => handleLanguageChange(language.code)}
            >
              {showFlags && language.flag && (
                <span className="language-flag">{language.flag}</span>
              )}
              <span className="language-name">{language.name}</span>
              {language.code === currentLanguage && (
                <span className="check-mark">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
