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
  $createParagraphNode,
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
      <div className={clsx("inputSuggestionsWrapper", suggestions?.length && "show")} ref={suggestionsRef}>
        <div className="inputSuggestions">
          {suggestions?.map((emote, i) => {
            return (
              <div
                key={emote?.id}
                ref={selectedIndex === i ? selectedSuggestionRef : null}
                className={clsx("inputSuggestion", selectedIndex === i && "selected")}
                onClick={() => {
                  onSelect(emote);
                }}>
                <div className="inputSuggestionImage">
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
                <div className="inputSuggestionInfo">
                  <span>{emote?.name}</span>
                  <div className="emoteTags">
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
          {suggestions?.map((chatter, i) => {
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
    return (
      prevProps.selectedIndex === nextProps.selectedIndex &&
      prevProps.suggestions === nextProps.suggestions
    );
  },
);


const KeyHandler = ({ chatroomId, onSendMessage }) => {
  const [editor] = useLexicalComposerContext();
  const [emoteSuggestions, setEmoteSuggestions] = useState([]);
  const [chatterSuggestions, setChatterSuggestions] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [selectedEmoteIndex, setSelectedEmoteIndex] = useState(0);
  const [selectedChatterIndex, setSelectedChatterIndex] = useState(0);
  const [position, setPosition] = useState(null);

  const sevenTVEmotes = useChatStore(
    useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.channel7TVEmotes),
  );
  const chatters = useChatStore(
    useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.chatters),
  );
  const kickEmotes = useChatStore(
    useShallow((state) => state.chatrooms.find((room) => room.id === chatroomId)?.emotes),
  );

  const searchEmotes = useCallback(
    (text) => {
      if (!text) return [];
      const transformedText = text.toLowerCase();

      const sevenTvResults =
        sevenTVEmotes?.emote_set?.emotes?.filter((emote) => emote.name.toLowerCase().includes(transformedText))?.slice(0, 10) || [];

      const kickResults =
        kickEmotes?.flatMap((emoteSet) => emoteSet.emotes || [])?.filter((emote) => emote.name.toLowerCase().includes(transformedText))?.slice(0, 10) || [];

      return [...sevenTvResults, ...kickResults];
    },
    [sevenTVEmotes, kickEmotes],
  );

  const searchChatters = useCallback(
    (text) => {
      if (!text) return [];
      const transformedText = text.toLowerCase();

      return chatters?.filter((chatter) => chatter.username.toLowerCase().includes(transformedText))?.slice(0, 10) || [];
    },
    [chatters],
  );

  const insertEmote = useCallback((emote) => {
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
  }, [editor]);

  const insertChatterMention = useCallback( (chatter) => {
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

    setSuggestions2([]);
    setSearchText("");
    setSelectedIndex2(null);
    setPosition(null);
  },
  [editor],
);

  useEffect(() => {
    if (!editor) return;

    const unregisters = [
      editor.registerCommand(KEY_ARROW_UP_COMMAND, (e) => {
        e.preventDefault();
        if (emoteSuggestions?.length) {
          setSelectedEmoteIndex((prev) => (prev <= 0 ? emoteSuggestions.length - 1 : prev - 1));
          return true;
        }
        if (chatterSuggestions?.length) {
          setSelectedChatterIndex((prev) => (prev <= 0 ? chatterSuggestions.length - 1 : prev - 1));
          return true;
        }
        return false;
      }, COMMAND_PRIORITY_HIGH),

      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, (e) => {
        e.preventDefault();
        if (emoteSuggestions?.length) {
          setSelectedEmoteIndex((prev) => (prev === null || prev >= emoteSuggestions.length - 1 ? 0 : prev + 1));
          return true;
        }
        if (chatterSuggestions?.length) {
          setSelectedChatterIndex((prev) => (prev === null || prev >= chatterSuggestions.length - 1 ? 0 : prev + 1));
          return true;
        }
        return false;
      }, COMMAND_PRIORITY_HIGH),

      editor.registerCommand(KEY_ENTER_COMMAND, (e) => {
        if (e.shiftKey) return false;
        e.preventDefault();
        if (emoteSuggestions?.length > 0) {
          insertEmote(emoteSuggestions[selectedEmoteIndex]);
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
        return true;
      }, COMMAND_PRIORITY_HIGH),

      editor.registerCommand(KEY_TAB_COMMAND, (e) => {
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
        return true;
      }, COMMAND_PRIORITY_HIGH),

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
            setChatterSuggestions(results);
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

    return () => {
      unregisters.forEach((unregister) => unregister());
    };
  }, [editor, searchEmotes, searchChatters, emoteSuggestions, chatterSuggestions, insertEmote, insertChatterMention]);

  return (
    <>
      <EmoteSuggestions
        suggestions={emoteSuggestions}
        position={position}
        selectedIndex={selectedEmoteIndex}
        onSelect={insertEmote}
      />
      <ChatterSuggestions
        suggestions={chatterSuggestions}
        selectedIndex={selectedChatterIndex}
        onSelect={insertChatterMention}
      />
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
      if (content.startsWith("/")) {
        const commandParts = content.slice(1).trim().split(" ");
        const command = commandParts[0];
        const usernameInput = commandParts[1]
        if(!usernameInput) return;
        if (command) {
          const username = await window.app.kick.getUserInfo(chatroom.username ,usernameInput);
          if(!username) return;
          const sender = {
            id: username.data.id,
            username: username.data.username,
            slug: username.data.slug,
          };
          window.app.userDialog.open({
            sender: sender,
            chatroomId,
            cords: [0, 300],
          });
          console.log(`Command detected: ${command}, Sender: ${sender}`);
          return;
        }
      }
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
