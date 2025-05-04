import { kickEmoteRegex, urlRegex, mentionRegex } from "../../../../utils/constants";
import Emote from "../components/Cosmetics/Emote";

const stvEmotes = new Map();
const WHITESPACE_REGEX = /\s+/;

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
    component: ({ match, index }) => (
      <a style={{ color: "#c3d6c9" }} key={`link-${index}`} href={match[0]} target="_blank" rel="noreferrer">
        {match[0]}
      </a>
    ),
  },

  {
    // Mention rule
    regexPattern: mentionRegex,
    component: ({ match, index }) => {
      const { username } = match.groups;
      return (
        <span style={{ color: "#fff", fontWeight: "bold" }} key={`mention-${index}`}>
          {match[0]}
        </span>
      );
    },
  },
];

const getEmoteData = (emoteName, sevenTVEmotes) => {
  if (stvEmotes.has(emoteName)) {
    return stvEmotes.get(emoteName);
  }

  const emote = sevenTVEmotes?.emote_set?.emotes.find((e) => e.name === emoteName);

  if (emote) {
    const emoteData = {
      id: emote.id,
      width: emote?.data?.host?.files[0].width || emote.file.width,
      height: emote?.data?.host?.files[0].height || emote.file.height,
      name: emote.name,
      alias: emote.alias,
      owner: emote.owner,
    };

    // Cache the emote data
    stvEmotes.set(emoteName, emoteData);

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
      allMatches.push({ match, rule });
    }
  }

  // Sort matches by their order of appearance
  allMatches.sort((a, b) => a.index - b.index);

  for (const { match, rule } of allMatches) {
    if (match.index > lastIndex) {
      parts.push(message.content.slice(lastIndex, match.index));
    }

    parts.push(rule.component({ match, index: match.index }));
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < message.content.length) {
    parts.push(message.content.slice(lastIndex));
  }

  if (!sevenTVSettings?.emotes && type !== "dialog") {
    return parts;
  }

  // 7TV emotes
  const finalParts = [];

  parts.forEach((part, i) => {
    if (typeof part !== "string") {
      finalParts.push(part);
      return;
    }

    // Split where there is one or more whitespace
    const textParts = part.split(WHITESPACE_REGEX);
    const lastIndex = textParts.length - 1;
    textParts.forEach((textPart, j) => {
      const emoteData = getEmoteData(textPart, sevenTVEmotes);
      if (emoteData) {
        finalParts.push(<Emote key={`stvEmote-${emoteData.id}-${message.timestamp}-${i}-${j}`} emote={emoteData} type={"stv"} />);
      } else {
        finalParts.push(textPart);
      }

      // Add space between parts, but not after the last one
      if (j < lastIndex) finalParts.push(" ");
    });
  });

  return finalParts;
};
