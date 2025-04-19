import { kickEmoteRegex, urlRegex } from "../../../../utils/constants";


const rules = [
  {
    // Kick Emote Rule
    regexPattern: kickEmoteRegex,
    component: ({ groups: { id, name }, index }) => (
      <img
        key={`emote-${id}-${index}`}
        className="kickEmote emote"
        title={name}
        src={`https://files.kick.com/emotes/${id}/fullsize`}
        alt={name}
        loading="lazy"
      />
    ),
  },
  {
    // URL rule
    regexPattern: urlRegex,
    component: (match) => (
      <a key={`link-${match.index}`} href={match[0]} target="_blank" rel="noreferrer">
        {match[0]}
      </a>
    ),
  },
];

export const MessageParser = ({ message, sevenTVEmotes }) => {
  const parts = [];
  let lastIndex = 0;
  let currentText = message.content;

  let allMatches = [];
  rules.forEach((rule) => {
    const matches = [...currentText.matchAll(rule.regexPattern)];
    matches.forEach((match) => {
      allMatches.push({
        match,
        rule,
      });
    });
  });

  allMatches.sort((a, b) => a.match.index - b.match.index);


  console.log(allMatches);
  // handle matches in order
  allMatches.forEach(({ match, rule }) => {
    if (match.index > lastIndex) {
      parts.push(currentText.slice(lastIndex, match.index));
    }

    parts.push(rule.component(match, sevenTVEmotes));
    lastIndex = match.index + match[0].length;
  });

  // add remaining text
  if (lastIndex < currentText.length) {
    // Handle 7TV emotes
    const emotes = sevenTVEmotes.emote_set.emotes;
    const possibleEmotes = currentText.split(" ");
    let emoteFound = false;
    console.log(possibleEmotes); 
    possibleEmotes.forEach((possibleEmote) => {
      emotes.forEach((emoteData) => {
        if (possibleEmote === emoteData.name) {
          emoteFound = true;
          console.log("Found emote match", emoteData.name);
          const emoteName = emoteData.name;
          parts.push(
            <img
              key={`7tv-emote-${emoteData.id}`}
              className="emote"
              title={emoteName}
              src={`https://cdn.7tv.app/emote/${emoteData.id}/1x.webp`}
              alt={emoteName}
              loading="lazy"
            />
          );
          return;
        }
      });
    });
    if (!emoteFound) {
      parts.push(
        <span key={`text-${message.id}`}>
          {currentText.slice(lastIndex)}
        </span>
      );
    }
  }

  return parts;
};
