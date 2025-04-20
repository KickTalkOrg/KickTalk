import { kickEmoteRegex, urlRegex } from "../../../../utils/constants";
const rules = [
  {
    // Kick Emote Rule
    regexPattern: kickEmoteRegex,
    component: ({ match, index }) => {
      const { id, name } = match.groups;
      return (
        <div key={`kick-emote-${id}-${index}`} onClick={() => showEmoteDialog(id)}>
        <img
          className="kick-emote emote"
          title={name}
          src={`https://files.kick.com/emotes/${id}/fullsize`}
          alt={name}
          loading="lazy"
        />
        </div>
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

export const MessageParser = ({ message, sevenTVEmotes }) => {
  const stvEmotes = new Map();
  let finalParts = [];

  for (const emote of sevenTVEmotes.emote_set.emotes) {
    const alias = emote.alias ?? emote.name;
    const emoteWidth = emote.data.host.files[0].width; 
    const emoteHeight = emote.data.host.files[0].height;
    const emoteData ={
      emoteId : emote.id, 
      emoteWidth: emoteWidth, 
      emoteHeight: emoteHeight
    }
    stvEmotes.set(alias, emoteData);
  }

  // const message = {
  //   content: "test _+[emote:39251:beeBobble]99 SoyShaker sdsd SoyShaker https://google.com d",
  // };

  const parts = [];
  const content = message.content;
  let lastIndex = 0;

  const allMatches = [];

  // Find all matches for each rule
  rules.forEach((rule) => {
    // Find all matches for this rule
    for (const match of content.matchAll(rule.regexPattern)) {
      // Add the match to the list of all matches
      allMatches.push({
        match,
        rule,
      });
    }
  });

  // Sort matches by their order of appearance
  allMatches.sort((a, b) => a.index - b.index);

  allMatches.forEach(({ match, rule }, i) => {
    const startOfMatch = match.index;
    const endOfMatch = startOfMatch + match[0].length;

    // Push plain text before this match in the message
    if (startOfMatch > lastIndex) {
      parts.push(content.slice(lastIndex, startOfMatch));
    }

    // Push the matched component
    parts.push(rule.component({ match, index: i }));

    lastIndex = endOfMatch;
  });

  // Push any text that comes after the last matched item
  if (lastIndex < message.content.length) {
    parts.push(message.content.slice(lastIndex));
  }

  parts.forEach((part, i) => {
    if (typeof part === "string") {
      const possibleEmotes = part.split(/(\s+)/);

      possibleEmotes.forEach((possibleEmote, j) => {
        if (stvEmotes.has(possibleEmote)) {
          const emoteId = stvEmotes.get(possibleEmote).emoteId;
          const emoteUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
          const emoteWidth = stvEmotes.get(possibleEmote).emoteWidth;
          const emoteHeight = stvEmotes.get(possibleEmote).emoteHeight;
          finalParts.push(
            <img
              key={`stv-emote-${emoteId}-${i}-${j}`}
              className="stvEmote emote"
              title={possibleEmote}
              src={emoteUrl}
              alt={possibleEmote}
              loading="lazy"
              width={emoteWidth}
              height={emoteHeight}
            />,
          );

          console.log("Found emote", possibleEmote);
        } else {
          finalParts.push(possibleEmote);
        }
      });
    } else {
      finalParts.push(part);
      console.log("Not Emote", part);
    }
  });

  console.log(finalParts);
  return finalParts;
};
