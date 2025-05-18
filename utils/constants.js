export const urlRegex = /(https:\/\/[www.]?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
export const kickEmoteRegex = /\[emote:(?<id>\d+)[:]?(?<name>[a-zA-Z0-9-_!]*)[:]?\]/g;
export const kickEmoteInputRegex = /(?:^|\s)(:(?<emoteCase1>\w{3,}):)|(?:^|\s)(?<emoteCase2>\w{2,})\b/g;
export const mentionRegex = /(?:^|\s)(@(?<username>[a-zA-Z0-9_]{3,})[,.]?)(?=\s|$)/g;
export const kickClipRegex = /^https?:\/\/(www\.)?kick\.com\/.*\/clips\/.*/i;

const kickTalkCDN = "https://cdn.kicktalk.app/Badges";

export const kickBadgeMap = {
  subscriber: (badge, subscriberBadges) => {
    if (!subscriberBadges?.length) {
      return {
        src: `${kickTalkCDN}/subscriber.svg`,
        title: `${badge.text}-${badge.count}`,
        info: `${badge.count} Month Subscriber`,
      };
    }

    const badgeData = subscriberBadges.sort((a, b) => b.months - a.months).find((b) => badge.count >= b.months);
    return badgeData
      ? {
          src: badgeData.badge_image.src,
          title: `${badge.text}-${badge.count}`,
          info: `${badge.count} Month Subscriber`,
        }
      : null;
  },
  bot: { src: `${kickTalkCDN}/bot.svg`, title: "Bot", info: "Bot" },
  moderator: { src: `${kickTalkCDN}/moderator.svg`, title: "Moderator", info: "Moderator" },
  broadcaster: { src: `${kickTalkCDN}/broadcaster.svg`, title: "Broadcaster", info: "Broadcaster" },
  vip: { src: `${kickTalkCDN}/vip.svg`, title: "VIP", info: "VIP" },
  og: { src: `${kickTalkCDN}/og.svg`, title: "OG", info: "OG" },
  founder: { src: `${kickTalkCDN}/founder.svg`, title: "Founder", info: "Founder" },
  sub_gifter: { src: `${kickTalkCDN}/subgifter1.svg`, title: "Sub Gifter", info: "Sub gifter" },
  subgifter25: { src: `${kickTalkCDN}/subgifter25.svg`, title: "Sub Gifter", info: "Sub gifter" },
  subgifter50: { src: `${kickTalkCDN}/subgifter50.svg`, title: "Sub Gifter", info: "Sub gifter" },
  subgifter100: { src: `${kickTalkCDN}/subgifter100.svg`, title: "Sub Gifter", info: "Sub gifter" },
  subgifter200: { src: `${kickTalkCDN}/subgifter200.svg`, title: "Sub Gifter", info: "Sub gifter" },
  staff: { src: `${kickTalkCDN}/staff.svg`, title: "Staff", info: "Staff" },
  trainwreckstv: {
    src: `${kickTalkCDN}/trainwreckstv.svg`,
    title: "Trainwreckstv",
    info: "Trainwreckstv",
  },
  verified: { src: `${kickTalkCDN}/verified.svg`, title: "Verified", info: "Verified" },
  sidekick: { src: `${kickTalkCDN}/sidekick.svg`, title: "Sidekick", info: "Sidekick" },
};

// TODO: Finalize all possible errors returned
export const CHAT_ERROR_CODES = {
  ["FOLLOWERS_ONLY_ERROR"]: "You must be following this channel to send messages.",
  ["Unauthorized"]: "You must login to chat.",
  ["BANNED_ERROR"]: "You are banned or temporarily banned from this channel.",
  ["SLOW_MODE_ERROR"]: "Chatroom is in slow mode. Slow down your messages.",
  ["NO_LINKS_ERROR"]: "You are not allowed to send links in this chatroom.",
  ["SUBSCRIBERS_ONLY_EMOTE_ERROR"]: "Message contains subscriber only emote.",
  ["EMOTES_ONLY_ERROR"]: "Chatroom is in emote only mode. Only emotes are allowed.",
  ["SUBSCRIBERS_ONLY_ERROR"]: "Chatroom is in subscribers only mode.",
  ["ORIGINAL_MESSAGE_NOT_FOUND_ERROR"]: "Message cannot be replied to.",
  ["CHAT_RATE_LIMIT_ERROR"]: "Rate limit triggered. Slow down.",
};
