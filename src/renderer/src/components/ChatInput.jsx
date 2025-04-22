import {
  $getRoot,
  $getSelection,
  $setSelection,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
  CLEAR_EDITOR_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  $createTextNode,
  $createParagraphNode,
} from "lexical";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $rootTextContent } from "@lexical/text";
import { useChat } from "../providers/ChatProvider";

const onError = (error) => {
  console.error(error);
};

const theme = {
  ltr: "ltr",
  paragraph: "editor-paragraph",
  placeholder: "editor-placeholder",
};

const messageHistory = new Map();

// TODO: Handle enter for different OS's

const KeyHandler = ({ chatroomId, onSendMessage }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor) return;

    const registerEnterCommand = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (e) => {
        if (e.shiftKey) return false;
        e.preventDefault();

        const content = $rootTextContent();
        if (!content.trim()) return true;

        onSendMessage(content);
        editor.update(() => {
          $getRoot().clear();
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const registerArrowUpCommand = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => {
        const history = messageHistory.get(chatroomId);
        if (!history?.sentMessages?.length) return false;

        const currentIndex = history.selectedIndex !== undefined ? history.selectedIndex - 1 : history.sentMessages.length - 1;
        if (currentIndex < 0) return false;

        messageHistory.set(chatroomId, {
          ...history,
          selectedIndex: currentIndex,
        });

        editor.update(() => {
          const root = $getRoot();
          root.clear();

          const paragraph = $createParagraphNode();
          const text = $createTextNode(history.sentMessages[currentIndex]);

          paragraph.append(text);
          root.append(paragraph);
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const registerArrowDownCommand = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        const history = messageHistory.get(chatroomId);
        if (!history?.sentMessages?.length) return false;

        const currentIndex = history.selectedIndex >= 0 ? history.selectedIndex + 1 : 0;
        if (currentIndex > history.sentMessages.length) return false;

        messageHistory.set(chatroomId, {
          ...history,
          selectedIndex: currentIndex,
        });

        editor.update(() => {
          const root = $getRoot();
          root.clear();

          const paragraph = $createParagraphNode();
          const text = $createTextNode(history.sentMessages[currentIndex]);

          paragraph.append(text);
          root.append(paragraph);
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      registerEnterCommand();
      registerArrowUpCommand();
      registerArrowDownCommand();
    };
  }, [editor, chatroomId]);

  return null;
};

const initialConfig = {
  namespace: "chat",
  theme,
  onError,
};

const ChatInput = memo(
  ({ chatroomId, setShouldAutoScroll }) => {
    const { sendMessage } = useChat();

    // Reset selected index when changing chatrooms
    useEffect(() => {
      const history = messageHistory.get(chatroomId);
      if (history) {
        messageHistory.set(chatroomId, {
          ...history,
          selectedIndex: undefined,
        });
      }
    }, [chatroomId]);

    const handleSendMessage = async (content) => {
      const res = await sendMessage(chatroomId, content);

      if (res) {
        const history = messageHistory.get(chatroomId);
        messageHistory.set(chatroomId, {
          sentMessages: [...(history?.sentMessages || []), content],
          selectedIndex: undefined,
        });

        setShouldAutoScroll(true);
      }
    };

    return (
      <LexicalComposer key={`composer-${chatroomId}`} initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className="chatInput"
              enterKeyHint="send"
              aria-placeholder={"Enter message..."}
              placeholder={<div className="chatInputPlaceholder">Enter message...</div>}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <KeyHandler chatroomId={chatroomId} onSendMessage={handleSendMessage} />
        <HistoryPlugin />
        <AutoFocusPlugin />
      </LexicalComposer>
    );
  },
  (prev, next) => prev.chatroomId === next.chatroomId,
);

export default ChatInput;
