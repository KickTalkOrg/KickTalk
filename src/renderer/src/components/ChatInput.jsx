import "../assets/styles/components/Chat/Input.scss";
import {
  $getRoot,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  $createTextNode,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  PASTE_COMMAND,
  TextNode,
} from "lexical";
import { memo, useEffect } from "react";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $rootTextContent } from "@lexical/text";
import useChatStore from "../providers/ChatProvider";

import EmoteDialogs from "./EmoteDialogs";
import { useShallow } from "zustand/react/shallow";
import { EmoteNode } from "./EmoteNode";
import { kickEmoteInputRegex, kickEmoteRegex } from "../../../../utils/constants";

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

const processEmoteInput = ({ node, kickEmotes }) => {
  const matches = [];
  let lastIndex = 0;
  const text = node.getTextContent();

  for (const match of text.matchAll(kickEmoteInputRegex)) {
    const emoteName = match.groups?.emoteCase1 || match.groups?.emoteCase2;
    if (!emoteName) continue;

    const emote = kickEmotes
      ?.find((set) => set?.emotes?.find((e) => e.name === emoteName))
      ?.emotes?.find((e) => e.name === emoteName);

    if (emote) {
      matches.push({
        match,
        emoteId: emote.id,
        emoteName,
      });
    }
  }

  // Sort matches by their position in text
  matches.sort((a, b) => a.match.index - b.match.index);

  for (const { match, emoteId, emoteName } of matches) {
    const matchText = match[0].trim();
    const startIndex = match.index + match[0].indexOf(matchText);
    const endIndex = startIndex + matchText.length;

    if (startIndex < lastIndex) continue;

    node.splitText(startIndex, endIndex).forEach((part) => {
      if (part.getTextContent() === matchText && part.getParent()) {
        const emoteNode = new EmoteNode(emoteId, emoteName);
        part.replace(emoteNode);
        lastIndex = endIndex;
      }
    });
  }
};

const EmoteTransformer = ({ chatroomId }) => {
  const [editor] = useLexicalComposerContext();
  const kickEmotes = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.emotes));

  useEffect(() => {
    if (!editor) return;

    editor.registerNodeTransform(TextNode, (node) => {
      processEmoteInput({ node, kickEmotes });
    });
  }, [editor, kickEmotes]);
};

const KeyHandler = ({ chatroomId, onSendMessage }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor) return;

    editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const pastedText = clipboardData.getData("text");
        if (!pastedText) return false;

        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          let lastIndex = 0;
          const matches = [...pastedText.matchAll(kickEmoteRegex)];

          matches.forEach((match) => {
            // Insert text node before emote node
            if (match.index > lastIndex) {
              const textNode = $createTextNode(pastedText.slice(lastIndex, match.index));
              selection.insertNodes([textNode]);
            }

            // Insert emote node
            const emoteNode = new EmoteNode(match.groups.id, match.groups.name);
            selection.insertNodes([emoteNode]);

            lastIndex = match.index + match[0].length;
          });

          if (lastIndex < pastedText.length) {
            const textNode = $createTextNode(pastedText.slice(lastIndex));
            selection.insertNodes([textNode]);
          }
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

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

const EmoteHandler = ({ chatroomId }) => {
  const [editor] = useLexicalComposerContext();

  const handleEmoteClick = (emote) => {
    editor.focus();
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (emote?.platform === "7tv") {
        const emoteNode = new EmoteNode(emote.id, emote.name, "7tv");
        selection.insertNodes([emoteNode]);
      } else if (emote?.platform === "kick") {
        const emoteNode = new EmoteNode(emote.id, emote.name, "kick");
        selection.insertNodes([emoteNode]);
      } else {
        return;
      }
    });
  };

  return <EmoteDialogs chatroomId={chatroomId} handleEmoteClick={handleEmoteClick} />;
};

const initialConfig = {
  namespace: "chat",
  theme,
  onError,
  nodes: [EmoteNode],
};

const ChatInput = memo(
  ({ chatroomId }) => {
    const sendMessage = useChatStore((state) => state.sendMessage);
    const chatroomInfo = useChatStore(
      useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.chatroomInfo),
    );
    const userChatroomInfo = useChatStore(
      useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.userChatroomInfo),
    );

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
      }
    };

    return (
      <div className="chatInputWrapper">
        <div className="chatInfoBar">
          {chatroomInfo?.followers_mode?.enabled
            ? `Followers Only Mode [${chatroomInfo?.followers_mode?.min_duration} minutes]`
            : chatroomInfo?.emotes_mode?.enabled
              ? "Emote Only Mode"
              : chatroomInfo?.slow_mode?.enabled
                ? `Slow Mode [${chatroomInfo?.slow_mode?.seconds} seconds]`
                : ""}
        </div>
        <div className="chatInputContainer">
          <LexicalComposer key={`composer-${chatroomId}`} initialConfig={initialConfig}>
            <div className="chatInputBox">
              <PlainTextPlugin
                contentEditable={
                  <div>
                    <ContentEditable
                      className="chatInput"
                      enterKeyHint="send"
                      aria-placeholder={"Enter message..."}
                      placeholder={<div className="chatInputPlaceholder">Send a message...</div>}
                    />
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
            </div>
            <div className="chatInputActions">
              <EmoteHandler chatroomId={chatroomId} />
            </div>
            <KeyHandler chatroomId={chatroomId} onSendMessage={handleSendMessage} />
            <EmoteTransformer chatroomId={chatroomId} />
            <HistoryPlugin />
            <AutoFocusPlugin />
          </LexicalComposer>
        </div>
      </div>
    );
  },
  (prev, next) => prev.chatroomId === next.chatroomId,
);

export default ChatInput;
