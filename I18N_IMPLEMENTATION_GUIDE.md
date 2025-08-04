# Guía de Implementación de i18n en KickTalk

## ✅ Lo que ya se ha implementado:

### 1. Configuración Base
- ✅ Instalación de dependencias: `i18next`, `react-i18next`
- ✅ Archivo de configuración i18n: `src/renderer/src/utils/i18n.js`
- ✅ Hook personalizado para cambio de idioma: `src/renderer/src/utils/useLanguage.js`
- ✅ Inicialización en `main.jsx`

### 2. Archivos de Traducción
- ✅ `src/renderer/src/locales/en.json` (Inglés - base)
- ✅ `src/renderer/src/locales/es.json` (Español)
- ✅ `src/renderer/src/locales/pt.json` (Portugués)

### 3. Componentes Actualizados
- ✅ `components/Dialogs/Auth.jsx` - Pantalla de autenticación
- ✅ `components/TitleBar.jsx` - Barra de título con selector de idioma
- ✅ `pages/ChatPage.jsx` - Página principal de chat
- ✅ `components/Dialogs/User.jsx` - Diálogo de usuario (parcial)
- ✅ `components/Dialogs/Settings/Sections/General.jsx` - Configuración general (parcial)

### 4. Componente de Selector de Idioma
- ✅ `components/Shared/LanguageSelector.jsx` - Selector compacto con banderas
- ✅ `components/Shared/LanguageSelector.scss` - Estilos responsivos

## 🔄 Componentes Pendientes de Traducir:

### Componentes de Chat
- `components/Chat/Input/index.jsx`
- `components/Chat/StreamerInfo.jsx`
- `components/Messages/RegularMessage.jsx`
- `components/Messages/MessagesHandler.jsx`

### Diálogos
- `components/Dialogs/Chatters.jsx`
- `components/Dialogs/Search.jsx`
- `components/Dialogs/Settings/index.jsx`
- `components/Dialogs/Settings/SettingsMenu.jsx`
- `components/Dialogs/Settings/Sections/Moderation.jsx`
- `components/Dialogs/Settings/Sections/About.jsx`

### Componentes Compartidos
- `components/Shared/Settings.jsx`
- `components/Shared/NotificationFilePicker.jsx`
- `components/Updater.jsx`

### Páginas
- `pages/Loader.jsx`

## 📝 Cómo Continuar la Implementación:

### Paso 1: Para cada componente
```jsx
// 1. Importar useTranslation
import { useTranslation } from "react-i18next";

// 2. Usar el hook en el componente
const MyComponent = () => {
  const { t } = useTranslation();
  
  // 3. Reemplazar strings hardcodeados
  return <span>{t('key.subkey')}</span>;
};
```

### Paso 2: Agregar las traducciones a los archivos JSON
```json
{
  "key": {
    "subkey": "Texto en inglés"
  }
}
```

### Paso 3: Traducir a español y portugués

## 🎯 Strings Más Importantes para Traducir:

### Mensajes de Error y Estado
- "Loading..."
- "Error occurred"
- "Connection failed"
- "No messages found"

### Botones y Acciones
- "Save", "Cancel", "Apply"
- "Add", "Remove", "Edit"
- "Copy", "Delete", "Pin"

### Configuraciones
- Títulos de secciones
- Descripciones de opciones
- Tooltips y ayuda

### Mensajes de Chat
- Timestamps
- User actions
- Moderation messages

## 🔧 Funcionalidades Adicionales Sugeridas:

### 1. Detección Automática de Idioma
```js
// En i18n.js, agregar detección basada en:
// - Configuración guardada del usuario
// - Idioma del navegador
// - Idioma del sistema
```

### 2. Persistencia de Idioma
```js
// Guardar preferencia en electron-store
const saveLanguagePreference = (lang) => {
  window.app.store.set('language', lang);
};
```

### 3. Formateo de Fechas Localizado
```js
// Usar dayjs con locales
import 'dayjs/locale/es';
import 'dayjs/locale/pt-br';
```

### 4. Pluralización
```json
{
  "messages": {
    "count_one": "{{count}} mensaje",
    "count_other": "{{count}} mensajes"
  }
}
```

## 🚀 Siguientes Pasos Recomendados:

1. **Continuar con componentes de alta prioridad**: Settings, Chat Input, Messages
2. **Implementar persistencia de idioma**: Guardar en electron-store
3. **Agregar más idiomas**: Francés, Alemán, etc.
4. **Mejorar UX**: Transiciones suaves al cambiar idioma
5. **Testing**: Probar cambios de idioma en tiempo real

## 📋 Comandos Útiles:

```bash
# Buscar strings hardcodeados
grep -r "\"[A-Z][a-zA-Z\s]*\"" src/renderer/src/components/ --include="*.jsx"

# Verificar uso de t() function
grep -r "t(" src/renderer/src/components/ --include="*.jsx"
```
