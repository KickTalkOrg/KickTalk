import { kickEmoteRegex, urlRegex } from "../../../../utils/constants";

const stvEmotes = new Map();
const WHITESPACE_REGEX = /\s+/;

const rules = [
  {
    // Kick Emote Rule
    regexPattern: kickEmoteRegex,
    component: ({ match, index }) => {
      const { id, name } = match.groups;
      const emoteUrl = `https://files.kick.com/emotes/${id}/fullsize`;

      return (
        <img
          key={`kickEmote-${id}-${index}`}
          className="kickEmote emote"
          title={name}
          src={emoteUrl}
          alt={name}
          loading="lazy"
          fetchpriority="low"
          decoding="async"
        />
      );
    },
  },
  {
    // URL rule
    regexPattern: urlRegex,
    component: ({ match, index }) => (
      <a key={`link-${index}`} href={match[0]} target="_blank" rel="noreferrer">
        {match[0]}
      </a>
    ),
  },
];

const getEmoteData = (emoteName, sevenTVEmotes) => {
  if (stvEmotes.has(emoteName)) {
    return stvEmotes.get(emoteName);
  }

  const emote = sevenTVEmotes?.emote_set?.emotes.find((e) => (e.alias ?? e.name) === emoteName);

  if (emote) {
    const emoteData = {
      id: emote.id,
      width: emote?.data?.host?.files[0].width || emote.width,
      height: emote?.data?.host?.files[0].height || emote.height,
    };

    // Cache the emote data
    stvEmotes.set(emoteName, emoteData);

    return emoteData;
  }

  return null;
};

export const MessageParser = ({ message, sevenTVEmotes }) => {
  if (!message?.content) return [];

  const parts = [];
  const finalParts = [];
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

  // 7TV emotes

  parts.forEach((part, i) => {
    if (typeof part !== "string") {
      finalParts.push(part);
      return;
    }

    // Split where there is one or more whitespace
    const textParts = part.split(WHITESPACE_REGEX);
    const lastIndex = textParts.length - 1;

    textParts.forEach((textPart) => {
      const emoteData = getEmoteData(textPart, sevenTVEmotes);
      if (emoteData) {
        finalParts.push(
          <img
            key={`stvEmote-${emoteData.id}-${message.timestamp}-${i}`}
            srcSet={`https://cdn.7tv.app/emote/${emoteData.id}/1x.webp 1x, https://cdn.7tv.app/emote/${emoteData.id}/2x.webp 2x`}
            alt={textPart}
            title={textPart}
            loading="lazy"
            width={emoteData.width}
            height={emoteData.height}
          />,
        );
      } else {
        finalParts.push(textPart);
      }

      // Add space between parts, but not after the last one
      if (i < lastIndex) finalParts.push(" ");
    });
  });

  return finalParts;
};
