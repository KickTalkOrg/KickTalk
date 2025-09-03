// export const urlRegex = /(https:\/\/[www.]?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
export const urlRegex = /(https?:\/\/[^\s]+)/g;
export const kickEmoteRegex = /\[emote:(?<id>\d+)[:]?(?<name>[a-zA-Z0-9-_!]*)[:]?\]/g;
export const kickEmoteInputRegex = /(?:^|\s)(:(?<emoteCase1>\w{3,}):)|(?:^|\s)(?<emoteCase2>\w{2,})\b/g;
export const mentionRegex = /(?:^|[^A-Za-z0-9_-])(@(?<username>[A-Za-z0-9_-]{3,}))(?:[,.])?(?![A-Za-z0-9_-])/g;
export const kickClipRegex = /^https?:\/\/(www\.)?kick\.com\/.*\/clips\/.*/i;

// Chat settings
export const DEFAULT_CHAT_HISTORY_LENGTH = 400;

const kickTalkCDN = "https://cdn.kicktalk.app";

export const kickBadgeMap = {
  subscriber: (badge, subscriberBadges) => {
    if (!subscriberBadges?.length) {
      return {
        src: `${kickTalkCDN}/Badges/subscriber.svg`,
        title: `${badge.count} Month ${badge.text}`,
        info: `${badge.count} Month Subscriber`,
        platform: "Kick",
      };
    }

    const badgeData = subscriberBadges.sort((a, b) => b.months - a.months).find((b) => badge.count >= b.months);
    return badgeData
      ? {
          src: badgeData.badge_image.src,
          title: `${badge.count} Month ${badge.text}`,
          info: `${badge.count} Month Subscriber`,
          platform: "Kick",
        }
      : null;
  },
  bot: { src: `${kickTalkCDN}/Badges/bot.svg`, title: "Bot", info: "Bot", platform: "Kick" },
  moderator: { src: `${kickTalkCDN}/Badges/moderator.svg`, title: "Moderator", info: "Moderator", platform: "Kick" },
  broadcaster: { src: `${kickTalkCDN}/Badges/broadcaster.svg`, title: "Broadcaster", info: "Broadcaster", platform: "Kick" },
  vip: { src: `${kickTalkCDN}/Badges/vip.svg`, title: "VIP", info: "VIP", platform: "Kick" },
  og: { src: `${kickTalkCDN}/Badges/og.svg`, title: "OG", info: "OG", platform: "Kick" },
  founder: { src: `${kickTalkCDN}/Badges/founder.svg`, title: "Founder", info: "Founder", platform: "Kick" },
  sub_gifter: { src: `${kickTalkCDN}/Badges/subgifter1.svg`, title: "Sub Gifter", info: "Sub gifter", platform: "Kick" },
  subgifter25: { src: `${kickTalkCDN}/Badges/subgifter25.svg`, title: "Sub Gifter", info: "Sub gifter", platform: "Kick" },
  subgifter50: { src: `${kickTalkCDN}/Badges/subgifter50.svg`, title: "Sub Gifter", info: "Sub gifter", platform: "Kick" },
  subgifter100: { src: `${kickTalkCDN}/Badges/subgifter100.svg`, title: "Sub Gifter", info: "Sub gifter", platform: "Kick" },
  subgifter200: { src: `${kickTalkCDN}/Badges/subgifter200.svg`, title: "Sub Gifter", info: "Sub gifter", platform: "Kick" },
  staff: { src: `${kickTalkCDN}/Badges/staff.svg`, title: "Staff", info: "Staff", platform: "Kick" },
  trainwreckstv: {
    src: `${kickTalkCDN}/Badges/trainwreckstv.svg`,
    title: "Trainwreckstv",
    info: "Trainwreckstv",
    platform: "Kick",
  },
  verified: { src: `${kickTalkCDN}/Badges/verified.svg`, title: "Verified", info: "Verified", platform: "Kick" },
  sidekick: { src: `${kickTalkCDN}/Badges/sidekick.svg`, title: "Sidekick", info: "Sidekick", platform: "Kick" },
  donator: { src: `${kickTalkCDN}/Donator.webp`, title: "KickTalk Supporter", info: "KickTalk Supporter", platform: "KickTalk" },
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
  ["ORIGINAL_MESSAGE_NOT_FOUND_ERROR"]: "Message cannot be replied to. It is old or no longer exists.",
  ["CHAT_RATE_LIMIT_ERROR"]: "Rate limit triggered. Slow down.",
  ["PINNED_MESSAGE_NOT_FOUND_ERROR"]: "Cannot pin message. It is old or no longer exists.",

  // Broadcaster Actions
  ["USER_NOT_MODERATOR"]: "Unable to remove moderator from user. User is not a moderator.",
  ["USER_NOT_VIP"]: "Unable to remove VIP from user. User is not a VIP.",
  ["USER_NOT_OG"]: "Unable to remove OG from user. User is not an OG.",

  // Mod Actions
};
