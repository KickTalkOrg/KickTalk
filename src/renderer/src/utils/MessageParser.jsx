import { kickEmoteRegex, urlRegex, mentionRegex, kickClipRegex } from "../../../../utils/constants";
import Emote from "../components/Cosmetics/Emote";
import LinkPreview from "../components/Cosmetics/LinkPreview";

const chatroomEmotes = new Map();
const WHITESPACE_REGEX = /\s+/;

const rules = [
  {
    // Kick Emote Rule
    regexPattern: kickEmoteRegex,
    component: ({ match, index, type }) => {
      const { id, name } = match.groups;

      if (type === "reply") {
        return name;
      }

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

      // if (kickClipRegex.test(url)) {
      //   return <LinkPreview key={`link-${index}`} url={url} />;
      // }

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
    component: ({ match, index }) => {
      return (
        <span style={{ color: "#fff", fontWeight: "bold" }} key={`mention-${index}`}>
          {match[0]}
        </span>
      );
    },
  },
];

const getEmoteData = (emoteName, sevenTVEmotes, chatroomId) => {
  if (!chatroomEmotes?.has(chatroomId)) {
    chatroomEmotes.set(chatroomId, new Map());
  }

  const roomEmotes = chatroomEmotes.get(chatroomId);

  if (roomEmotes?.has(emoteName)) {
    return roomEmotes.get(emoteName);
  }

  // Flatten all emote sets and search through them
  const allEmotes = sevenTVEmotes?.flatMap((set) => set?.emotes || []) || [];
  const emote = allEmotes.find((e) => e.name === emoteName);

  if (emote) {
    const emoteData = {
      id: emote.id,
      width: emote?.data?.host?.files[0]?.width || emote.file?.width,
      height: emote?.data?.host?.files[0]?.height || emote.file?.height,
      name: emote.name,
      alias: emote.alias,
      owner: emote.owner,
      platform: "7tv",
    };

    // Cache the emote data
    roomEmotes.set(emoteName, emoteData);

    return emoteData;
  }

  return null;
};

export const MessageParser = ({ message, sevenTVEmotes, sevenTVSettings, type }) => {
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
    parts.push(rule.component({ match, index: start, type }));

    lastIndex = end;
  }

  // Add remaining text
  if (lastIndex < message.content.length) {
    parts.push(message.content.slice(lastIndex));
  }

  // 7TV emotes
  const finalParts = [];
  let pendingTextParts = [];

  parts.forEach((part, i) => {
    if (typeof part !== "string") {
      // if there's a text string combine and add it before the non text part
      if (pendingTextParts.length) {
        finalParts.push(<span key={`text-${i}`}>{pendingTextParts.join(" ")}</span>);
        pendingTextParts = [];
      }

      finalParts.push(part);
      return;
    }

    // Split where there is one or more whitespace
    const textParts = part.split(WHITESPACE_REGEX);
    textParts.forEach((textPart, j) => {
      if (sevenTVSettings?.emotes) {
        const emoteData = getEmoteData(textPart, sevenTVEmotes, message?.chatroom_id);

        if (emoteData) {
          // if there's a text string combine and add it before the emote part
          if (pendingTextParts.length) {
            finalParts.push(<span key={`text-${i}-${j}`}>{pendingTextParts.join(" ")}</span>);
            pendingTextParts = [];
          }

          finalParts.push(
            " ",
            <Emote key={`stvEmote-${emoteData.id}-${message.timestamp}-${i}-${j}`} emote={emoteData} type={"stv"} />,
            " ",
          );
        } else {
          pendingTextParts.push(textPart);
        }
      } else {
        pendingTextParts.push(textPart);
      }
    });
  });

  // Add any remaining text
  if (pendingTextParts.length > 0) {
    finalParts.push(<span key="final-text">{pendingTextParts.join(" ")}</span>);
  }

  return finalParts;
};
