import { kickEmoteRegex, urlRegex, mentionRegex } from "@utils/constants";
import Emote from "../components/Cosmetics/Emote";
import { parse } from "tldts";

const messageContentCache = new Map();
const MAX_MESSAGE_CACHE_SIZE = 800;

const chatroomEmoteCache = new Map();
const MAX_EMOTE_CACHE_SIZE = 300;
const MAX_EMOTES_PER_ROOM = 50;
const WHITESPACE_REGEX = /(\s+)/;

const clearEmoteCache = () => {
  if (chatroomEmoteCache.size > MAX_EMOTE_CACHE_SIZE) {
    const entries = Array.from(chatroomEmoteCache.entries());
    chatroomEmoteCache.clear();
    entries.slice(-MAX_EMOTE_CACHE_SIZE / 2).forEach(([key, value]) => {
      chatroomEmoteCache.set(key, value);
    });
  }
};

// Export function to clear specific chatroom emote cache
export const clearChatroomEmoteCache = (chatroomId) => {
  if (chatroomEmoteCache.has(chatroomId)) {
    chatroomEmoteCache.delete(chatroomId);
    console.log(`[MessageParser] Cleared emote cache for chatroom ${chatroomId}`);
  }
};

// Export function to clear all emote caches
export const clearAllEmoteCaches = () => {
  chatroomEmoteCache.clear();
  console.log(`[MessageParser] Cleared all emote caches`);
};

const clearMessageCache = () => {
  if (messageContentCache.size > MAX_MESSAGE_CACHE_SIZE) {
    const entries = Array.from(messageContentCache.entries());
    messageContentCache.clear();
    entries.slice(-MAX_MESSAGE_CACHE_SIZE / 2).forEach(([key, value]) => {
      messageContentCache.set(key, value);
    });
  }
};

const rules = [
  {
    // Kick Emote Rule
    regexPattern: kickEmoteRegex,
    component: ({ match, index }) => {
      const { id, name } = match.groups;

      return (
        <Emote
          key={`kickEmote-${id}-${index}`}
          emote={{
            id,
            name,
            width: 28,
            height: 28,
          }}
          type={"kick"}
        />
      );
    },
  },
  {
    // URL rule
    regexPattern: urlRegex,
    component: ({ match, index }) => {
      const url = match[0];
      const { isIcann, domain } = parse(url);

      if (!isIcann || !domain) return url;

      return (
        <a style={{ color: "#c3d6c9" }} key={`link-${index}`} href={url} target="_blank" rel="noreferrer">
          {url}
        </a>
      );
    },
  },

  {
    // Mention rule
    regexPattern: mentionRegex,
    component: ({ match, index, chatroomId, chatroomName, userChatroomInfo, type, subscriberBadges }) => {
      const { username } = match.groups;

      if (type === "minified" || type === "reply") {
        return (
          <span style={{ color: "#fff", fontWeight: "bold" }} key={`mention-${index}-${username}`}>
            {match[0]}
          </span>
        );
      }

      return (
        <span
          onClick={async () => {
            const user = await window.app.kick.getUserChatroomInfo(chatroomName, username);
            if (!user?.data?.id) return;

            const sender = {
              id: user.data.id,
              username: user.data.username,
              slug: user.data.slug,
            };

            await window.app.userDialog.open({
              sender,
              fetchedUser: user?.data,
              subscriberBadges,
              chatroomId,
              userChatroomInfo,
              cords: [0, 300],
            });
          }}
          style={{ color: "#fff", fontWeight: "bold", cursor: "pointer" }}
          key={`mention-${index}-${username}`}>
          {match[0]}
        </span>
      );
    },
  },
];

const getEmoteData = (emoteName, sevenTVEmotes, chatroomId) => {
  if (!chatroomEmoteCache?.has(chatroomId)) {
    chatroomEmoteCache.set(chatroomId, new Map());
  }

  const roomEmotes = chatroomEmoteCache.get(chatroomId);

  // Limit per-room cache size
  if (roomEmotes.size > MAX_EMOTES_PER_ROOM) {
    const entries = Array.from(roomEmotes.entries());
    roomEmotes.clear();
    entries.slice(-MAX_EMOTES_PER_ROOM / 2).forEach(([k, v]) => {
      roomEmotes.set(k, v);
    });
  }

  if (roomEmotes?.has(emoteName)) {
    return roomEmotes.get(emoteName);
  }

  // Flatten all emote sets and search through them
  const allEmotes = sevenTVEmotes?.flatMap((set) => set?.emotes || []) || [];
  const emote = allEmotes.find((e) => e.name === emoteName);

  if (emote) {
    const emoteData = {
      id: emote.id,
      flags: emote.flags,
      isZeroWidth: emote.flags !== 0,
      width: emote.file?.width || 28,
      height: emote.file?.height || 28,
      name: emote.name,
      alias: emote.alias,
      owner: emote.owner,
      added_timestamp: emote.added_timestamp,
      listed: emote.data?.listed !== false,
      platform: "7tv",
    };

    // Cache the emote data
    roomEmotes.set(emoteName, emoteData);

    return emoteData;
  }

  return null;
};

// Main parsing function (extracted for caching)
const parseMessageContent = ({
  message,
  sevenTVEmotes,
  sevenTVSettings,
  subscriberBadges,
  type,
  chatroomId,
  chatroomName,
  userChatroomInfo,
}) => {
  if (!message?.content) return [];
  const parts = [];
  let lastIndex = 0;

  const allMatches = [];

  for (const rule of rules) {
    for (const match of message.content.matchAll(rule.regexPattern)) {
      allMatches.push({
        match,
        rule,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Sort matches by their order of appearance
  allMatches.sort((a, b) => a.start - b.start);

  for (const { match, rule, start, end } of allMatches) {
    // Add any text before this match
    if (start > lastIndex) {
      parts.push(message.content.slice(lastIndex, start));
    }

    // Add the matched component
    if (rule.regexPattern === mentionRegex && type !== "minified") {
      parts.push(
        rule.component({
          match,
          index: start,
          type,
          chatroomId,
          chatroomName,
          userChatroomInfo,
          subscriberBadges,
        }),
      );
    } else {
      parts.push(
        rule.component({
          match,
          index: start,
          type,
        }),
      );
    }

    lastIndex = end;
  }

  // Add remaining text
  if (lastIndex < message.content.length) {
    parts.push(message.content.slice(lastIndex));
  }

  // 7TV emotes
  const finalParts = [];
  let pendingTextParts = [];
  let lastEmoteComponent = null;

  parts.forEach((part, i) => {
    if (typeof part !== "string") {
      // if there's a text string combine and add it before the non text part
      if (pendingTextParts.length) {
        finalParts.push(<span key={`text-${i}`}>{pendingTextParts.join("")}</span>);
        pendingTextParts = [];
      }

      finalParts.push(part);
      lastEmoteComponent = null;
      return;
    }

    // Split with capture groups to preserve whitespace
    const textParts = part.split(WHITESPACE_REGEX);
    textParts.forEach((textPart, j) => {
      if (!textPart) return;

      // If this part is whitespace, add it to pending parts
      if (WHITESPACE_REGEX.test(textPart)) {
        pendingTextParts.push(textPart);
        return;
      }

      if (sevenTVSettings?.emotes) {
        const emoteData = getEmoteData(textPart, sevenTVEmotes, chatroomId || message?.chatroom_id);

        if (emoteData) {
          // Check if this is a zero width emote and we have a previous emote
          if (emoteData.isZeroWidth && lastEmoteComponent) {
            const prevEmoteProps = lastEmoteComponent.props;
            const updatedOverlaid = {
              ...prevEmoteProps.overlaidEmotes,
              [emoteData.name]: emoteData,
            };

            // Update the previous emote component with overlaid emote
            const updatedEmoteComponent = (
              <Emote
                key={lastEmoteComponent.key}
                emote={prevEmoteProps.emote}
                type={prevEmoteProps.type}
                overlaidEmotes={Object.values(updatedOverlaid)}
              />
            );

            // Replace the last emote component in finalParts
            let lastEmoteIndex = finalParts.length - 1;
            let searchIndex = lastEmoteIndex;

            while (searchIndex >= 0 && finalParts[searchIndex] !== lastEmoteComponent) {
              searchIndex--;
            }
            lastEmoteIndex = searchIndex;

            if (lastEmoteIndex >= 0) {
              finalParts[lastEmoteIndex] = updatedEmoteComponent;
              lastEmoteComponent = updatedEmoteComponent;
            }

            return;
          }

          // if there's a text string combine and add it before the emote part
          if (pendingTextParts.length) {
            finalParts.push(<span key={`text-${i}-${j}`}>{pendingTextParts.join("")}</span>);
            pendingTextParts = [];
          }

          const emoteComponent = (
            <Emote
              key={`stvEmote-${emoteData.id}-${message.timestamp}-${i}-${j}`}
              emote={emoteData}
              type={"stv"}
              overlaidEmotes={[]}
            />
          );

          finalParts.push(emoteComponent);
          lastEmoteComponent = emoteComponent;
        } else {
          pendingTextParts.push(textPart);
          if (textPart.trim()) lastEmoteComponent = null; // Reset on non-empty text
        }
      } else {
        pendingTextParts.push(textPart);
        if (textPart.trim()) lastEmoteComponent = null; // Reset on non-empty text
      }
    });
  });

  // Add any remaining text
  if (pendingTextParts.length > 0) {
    finalParts.push(<span key="final-text">{pendingTextParts.join("")}</span>);
  }

  return finalParts;
};

export const MessageParser = ({
  message,
  sevenTVEmotes,
  sevenTVSettings,
  subscriberBadges,
  type,
  chatroomId,
  chatroomName,
  userChatroomInfo,
}) => {
  const cacheKey = `${message?.id}-${message?.content}-${sevenTVSettings?.emotes}-${type}`;

  if (messageContentCache.has(cacheKey)) {
    return messageContentCache.get(cacheKey);
  }

  const parsed = parseMessageContent({
    message,
    sevenTVEmotes,
    sevenTVSettings,
    subscriberBadges,
    type,
    chatroomId,
    chatroomName,
    userChatroomInfo,
  });

  messageContentCache.set(cacheKey, parsed);

  // Cleanup caches
  clearMessageCache();
  clearEmoteCache();

  return parsed;
};
