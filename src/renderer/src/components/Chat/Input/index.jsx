import "../../../assets/styles/components/Chat/Input.scss";
import clsx from "clsx";
import {
  $getRoot,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_TAB_COMMAND,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  PASTE_COMMAND,
  TextNode,
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
import useChatStore from "../../../providers/ChatProvider";

import EmoteDialogs from "./EmoteDialogs";
import { useShallow } from "zustand/react/shallow";
import { EmoteNode } from "./EmoteNode";
import { kickEmoteInputRegex, kickEmoteRegex } from "../../../../../../utils/constants";
import InfoIcon from "../../../assets/icons/info-fill.svg?asset";
import { convertSecondsToHumanReadable } from "../../../utils/ChatUtils";

const onError = (error) => {
  console.error(error);
};

const theme = {
  ltr: "ltr",
  paragraph: "editor-paragraph",
  placeholder: "editor-placeholder",
};

const messageHistory = new Map();

const EmoteSuggestions = memo(
  ({ suggestions, onSelect, selectedIndex }) => {
    const suggestionsRef = useRef(null);
    const selectedSuggestionRef = useRef(null);

    useEffect(() => {
      if (!suggestionsRef.current) return;

      const selectedElement = selectedSuggestionRef.current;
      if (!selectedElement) return;

      selectedElement.scrollIntoView({ block: "center", behavior: "instant" });
    }, [selectedIndex]);

    if (!suggestions?.length) return null;

    return (
      <div className={clsx("emoteSuggestionsWrapper", suggestions?.length && "show")} ref={suggestionsRef}>
        <div className="emoteSuggestions">
          {suggestions?.map((emote, i) => {
            return (
              <div
                key={emote?.id}
                ref={selectedIndex === i ? selectedSuggestionRef : null}
                className={clsx("emoteSuggestion", selectedIndex === i && "selected")}
                onClick={() => {
                  onSelect(emote);
                }}>
                <div className="emoteSuggestionImage">
                  <img
                    className="emote"
                    src={
                      emote?.platform === "7tv"
                        ? `https://cdn.7tv.app/emote/${emote?.id}/1x.webp`
                        : `https://files.kick.com/emotes/${emote?.id}/fullsize`
                    }
                    alt={emote?.name}
                    title={emote?.name}
                    width={emote?.platform === "7tv" ? emote?.width : "32px"}
                    height={emote?.platform === "7tv" ? emote?.height : "32px"}
                    loading="lazy"
                    fetchpriority="low"
                    decoding="async"
                  />
                </div>
                <div className="emoteSuggestionInfo">
                  <span>{emote?.name}</span>
                  <div className="emoteTags">
                    {emote?.subscribers_only && <span>SUB</span>}
                    {emote?.type && <span>{emote?.type.toUpperCase()}</span>}
                    <span>{emote?.platform?.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.selectedIndex === nextProps.selectedIndex &&
      prevProps.suggestions === nextProps.suggestions &&
      prevProps.selectedTabIndex === nextProps.selectedTabIndex &&
      prevProps.tabSuggestions === nextProps.tabSuggestions
    );
  },
);

const KeyHandler = ({ chatroomId, onSendMessage }) => {
  const [editor] = useLexicalComposerContext();
  const [suggestions, setSuggestions] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [tabSuggestions, setTabSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [showChatters, setShowChatters] = useState(false);

  const sevenTVEmotes = useChatStore(
    useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.channel7TVEmotes),
  );

  const kickEmotes = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.emotes));

  const searchEmotes = useCallback(
    (text) => {
      if (!text) return [];

      const transformedText = text.toLowerCase();

      // Handle 7TV emotes
      const sevenTvResults =
        sevenTVEmotes
          ?.flatMap((emoteSet) => emoteSet.emotes)
          ?.filter((emote) => emote.name.toLowerCase().includes(transformedText))
          ?.slice(0, 10) || [];

      // Handle Kick emotes from multiple sets
      const kickResults =
        kickEmotes
          ?.flatMap((emoteSet) => emoteSet.emotes || [])
          ?.filter((emote) => emote.name.toLowerCase().includes(transformedText))
          ?.slice(0, 10) || [];

      return [...sevenTvResults, ...kickResults];
    },
    [sevenTVEmotes, kickEmotes],
  );

  const insertEmote = useCallback(
    (emote) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        // Delete searched text w/ colon
        const node = selection.anchor.getNode();
        if (!node) return;

        const textContent = node.getTextContent();
        const cursorOffset = selection.anchor.offset;

        const colonIndex = textContent.indexOf(":");
        if (colonIndex === -1) return;

        const textBefore = textContent.slice(0, colonIndex);
        const textAfter = textContent.slice(cursorOffset);

        // Set text that is before emote
        node.setTextContent(textBefore);

        // Insert emote node
        if (!emote?.platform) return;
        const emoteNode = new EmoteNode(emote.id, emote.name, emote.platform);
        selection.insertNodes([emoteNode, $createTextNode(" ")]);

        // Set text after emote
        if (textAfter) {
          const afterNode = $createTextNode(textAfter);
          selection.insertNodes([afterNode]);
        }
      });

      setSuggestions([]);
      setSearchText("");
      setSelectedIndex(null);
    },
    [editor],
  );

  useEffect(() => {
    if (!editor) return;

    // Paste
    const registerPasteCommand = editor.registerCommand(
      PASTE_COMMAND,
      (e) => {
        e.preventDefault();
        const clipboardData = e.clipboardData;
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

    // Arrow Up Command
    const registerArrowUpCommand = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (e) => {
        e.preventDefault();

        if (suggestions?.length) {
          setSelectedIndex(selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1);
          return true;
        }

        const history = messageHistory.get(chatroomId);
        if (!history?.sentMessages?.length) return false;

        const currentIndex = history.selectedIndex !== undefined ? history.selectedIndex - 1 : history.sentMessages.length - 1;
        if (currentIndex < 0) return false;

        messageHistory.set(chatroomId, {
          ...history,
          selectedIndex: currentIndex,
        });

        editor.update(() => {
          $getRoot().clear();

          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          const text = $createTextNode(history.sentMessages[currentIndex]);

          selection.insertNodes([text]);
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    // Arrow Down Command
    const registerArrowDownCommand = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (e) => {
        e.preventDefault();

        if (suggestions?.length) {
          if (selectedIndex === null) return setSelectedIndex(0);
          setSelectedIndex(selectedIndex >= suggestions.length - 1 ? 0 : selectedIndex + 1);
          return true;
        }

        const history = messageHistory.get(chatroomId);
        if (!history?.sentMessages?.length) return false;

        const currentIndex = history.selectedIndex >= 0 ? history.selectedIndex + 1 : 0;
        if (currentIndex > history.sentMessages.length) return false;

        messageHistory.set(chatroomId, {
          ...history,
          selectedIndex: currentIndex,
        });

        editor.update(() => {
          $getRoot().clear();

          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          const text = $createTextNode(history.sentMessages[currentIndex]);

          selection.insertNodes([text]);
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    // Enter Command
    const registerEnterCommand = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (e) => {
        if (e.shiftKey) return false;
        e.preventDefault();

        if (suggestions?.length > 0) {
          insertEmote(suggestions[selectedIndex]);
          return true;
        }

        const content = $rootTextContent();
        if (!content.trim()) return true;

        onSendMessage(content);
        editor.update(() => {
          if (e.ctrlKey) return;
          $getRoot().clear();
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    // Tab Command
    const registerTabCommand = editor.registerCommand(
      KEY_TAB_COMMAND,
      (e) => {
        if (e.shiftKey) return false;
        e.preventDefault();

        if (suggestions?.length) {
          insertEmote(suggestions[selectedIndex]);
          return true;
        }

        // if (tabSuggestions?.length) {
        //   const nextIndex = (selectedTabIndex + 1) % tabSuggestions.length;
        //   setSelectedTabIndex(nextIndex);

        //   editor.update(() => {
        //     const selection = $getSelection();
        //     if (!$isRangeSelection(selection)) return;

        //     const node = selection.anchor.getNode();
        //     if (!node) return;

        //     const textContent = node.getTextContent();
        //     const currentEmote = tabSuggestions[nextIndex - 1];
        //     const startIndex = textContent.lastIndexOf(tabSuggestions[nextIndex - 1]);
        //     const endIndex = startIndex + tabSuggestions[nextIndex].length;

        //     const textBefore = textContent.slice(startIndex, endIndex);
        //     const textAfter = textContent.slice(endIndex);

        //     // Delete the current word
        //     node.setTextContent(textBefore + textAfter);

        //     // Set text after emote
        //     if (textAfter) {
        //       const afterNode = $createTextNode(textAfter);
        //       selection.insertNodes([afterNode]);
        //     }
        //   });
        //   return true;
        // }

        // const content = $rootTextContent();
        // if (!content.trim()) return false;

        // // Get the text before the cursor in the current node
        // const cursorOffset = $getSelection().anchor.offset;
        // const textBeforeCursor = content.slice(0, cursorOffset);

        // // Find the last word before the cursor
        // const words = textBeforeCursor.split(/\s+/);
        // const currentWord = words[words.length - 1];

        // const foundEmotes = [];

        // // Search 7TV Emotes for matches
        // [...sevenTVEmotes[0]?.emotes, ...sevenTVEmotes[1]?.emotes]?.filter((emote) => {
        //   if (emote.name.toLowerCase().startsWith(currentWord.toLowerCase())) {
        //     foundEmotes.push(emote);
        //   }
        // });

        // if (foundEmotes.length > 0) {
        //   setTabSuggestions(foundEmotes);
        //   setSelectedTabIndex(0);

        //   editor.update(() => {
        //     const selection = $getSelection();
        //     if (!$isRangeSelection(selection)) return;

        //     const node = selection.anchor.getNode();
        //     if (!node) return;

        //     const textContent = node.getTextContent();
        //     const startIndex = textContent.lastIndexOf(currentWord);

        //     const endIndex = startIndex + currentWord.length;

        //     const textBefore = textContent.slice(0, startIndex);
        //     const textAfter = textContent.slice(endIndex);

        //     // Delete the current word
        //     node.setTextContent(textBefore + textAfter + foundEmotes[0]?.name);

        //     // Set text after emote
        //     if (textAfter) {
        //       const afterNode = $createTextNode(textAfter);
        //       selection.insertNodes([afterNode]);
        //     }
        //   });
        //   return true;
        // }
        // const emote = getEmoteData(currentWord, sevenTVEmotes, chatroomId);

        // if (emote) {
        //   insertEmote(emote);
        //   return true;
        // }

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const registerUpdateListener = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const node = selection.anchor.getNode();
        if (!node) return;

        const textContent = node.getTextContent();
        const cursorOffset = selection.anchor.offset;

        // Get the text before the cursor in the current node
        const textBeforeCursor = textContent.slice(0, cursorOffset);

        // Find the last word before the cursor
        const words = textBeforeCursor.split(/\s+/);
        const currentWord = words[words.length - 1];

        // Make sure the last word before the cursor starts with a colon (emote search)
        if (!currentWord.startsWith(":")) {
          setSuggestions([]);
          setSearchText("");
          setSelectedIndex(null);
          return;
        }

        // Remove the colon from the search text
        const searchTextWithoutColon = currentWord.slice(1);

        // Search for emotes that include the search text
        const results = searchEmotes(searchTextWithoutColon);

        if (results?.length) {
          setSearchText(searchTextWithoutColon);
          setSuggestions(results);
          setSelectedIndex(0);
        } else {
          setSearchText("");
          setSuggestions([]);
          setSelectedIndex(null);
        }
      });
    });

    // Add effect to handle @ mentions
    // const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
    //   editorState.read(() => {
    //     const text = $rootTextContent();
    //     const lastAtSymbol = text.lastIndexOf("@");

    //     if (lastAtSymbol !== -1) {
    //       const textAfterAt = text.slice(lastAtSymbol + 1);
    //       if (!textAfterAt.includes(" ")) {
    //         // Show chatters dialog when @ is typed
    //         window.app.chattersDialog.open();
    //         setShowChatters(true);
    //       } else {
    //         setShowChatters(false);
    //       }
    //     } else {
    //       setShowChatters(false);
    //     }
    //   });
    // });

    // Add event listener for inserting mentions
    // const handleInsertMention = (e) => {
    //   const { text } = e.detail;
    //   editor.update(() => {
    //     const selection = $getSelection();
    //     if (!$isRangeSelection(selection)) return;

    //     // Find the last @ symbol
    //     const rootText = $rootTextContent();
    //     const lastAtSymbol = rootText.lastIndexOf("@");
    //     if (lastAtSymbol === -1) return;

    //     // Get the text node containing the @ symbol
    //     const textNode = selection.anchor.getNode();
    //     const textContent = textNode.getTextContent();
    //     const atIndex = textContent.lastIndexOf("@");

    //     if (atIndex !== -1) {
    //       // Replace the @ and any text after it with the mention
    //       textNode.setTextContent(textContent.slice(0, atIndex) + text);
    //     }
    //   });
    // };

    // window.addEventListener("insertMention", handleInsertMention);

    return () => {
      registerEnterCommand();
      registerUpdateListener();
      registerArrowUpCommand();
      registerArrowDownCommand();
      registerTabCommand();
      registerPasteCommand();
      // removeUpdateListener();
      // window.removeEventListener("insertMention", handleInsertMention);
    };
  }, [editor, searchEmotes, suggestions, selectedIndex, insertEmote]);

  return <EmoteSuggestions suggestions={suggestions} selectedIndex={selectedIndex} onSelect={insertEmote} />;
};

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
        emotePlatform: emote.platform,
      });
    }
  }

  // Sort matches by their position in text
  matches.sort((a, b) => a.match.index - b.match.index);

  for (const { match, emoteId, emoteName, emotePlatform } of matches) {
    const matchText = match[0].trim();
    const startIndex = match.index + match[0].indexOf(matchText);
    const endIndex = startIndex + matchText.length;

    if (startIndex < lastIndex) continue;

    node.splitText(startIndex, endIndex).forEach((part) => {
      if (part.getTextContent() === matchText && part.getParent()) {
        const emoteNode = new EmoteNode(emoteId, emoteName, emotePlatform);
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

const EmoteHandler = ({ chatroomId }) => {
  const [editor] = useLexicalComposerContext();

  const handleEmoteClick = (emote) => {
    editor.focus();
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      if (emote?.platform) {
        const emoteNode = new EmoteNode(emote.id, emote.name, emote.platform);
        selection.insertNodes([emoteNode]);
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
    const chatroom = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)));
    const [showInfoBarTooltip, setShowInfoBarTooltip] = useState(false);
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

    const chatroomMode = useMemo(() => {
      if (chatroom?.chatroomInfo) {
        switch (true) {
          case chatroom?.chatroomInfo?.followers_mode?.enabled:
            return `Followers Only Mode [${convertSecondsToHumanReadable(chatroom?.chatroomInfo?.followers_mode?.min_duration * 60)}]`;
          case chatroom?.chatroomInfo?.subscribers_mode?.enabled:
            return `Subscribers Only Mode`;
          case chatroom?.chatroomInfo?.emotes_mode?.enabled:
            return `Emote Only Mode`;
          case chatroom?.chatroomInfo?.slow_mode?.enabled:
            return `Slow Mode [${convertSecondsToHumanReadable(chatroom?.chatroomInfo?.slow_mode?.message_interval)}]`;
          default:
            return "";
        }
      } else if (chatroom?.initialChatroomInfo) {
        const { followers_mode, subscribers_mode, emotes_mode, slow_mode, message_interval, following_min_duration } =
          chatroom?.initialChatroomInfo?.chatroom;

        switch (true) {
          case followers_mode:
            return `Followers Only Mode [${convertSecondsToHumanReadable(following_min_duration * 60)}]`;
          case subscribers_mode:
            return `Subscribers Only Mode`;
          case emotes_mode:
            return `Emote Only Mode`;
          case slow_mode:
            return `Slow Mode [${convertSecondsToHumanReadable(message_interval)}]`;
          default:
            return "";
        }
      }
    }, [chatroom?.chatroomInfo, chatroom?.initialChatroomInfo]);

    return (
      <div className="chatInputWrapper">
        {chatroomMode && (
          <div className="chatInfoBar">
            <span>{chatroomMode}</span>

            <div className="chatInfoBarIcon">
              <div className={clsx("chatInfoBarIconTooltipContent", showInfoBarTooltip && "show")}>
                {chatroom?.chatroomInfo?.followers_mode?.enabled ||
                  (chatroom?.initialChatroomInfo?.chatroom?.followers_mode && (
                    <div className="chatInfoBarTooltipItem">
                      <span>Followers Only Mode Enabled</span>
                    </div>
                  ))}
                {chatroom?.chatroomInfo?.subscribersmessageHistory_mode?.enabled ||
                  (chatroom?.initialChatroomInfo?.chatroom?.subscribers_mode && (
                    <div className="chatInfoBarTooltipItem">
                      <span>Subscribers Only Mode Enabled</span>
                    </div>
                  ))}
                {chatroom?.chatroomInfo?.emotes_mode?.enabled ||
                  (chatroom?.initialChatroomInfo?.chatroom?.emotes_mode && (
                    <div className="chatInfoBarTooltipItem">
                      <span>Emote Only Mode Enabled</span>
                    </div>
                  ))}
                {chatroom?.chatroomInfo?.slow_mode?.enabled ||
                  (chatroom?.initialChatroomInfo?.chatroom?.slow_mode && (
                    <div className="chatInfoBarTooltipItem">
                      <span>Slow Mode Enabled</span>
                    </div>
                  ))}
              </div>
              <div
                className="chatInfoBarIconTooltip"
                onMouseOver={() => setShowInfoBarTooltip(true)}
                onMouseLeave={() => setShowInfoBarTooltip(false)}>
                <img src={InfoIcon} alt="Info" width={16} height={16} />
              </div>
            </div>
          </div>
        )}
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
