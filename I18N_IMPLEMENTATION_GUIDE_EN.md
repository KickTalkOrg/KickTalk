# KickTalk i18n Implementation Guide

## ✅ What has already been implemented:

### 1. Base Configuration
- ✅ Dependencies installation: `i18next`, `react-i18next`
- ✅ i18n configuration file: `src/renderer/src/utils/i18n.js`
- ✅ Custom hook for language switching: `src/renderer/src/utils/useLanguage.js`
- ✅ Initialization in `main.jsx`

### 2. Translation Files
- ✅ `src/renderer/src/locales/en.json` (English - base)
- ✅ `src/renderer/src/locales/es.json` (Spanish)
- ✅ `src/renderer/src/locales/pt.json` (Portuguese)

### 3. Updated Components
- ✅ `components/Dialogs/Auth.jsx` - Authentication screen
- ✅ `components/TitleBar.jsx` - Title bar with language selector
- ✅ `pages/ChatPage.jsx` - Main chat page
- ✅ `components/Dialogs/User.jsx` - User dialog (partial)
- ✅ `components/Dialogs/Settings/Sections/General.jsx` - General settings (partial)

### 4. Language Selector Component
- ✅ `components/Shared/LanguageSelector.jsx` - Compact selector with flags
- ✅ `components/Shared/LanguageSelector.scss` - Responsive styles

## 🔄 Components Pending Translation:

### Chat Components
- `components/Chat/Input/index.jsx`
- `components/Chat/StreamerInfo.jsx`
- `components/Messages/RegularMessage.jsx`
- `components/Messages/MessagesHandler.jsx`

### Dialogs
- `components/Dialogs/Chatters.jsx`
- `components/Dialogs/Search.jsx`
- `components/Dialogs/Settings/index.jsx`
- `components/Dialogs/Settings/SettingsMenu.jsx`
- `components/Dialogs/Settings/Sections/Moderation.jsx`
- `components/Dialogs/Settings/Sections/About.jsx`

### Shared Components
- `components/Shared/Settings.jsx`
- `components/Shared/NotificationFilePicker.jsx`
- `components/Updater.jsx`

### Pages
- `pages/Loader.jsx`

## 📝 How to Continue Implementation:

### Step 1: For each component
```jsx
// 1. Import useTranslation
import { useTranslation } from "react-i18next";

// 2. Use the hook in the component
const MyComponent = () => {
  const { t } = useTranslation();
  
  // 3. Replace hardcoded strings
  return <span>{t('key.subkey')}</span>;
};
```

### Step 2: Add translations to JSON files
```json
{
  "key": {
    "subkey": "Text in English"
  }
}
```

### Step 3: Translate to Spanish and Portuguese

## 🎯 Most Important Strings to Translate:

### Error and Status Messages
- "Loading..."
- "Error occurred"
- "Connection failed"
- "No messages found"

### Buttons and Actions
- "Save", "Cancel", "Apply"
- "Add", "Remove", "Edit"
- "Copy", "Delete", "Pin"

### Settings
- Section titles
- Option descriptions
- Tooltips and help text

### Chat Messages
- Timestamps
- User actions
- Moderation messages

## 🔧 Suggested Additional Features:

### 1. Automatic Language Detection
```js
// In i18n.js, add detection based on:
// - User's saved configuration
// - Browser language
// - System language
```

### 2. Language Persistence
```js
// Save preference in electron-store
const saveLanguagePreference = (lang) => {
  window.app.store.set('language', lang);
};
```

### 3. Localized Date Formatting
```js
// Use dayjs with locales
import 'dayjs/locale/es';
import 'dayjs/locale/pt-br';
```

### 4. Pluralization
```json
{
  "messages": {
    "count_one": "{{count}} message",
    "count_other": "{{count}} messages"
  }
}
```

## 🚀 Recommended Next Steps:

1. **Continue with high-priority components**: Settings, Chat Input, Messages
2. **Implement language persistence**: Save in electron-store
3. **Add more languages**: French, German, etc.
4. **Improve UX**: Smooth transitions when changing language
5. **Testing**: Test real-time language changes

## 📋 Useful Commands:

```bash
# Find hardcoded strings
grep -r "\"[A-Z][a-zA-Z\s]*\"" src/renderer/src/components/ --include="*.jsx"

# Check for t() function usage
grep -r "t(" src/renderer/src/components/ --include="*.jsx"
```

## 🛠️ Implementation Examples:

### Basic Component Translation
```jsx
import { useTranslation } from 'react-i18next';

const ChatInput = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <input placeholder={t('chat.input.placeholder')} />
      <button>{t('common.send')}</button>
    </div>
  );
};
```

### Settings Component with Language Selector
```jsx
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../Shared/LanguageSelector';

const GeneralSettings = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h3>{t('settings.general.title')}</h3>
      <div className="language-setting">
        <label>{t('settings.language')}</label>
        <LanguageSelector />
      </div>
    </div>
  );
};
```

### Using Interpolation
```jsx
const UserProfile = ({ username, messageCount }) => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h2>{t('user.profile.title', { username })}</h2>
      <p>{t('user.messages.count', { count: messageCount })}</p>
    </div>
  );
};
```

## 🎨 Translation Key Structure:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "loading": "Loading..."
  },
  "auth": {
    "signIn": "Sign In",
    "loginWith": "Login with {{provider}}"
  },
  "chat": {
    "input": {
      "placeholder": "Type a message...",
      "send": "Send"
    },
    "actions": {
      "pin": "Pin Message",
      "copy": "Copy Message"
    }
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "general": {
      "title": "General",
      "alwaysOnTop": "Always on Top"
    }
  }
}
```

## ⚡ Performance Tips:

1. **Use namespaces** for large translation files
2. **Lazy load** translations for better performance
3. **Cache translations** in production
4. **Use translation keys** that are descriptive but concise

## 🔍 Testing Strategy:

1. **Component testing**: Ensure all text renders correctly in each language
2. **Layout testing**: Check that UI doesn't break with longer translations
3. **Functionality testing**: Verify language switching works seamlessly
4. **Accessibility testing**: Ensure screen readers work with translated content

## 📦 File Structure:
```
src/renderer/src/
├── locales/
│   ├── en.json
│   ├── es.json
│   └── pt.json
├── utils/
│   ├── i18n.js
│   └── useLanguage.js
└── components/
    └── Shared/
        ├── LanguageSelector.jsx
        └── LanguageSelector.scss
```
