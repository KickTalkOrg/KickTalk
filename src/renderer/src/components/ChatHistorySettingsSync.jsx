import { useEffect } from "react";
import { useSettings } from "../providers/SettingsProvider";
import useChatStore from "../providers/ChatProvider";

/**
 * Component to sync chat history settings from SettingsProvider to ChatProvider
 * This component ensures that chat message limits are updated when settings change
 */
const ChatHistorySettingsSync = () => {
  const { settings } = useSettings();
  const updateChatHistorySettings = useChatStore((state) => state.updateChatHistorySettings);

  useEffect(() => {
    if (settings?.chatHistory) {
      // Sync chat history settings to the chat store
      updateChatHistorySettings(settings.chatHistory);
    }
  }, [settings?.chatHistory, updateChatHistorySettings]);

  return null; // This component doesn't render anything
};

export default ChatHistorySettingsSync;