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
  KEY_ARROW_LEFT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_SPACE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $getNodeByKey,
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
import useChatStore from "../../../providers/ChatProvider";

import EmoteDialogs from "./EmoteDialogs";
import { useShallow } from "zustand/react/shallow";
import { $isEmoteNode, EmoteNode } from "./EmoteNode";
import { kickEmoteInputRegex } from "../../../../../../utils/constants";
import XIcon from "../../../assets/icons/x-bold.svg?asset";
import LockIcon from "../../../assets/icons/lock-simple-fill.svg?asset";
import InfoBar from "./InfoBar";

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
  ({ suggestions, onSelect, selectedIndex, userChatroomInfo }) => {
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
      <div className={clsx("inputSuggestionsWrapper", suggestions?.length && "show")} ref={suggestionsRef}>
        <div className="inputSuggestions">
          {suggestions?.map((emote, i) => {
            return (
              <div
                key={`${emote.id}-${emote.alias}`}
                ref={selectedIndex === i ? selectedSuggestionRef : null}
                disabled={emote?.subscribers_only && !userChatroomInfo?.subscription}
                className={clsx(
                  "inputSuggestion",
                  selectedIndex === i && "selected",
                  emote?.subscribers_only && !userChatroomInfo?.subscription && "emoteItemSubscriberOnly",
                )}
                onClick={() => {
                  if (emote?.subscribers_only && !userChatroomInfo?.subscription) return;
                  onSelect(emote);
                }}>
                <div className="inputSuggestionImage">
                  <img
                    className="emote"
                    src={
                      emote?.platform === "7tv"
                        ? `https://cdn.7tv.app/emote/${emote.id}/1x.webp`
                        : `https://files.kick.com/emotes/${emote.id}/fullsize`
                    }
                    alt={emote?.name}
                    title={emote?.name}
                    width={emote?.platform === "7tv" ? emote?.width : "32px"}
                    height={emote?.platform === "7tv" ? emote?.height : "32px"}
                    loading="lazy"
                    fetchpriority="low"
                    decoding="async"
                  />
                  {emote?.subscribers_only && !userChatroomInfo?.subscription && (
                    <div className="emoteItemSubscriberLock">
                      <img src={LockIcon} alt="Subscriber" width={16} height={16} />
                    </div>
                  )}
                </div>
                <div className="inputSuggestionInfo">
                  <span>{emote?.name}</span>
                  <div className="emoteTags">
                    {emote?.subscribers_only && <span>SUB</span>}
                    {emote?.type && <span>{emote.type?.toUpperCase()}</span>}
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
      prevProps.tabSuggestions === nextProps.tabSuggestions &&
      prevProps.userChatroomInfo === nextProps.userChatroomInfo
    );
  },
);

const ChatterSuggestions = memo(
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
      <div className={clsx("inputSuggestionsWrapper", suggestions?.length && "show")} ref={suggestionsRef}>
        <div className="inputSuggestions">
          {suggestions.map((chatter, i) => {
            return (
              <div
                key={chatter?.id}
                ref={selectedIndex === i ? selectedSuggestionRef : null}
                className={clsx("inputSuggestion", selectedIndex === i && "selected")}
                onClick={() => {
                  onSelect(chatter);
                }}>
                <div className="inputSuggestionInfo">
                  <span>{chatter?.username}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.selectedIndex === nextProps.selectedIndex && prevProps.suggestions === nextProps.suggestions;
  },
);

const KeyHandler = ({ chatroomId, onSendMessage, replyInputData, setReplyInputData, isReplyThread, allStvEmotes }) => {
  const [editor] = useLexicalComposerContext();
  const [emoteSuggestions, setEmoteSuggestions] = useState([]);
  const [chatterSuggestions, setChatterSuggestions] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [tabSuggestions, setTabSuggestions] = useState([]);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  // const [selectedIndex, setSelectedIndex] = useState(0);
  // const [showChatters, setShowChatters] = useState(false);
  const [selectedEmoteIndex, setSelectedEmoteIndex] = useState(0);
  const [selectedChatterIndex, setSelectedChatterIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const [tabCycleInfo, setTabCycleInfo] = useState({ originalWord: "", emoteNodeKey: null });

  const resetTabSuggestions = () => {
    setTabSuggestions([]);
    setSelectedTabIndex(0);
  };

  const userChatroomInfo = useChatStore(
    useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.userChatroomInfo),
  );
  const chatters = useChatStore(useShallow((state) => state.chatters[chatroomId]));
  const kickEmotes = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.emotes));

  const searchEmotes = useCallback(
    (text) => {
      if (!text) return [];
      const transformedText = text.toLowerCase();

      const sevenTvResults =
        allStvEmotes
          ?.flatMap((emoteSet) => emoteSet.emotes)
          ?.filter((emote) => emote.name.toLowerCase().includes(transformedText)) || [];

      const kickResults =
        kickEmotes
          ?.flatMap((emoteSet) => emoteSet.emotes || [])
          ?.filter((emote) => emote.name.toLowerCase().includes(transformedText)) || [];

      const allResults = [...sevenTvResults, ...kickResults];

      // Sort by relevance exact match first
      const sortedResults = allResults.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        if (aName === transformedText && bName !== transformedText) return -1;
        if (bName === transformedText && aName !== transformedText) return 1;

        if (aName.startsWith(transformedText) && !bName.startsWith(transformedText)) return -1;
        if (bName.startsWith(transformedText) && !aName.startsWith(transformedText)) return 1;

        return aName.localeCompare(bName);
      });

      return sortedResults.slice(0, 20);
    },
    [allStvEmotes, kickEmotes],
  );

  const searchChatters = useCallback(
    (text) => {
      if (!text) return [];
      const transformedText = text.toLowerCase();

      return chatters?.filter((chatter) => chatter.username.toLowerCase().includes(transformedText))?.slice(0, 10) || [];
    },
    [chatters],
  );

  const insertEmote = useCallback(
    (emote) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const node = selection.anchor.getNode();
        const textContent = node.getTextContent();
        const cursorOffset = selection.anchor.offset;
        const colonIndex = textContent.indexOf(":");
        if (colonIndex === -1) return;

        const textBefore = textContent.slice(0, colonIndex);
        const textAfter = textContent.slice(cursorOffset);
        node.setTextContent(textBefore);

        if (!emote?.platform) return;
        const emoteNode = new EmoteNode(emote.id, emote.name, emote.platform);
        selection.insertNodes([emoteNode, $createTextNode(" ")]);

        if (textAfter) {
          selection.insertNodes([$createTextNode(textAfter)]);
        }
      });

      setEmoteSuggestions([]);
      setSearchText("");
      setSelectedEmoteIndex(null);
      setPosition(null);
    },
    [editor],
  );

  const insertChatterMention = useCallback(
    (chatter) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const node = selection.anchor.getNode();
        if (!node) return;

        const textContent = node.getTextContent();
        const cursorOffset = selection.anchor.offset;

        // Find last '@' before cursor
        const atIndex = textContent.lastIndexOf("@", cursorOffset);
        if (atIndex === -1) return;

        const textBefore = textContent.slice(0, atIndex);
        const textAfter = textContent.slice(cursorOffset);

        // Replace node text up to '@'
        node.setTextContent(textBefore);

        // Insert @mention and restore following text
        const mentionNode = $createTextNode(`@${chatter.username} `);
        selection.insertNodes([mentionNode]);

        if (textAfter) {
          const afterNode = $createTextNode(textAfter);
          selection.insertNodes([afterNode]);
        }
      });

      setChatterSuggestions([]);
      setSearchText("");
      setSelectedChatterIndex(null);
      setPosition(null);
    },
    [editor],
  );

  useEffect(() => {
    if (!editor) return;

    const registeredCommands = [
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (e) => {
          e.preventDefault();
          if (emoteSuggestions?.length) {
            setSelectedEmoteIndex((prev) => (prev <= 0 ? emoteSuggestions.length - 1 : prev - 1));
            return true;
          }

          if (chatterSuggestions?.length) {
            setSelectedChatterIndex((prev) => (prev <= 0 ? chatterSuggestions.length - 1 : prev - 1));
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

          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),

      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (e) => {
          e.preventDefault();
          if (emoteSuggestions?.length) {
            setSelectedEmoteIndex((prev) => (prev === null || prev >= emoteSuggestions.length - 1 ? 0 : prev + 1));
            return true;
          }

          if (chatterSuggestions?.length) {
            setSelectedChatterIndex((prev) => (prev === null || prev >= chatterSuggestions.length - 1 ? 0 : prev + 1));
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
      ),

      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (e) => {
          if (e.shiftKey) return false;
          e.preventDefault();

          if (emoteSuggestions?.length > 0) {
            const emote = emoteSuggestions[selectedEmoteIndex];
            if (emote?.subscribers_only && !userChatroomInfo?.subscription) return false;

            insertEmote(emote);
            return true;
          }

          if (chatterSuggestions?.length > 0) {
            insertChatterMention(chatterSuggestions[selectedChatterIndex]);
            return true;
          }

          const content = $rootTextContent();
          if (!content.trim()) return true;

          onSendMessage(content);

          editor.update(() => {
            if (!e.ctrlKey) $getRoot().clear();
          });

          // Close reply input if open after entering message
          if (replyInputData) {
            setReplyInputData(null);
          }

          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),

      ...[
        [KEY_ENTER_COMMAND, COMMAND_PRIORITY_CRITICAL],
        [KEY_SPACE_COMMAND, COMMAND_PRIORITY_CRITICAL],
        [KEY_BACKSPACE_COMMAND, COMMAND_PRIORITY_CRITICAL],
      ].map(([command, priority]) =>
        editor.registerCommand(
          command,
          () => {
            resetTabSuggestions();
            return false;
          },
          priority,
        ),
      ),

      editor.registerCommand(
        KEY_TAB_COMMAND,
        (e) => {
          if (e.shiftKey) return false;
          e.preventDefault();
          if (emoteSuggestions?.length) {
            insertEmote(emoteSuggestions[selectedEmoteIndex]);
            return true;
          }
          if (chatterSuggestions?.length) {
            insertChatterMention(chatterSuggestions[selectedChatterIndex]);
            return true;
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return false;
          const anchorNode = selection.anchor.getNode();
          if (!anchorNode) return false;
          editor.update(() => {
            if (tabSuggestions?.length && tabCycleInfo?.emoteNodeKey) {
              const previousEmoteNode = $getNodeByKey(tabCycleInfo.emoteNodeKey);
              if (previousEmoteNode && previousEmoteNode.__type === "emote") {
                previousEmoteNode.remove();
                const nextIndex = (selectedTabIndex + 1) % tabSuggestions.length;
                setSelectedTabIndex(nextIndex);
                const nextEmote = tabSuggestions[nextIndex];
                if (nextEmote?.id && nextEmote?.platform) {
                  const newEmoteNode = new EmoteNode(nextEmote.id, nextEmote.name, nextEmote.platform);
                  selection.insertNodes([newEmoteNode]);
                  setTabCycleInfo((prev) => ({
                    ...prev,
                    emoteNodeKey: newEmoteNode.getKey(),
                  }));
                }
              }

              return;
            }
            const textContent = anchorNode.getTextContent();
            const cursorOffset = selection.anchor.offset;
            const textBeforeCursor = textContent.slice(0, cursorOffset);
            const words = textBeforeCursor.split(/\s+/);

            const currentWord = words[words.length - 1];
            if (!currentWord) return;

            const emotesA = allStvEmotes[0]?.emotes ?? [];
            const emotesB = allStvEmotes[1]?.emotes ?? [];
            const emotesC = allStvEmotes[2]?.emotes ?? [];
            const foundEmotes = [...emotesA, ...emotesB, ...emotesC].filter((emote) =>
              emote.name.toLowerCase().startsWith(currentWord.toLowerCase()),
            );

            if (foundEmotes.length > 0) {
              const startIndex = textBeforeCursor.lastIndexOf(currentWord);
              const endIndex = startIndex + currentWord.length;
              const textBefore = textContent.slice(0, startIndex);
              const textAfter = textContent.slice(endIndex);
              anchorNode.setTextContent(textBefore);
              const emote = foundEmotes[0];
              setTabSuggestions(foundEmotes);
              setSelectedTabIndex(0);
              if (emote?.id && emote?.platform) {
                const emoteNode = new EmoteNode(emote.id, emote.name, emote.platform);
                selection.insertNodes([emoteNode]);
                setTabCycleInfo({
                  originalWord: currentWord,
                  emoteNodeKey: emoteNode.getKey(),
                });
              }
              if (textAfter) {
                selection.insertNodes([$createTextNode(textAfter)]);
              }
            }
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),

      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (e) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return false;

          const anchor = selection.anchor;
          const anchorNode = anchor.getNode();

          // Check if the paragraph contains an emote-like text
          if (anchorNode.getType() === "paragraph") {
            const textContent = anchorNode.getTextContent();
            const emoteMatch = textContent.match(/\[emote:(\d+):([^\]]+)\]/);

            if (emoteMatch) {
              // Find the child nodes of the paragraph
              const children = anchorNode.getChildren();

              children.forEach((child) => {
                if (child.getTextContent().includes(emoteMatch[0])) {
                  child.remove();
                }
              });

              return true;
            }
          }

          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),

      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          const node = selection.anchor.getNode();
          const textContent = node.getTextContent();
          const cursorOffset = selection.anchor.offset;

          const textBeforeCursor = textContent.slice(0, cursorOffset);
          const words = textBeforeCursor.split(/\s+/);
          const currentWord = words[words.length - 1];

          if (currentWord.startsWith(":")) {
            const query = currentWord.slice(1);
            const results = searchEmotes(query);
            setSearchText(query);
            setEmoteSuggestions(results);
            setSelectedEmoteIndex(0);
            setPosition([cursorOffset - query.length, cursorOffset]);
          } else if (currentWord.startsWith("@")) {
            const query = currentWord.slice(1);
            const results = searchChatters(query);
            setSearchText(query);
            setChatterSuggestions(results?.length ? results : null);
            setSelectedChatterIndex(0);
            setPosition([cursorOffset - query.length, cursorOffset]);
          } else {
            setEmoteSuggestions([]);
            setChatterSuggestions([]);
            setSearchText("");
            setSelectedEmoteIndex(null);
            setSelectedChatterIndex(null);
            setPosition(null);
          }
        });
      }),
    ];

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
      registeredCommands.forEach((unregister) => unregister());
    };
  }, [
    editor,
    searchEmotes,
    searchChatters,
    emoteSuggestions,
    chatterSuggestions,
    chatters,
    selectedEmoteIndex,
    selectedChatterIndex,
    insertEmote,
    insertChatterMention,
    isReplyThread,
  ]);

  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") {
        resetTabSuggestions();
      }
    };

    const dom = editor.getRootElement();
    if (dom) {
      dom.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      if (dom) {
        dom.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [editor]);

  return (
    <>
      <EmoteSuggestions
        suggestions={emoteSuggestions}
        position={position}
        selectedIndex={selectedEmoteIndex}
        onSelect={insertEmote}
        userChatroomInfo={userChatroomInfo}
      />

      <ChatterSuggestions suggestions={chatterSuggestions} selectedIndex={selectedChatterIndex} onSelect={insertChatterMention} />
    </>
  );
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

const DraftManager = ({ chatroomId }) => {
  const [editor] = useLexicalComposerContext();
  const saveDraftMessage = useChatStore((state) => state.saveDraftMessage);
  const getDraftMessage = useChatStore((state) => state.getDraftMessage);
  const clearDraftMessage = useChatStore((state) => state.clearDraftMessage);

  // Save draft on editor content changes
  useEffect(() => {
    if (!editor) return;

    const unregister = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const content = $rootTextContent();
        saveDraftMessage(chatroomId, content);
      });
    });

    return unregister;
  }, [editor, chatroomId, saveDraftMessage]);

  // Restore draft when chatroom changes
  useEffect(() => {
    if (!editor) return;

    const draft = getDraftMessage(chatroomId);
    if (draft) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const textNode = $createTextNode(draft);
        const paragraph = $createParagraphNode();
        paragraph.append(textNode);
        root.append(paragraph);
      });
    }
  }, [editor, chatroomId, getDraftMessage]);

  return null;
};

const EmoteHandler = ({ chatroomId, userChatroomInfo }) => {
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

  return <EmoteDialogs chatroomId={chatroomId} handleEmoteClick={handleEmoteClick} userChatroomInfo={userChatroomInfo} />;
};

const initialConfig = {
  namespace: "chat",
  theme,
  onError,
  nodes: [EmoteNode],
  editorState: null,
  editable: true,
  editor: {
    disableSpellcheck: true,
  },
};

const ReplyHandler = ({ chatroomId, replyInputData, setReplyInputData }) => {
  return (
    <>
      {replyInputData && (
        <div className={clsx("replyInputContainer", replyInputData?.sender?.id && "show")}>
          <div className="replyInputBoxHead">
            <span>
              Replying to <b>@{replyInputData?.sender?.username}</b>
            </span>

            <button className="replyInputCloseButton" onClick={() => setReplyInputData(null)}>
              <img src={XIcon} alt="Close" width={16} height={16} />
            </button>
          </div>
          <div className="replyInputBoxContent">
            <span>{replyInputData?.content}</span>
          </div>
        </div>
      )}
    </>
  );
};

const ChatInput = memo(
  ({ chatroomId, isReplyThread = false, replyMessage = {}, settings }) => {
    const sendMessage = useChatStore((state) => state.sendMessage);
    const sendReply = useChatStore((state) => state.sendReply);
    const saveDraftMessage = useChatStore((state) => state.saveDraftMessage);
    const getDraftMessage = useChatStore((state) => state.getDraftMessage);
    const clearDraftMessage = useChatStore((state) => state.clearDraftMessage);
    const chatroom = useChatStore(useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)));
    const personalEmoteSets = useChatStore(useShallow((state) => state.personalEmoteSets));
    const [replyInputData, setReplyInputData] = useState(null);

    const allStvEmotes = useMemo(() => {
      return [...(personalEmoteSets || []), ...(chatroom?.channel7TVEmotes || [])];
    }, [personalEmoteSets, chatroom?.channel7TVEmotes]);

    // Reset selected index when changing chatrooms
    useEffect(() => {
      const history = messageHistory.get(chatroomId);
      setReplyInputData(null);
      if (history) {
        messageHistory.set(chatroomId, {
          ...history,
          selectedIndex: undefined,
        });
      }
    }, [chatroomId]);

    useEffect(() => {
      const cleanup = window.app.reply.onData((data) => {
        setReplyInputData(data);

        setTimeout(() => {
          const editor = document.querySelector(".chatInput");
          if (editor) {
            editor.focus();
          }
        }, 500);
      });

      return () => cleanup();
    }, []);

    const handleSendMessage = useCallback(
      async (content) => {
        if (content.startsWith("/")) {
          const commandParts = content.slice(1).trim().split(" ");
          const command = commandParts[0];
          let usernameInput = commandParts[1];
          if (!usernameInput) return;

          // Strip out the '@' from the username if it exists
          if (usernameInput.startsWith("@")) {
            usernameInput = usernameInput.slice(1);
          }

          if (command) {
            const user = await window.app.kick.getUserChatroomInfo(chatroom.username, usernameInput);
            if (!user?.data?.id) return;

            const sender = {
              id: user.data.id,
              username: user.data.username,
              slug: user.data.slug,
            };

            window.app.userDialog.open({
              sender,
              fetchedUser: user?.data,
              chatroomId,
              sevenTVEmotes: allStvEmotes,
              subscriberBadges: chatroom?.streamerData?.subscriber_badges,
              userChatroomInfo: chatroom?.userChatroomInfo,
              cords: [0, 300],
            });

            return;
          }
        }

        let res;

        // If we are replying to a message, add the original message to the metadata
        if (replyInputData || isReplyThread) {
          const metadata = {
            original_message: {
              id: replyInputData?.id || replyMessage?.original_message?.id,
              content: replyInputData?.content || replyMessage?.original_message?.content,
            },
          };

          res = await sendReply(chatroomId, content, metadata);
        } else {
          res = await sendMessage(chatroomId, content);
        }

        if (res) {
          const history = messageHistory.get(chatroomId);
          messageHistory.set(chatroomId, {
            sentMessages: [...(history?.sentMessages || []), content],
            selectedIndex: undefined,
          });
          // Clear draft message when message is sent successfully
          clearDraftMessage(chatroomId);
        }
      },
      [chatroomId, chatroom, sendMessage, replyInputData, setReplyInputData, replyMessage, clearDraftMessage],
    );

    return (
      <div className="chatInputWrapper">
        <div className="chatInputInfoBar">
          {settings?.chatrooms?.showInfoBar && (
            <InfoBar chatroomInfo={chatroom?.chatroomInfo} initialChatroomInfo={chatroom?.initialChatroomInfo} />
          )}
          <ReplyHandler chatroomId={chatroomId} replyInputData={replyInputData} setReplyInputData={setReplyInputData} />
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
                      spellCheck={false}
                    />
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
            </div>

            <div className={clsx("chatInputActions")}>
              <EmoteHandler chatroomId={chatroomId} userChatroomInfo={chatroom?.userChatroomInfo} />
            </div>
            <KeyHandler
              isReplyThread={isReplyThread}
              chatroomId={chatroomId}
              allStvEmotes={allStvEmotes}
              onSendMessage={(content) => {
                handleSendMessage(content, replyInputData ? "reply" : "message");
              }}
              replyInputData={replyInputData}
              setReplyInputData={setReplyInputData}
            />
            <EmoteTransformer chatroomId={chatroomId} />
            <DraftManager chatroomId={chatroomId} />
            <HistoryPlugin />
            <AutoFocusPlugin />
          </LexicalComposer>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.chatroomId === next.chatroomId &&
    prev.replyMessage === next.replyMessage &&
    prev.settings?.chatrooms?.showInfoBar === next.settings?.chatrooms?.showInfoBar,
);

export default ChatInput;
