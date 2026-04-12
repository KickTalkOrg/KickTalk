import { useMemo, useEffect, useState } from "react";
import useChatStore from "../../../providers/ChatProvider";
import { useShallow } from "zustand/react/shallow";

const kickEmoteLoadInFlight = new Set();
const subscribedEmoteFetchInFlight = new Map();
const SUBSCRIBED_EMOTES_CACHE_TTL_MS = 5 * 60 * 1000;
let subscribedEmotesCache = {
  fetchedAt: 0,
  sets: [],
};
let subscribedEmotesPromise = null;

const normalizeSubscriptionStatus = (subscription) => {
  if (!subscription) return false;

  if (typeof subscription === "boolean") {
    return subscription;
  }

  if (typeof subscription === "string") {
    return subscription.toLowerCase() === "active" || subscription.toLowerCase() === "subscribed";
  }

  if (typeof subscription === "number") {
    return subscription > 0;
  }

  if (typeof subscription === "object") {
    if (typeof subscription.is_subscribed === "boolean") {
      return subscription.is_subscribed;
    }

    if (typeof subscription.active === "boolean") {
      return subscription.active;
    }

    if (typeof subscription.status === "string") {
      const normalized = subscription.status.toLowerCase();
      return normalized === "active" || normalized === "subscribed" || normalized === "renewed";
    }

    if (typeof subscription.state === "string") {
      const normalized = subscription.state.toLowerCase();
      return normalized === "active" || normalized === "subscribed";
    }

    if (typeof subscription.current_state === "string") {
      const normalized = subscription.current_state.toLowerCase();
      return normalized === "active" || normalized === "subscribed";
    }

    // Some Kick responses provide timestamps like `ends_at` when still active.
    if (subscription.ends_at) {
      const endsAt = new Date(subscription.ends_at);
      if (!Number.isNaN(endsAt.getTime())) {
        return endsAt.getTime() > Date.now();
      }
    }

    return false;
  }

  return false;
};

const isOwnChannelRoom = (room) => {
  const kickId = localStorage.getItem("kickId");
  const kickUsername = (localStorage.getItem("kickUsername") || "").toLowerCase();
  const streamerUserId = String(
    room?.streamerData?.user_id || room?.streamerData?.user?.id || "",
  );
  const roomSlug = String(
    room?.streamerData?.slug || room?.slug || room?.username || "",
  ).toLowerCase();

  if (kickId && streamerUserId && String(kickId) === streamerUserId) {
    return true;
  }

  if (kickUsername && roomSlug && kickUsername === roomSlug) {
    return true;
  }

  return false;
};

const extractSubscriptionItems = (payload) => {
  const buckets = [payload, payload?.data];
  const items = [];

  buckets.forEach((bucket) => {
    if (!bucket) return;

    if (Array.isArray(bucket)) {
      items.push(...bucket);
      return;
    }

    [
      "subscriptions",
      "new_subscriptions",
      "gifts",
      "new_gifts",
      "gift_subscriptions",
      "new_gift_subscriptions",
    ].forEach((key) => {
      if (Array.isArray(bucket?.[key])) {
        items.push(...bucket[key]);
      }
    });
  });

  return items;
};

const normalizeSubscribedChannel = (subscription) => {
  if (!subscription || typeof subscription !== "object") return null;

  const status = typeof subscription?.status === "string" ? subscription.status.toLowerCase() : "";
  if (status && !["active", "validated", "subscribed", "renewed"].includes(status)) {
    return null;
  }

  if (subscription?.expires_at) {
    const expiresAt = new Date(subscription.expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      return null;
    }
  }

  const channel =
    subscription?.broadcaster?.channel ||
    subscription?.channel ||
    subscription?.streamer_channel ||
    subscription?.streamerChannel ||
    subscription?.broadcaster_channel ||
    null;
  const user =
    subscription?.broadcaster?.user ||
    subscription?.user ||
    subscription?.broadcaster_user ||
    subscription?.streamer_user ||
    channel?.user ||
    (channel
      ? {
          username: channel.username,
          slug: channel.slug,
          profile_pic: channel.profile_image,
        }
      : null) ||
    null;

  const slugCandidates = [
    channel?.slug,
    user?.slug,
    user?.username,
    subscription?.slug,
    subscription?.channel_slug,
    subscription?.channelSlug,
  ];
  const slug = slugCandidates.find((value) => typeof value === "string" && value.trim())?.trim();
  if (!slug) return null;

  return {
    slug,
    displayName: channel?.name || user?.username || user?.display_name || user?.slug || slug,
    user: user || null,
  };
};

const getSubscribedChannelsFromPayload = (payload) => {
  const subscriptions = extractSubscriptionItems(payload);
  const deduped = new Map();

  subscriptions.forEach((subscription) => {
    const normalized = normalizeSubscribedChannel(subscription);
    if (!normalized?.slug) return;

    const key = normalized.slug.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  });

  return Array.from(deduped.values());
};

const mergeOwnChannel = (channels, selfInfo) => {
  if (!selfInfo || typeof selfInfo !== "object") return channels;

  const ownSlug =
    selfInfo?.streamer_channel?.slug ||
    selfInfo?.streamer_channel?.username ||
    selfInfo?.username ||
    null;
  if (!ownSlug) return channels;

  const ownKey = ownSlug.toLowerCase();
  const existing = channels.find((channel) => channel?.slug?.toLowerCase() === ownKey);
  if (existing) return channels;

  return [
    ...channels,
    {
      slug: ownSlug,
      displayName:
        selfInfo?.streamer_channel?.username ||
        selfInfo?.username ||
        ownSlug,
      user: {
        username:
          selfInfo?.streamer_channel?.username ||
          selfInfo?.username ||
          ownSlug,
        slug: ownSlug,
        profile_pic:
          selfInfo?.streamer_channel?.user?.profile_pic ||
          selfInfo?.profilepic ||
          null,
      },
    },
  ];
};

export const computeAccessibleKickEmotes = (chatrooms, activeChatroomId, subscribedChannelSets = []) => {
  if (!Array.isArray(chatrooms)) return [];

  const activeRoom = chatrooms.find((room) => room?.id === activeChatroomId);
  if (!activeRoom) return [];

  const currentChannelSections = [];
  const crossChannelSubscriberSections = [];
  const globalSections = [];
  const emojiSections = [];
  const seenChannelKeys = new Set();
  const activeSlug = String(
    activeRoom?.streamerData?.slug || activeRoom?.slug || activeRoom?.username || "",
  ).toLowerCase();

  const pushSet = (targetArray, room, set, overrides = {}) => {
    if (!set) {
      return;
    }

    const {
      sectionKind: overrideSectionKind,
      sectionKey: overrideSectionKey,
      sectionLabel: overrideSectionLabel,
      allowSubscriberEmotes: overrideAllowSubscriberEmotes,
      emoteFilter,
    } = overrides;

    const emotes = Array.isArray(set.emotes) ? set.emotes : [];
    const filteredEmotes = typeof emoteFilter === "function" ? emotes.filter(emoteFilter) : emotes;

    if (filteredEmotes.length === 0) {
      return;
    }

    const sectionKind = overrideSectionKind || ((set.name || "").toLowerCase() === "channel_set" ? "channel" : "global");
    const sectionKey = overrideSectionKey || `${sectionKind}:${room?.id ?? set.name ?? Math.random().toString(36).slice(2)}`;

    if (sectionKind === "channel" && seenChannelKeys.has(sectionKey)) {
      return;
    }

    const sectionLabel =
      overrideSectionLabel ||
      (sectionKind === "channel"
        ? room?.displayName || room?.streamerData?.user?.username || set?.user?.username || "Channel Emotes"
        : set?.name || "Kick Emotes");

    const allowSubscriberEmotes =
      typeof overrideAllowSubscriberEmotes === "boolean"
        ? overrideAllowSubscriberEmotes
        : sectionKind !== "channel" || normalizeSubscriptionStatus(room?.userChatroomInfo?.subscription);

    const clonedSet = {
      ...set,
      emotes: filteredEmotes.map((emote) => ({
        ...emote,
        __allowUse: !emote?.subscribers_only || allowSubscriberEmotes,
        __sectionKey: sectionKey,
        __sectionLabel: sectionLabel,
        __sectionKind: sectionKind,
        __sourceChatroomId: room?.id,
      })),
      sectionKey,
      sectionKind,
      sectionLabel,
      allowSubscriberEmotes,
      sourceChatroomId: room?.id,
      sourceChatroomSlug: room?.slug,
    };

    if (sectionKind === "channel") {
      seenChannelKeys.add(sectionKey);
      clonedSet.user = clonedSet.user || room?.streamerData?.user || null;
    }

    targetArray.push(clonedSet);
  };

  const activeSubscription =
    normalizeSubscriptionStatus(activeRoom?.userChatroomInfo?.subscription) || isOwnChannelRoom(activeRoom);

  (activeRoom?.emotes || []).forEach((set) => {
    const lowerName = (set?.name || "").toLowerCase();

    if (lowerName === "channel_set") {
      pushSet(currentChannelSections, activeRoom, set, {
        sectionKind: "channel",
        sectionKey: `channel:${activeRoom.id}`,
        allowSubscriberEmotes: activeSubscription,
        sectionLabel:
          activeRoom.displayName || activeRoom?.streamerData?.user?.username || set?.user?.username || "Channel Emotes",
      });
      return;
    }

    if (lowerName === "emojis") {
      pushSet(emojiSections, activeRoom, set, {
        sectionKind: "emoji",
        sectionKey: `emoji:${lowerName}`,
        sectionLabel: set?.name || "Emojis",
        allowSubscriberEmotes: true,
      });
      return;
    }

    pushSet(globalSections, activeRoom, set, {
      sectionKind: "global",
      sectionKey: `global:${lowerName || set?.id || Math.random().toString(36).slice(2)}`,
      sectionLabel: set?.name || "Kick Emotes",
      allowSubscriberEmotes: true,
    });
  });

  subscribedChannelSets.forEach((entry) => {
    if (!entry?.slug || !Array.isArray(entry?.emotes)) return;
    if (entry.slug.toLowerCase() === activeSlug) return;

    const channelSet = entry.emotes.find((set) => (set?.name || "").toLowerCase() === "channel_set");
    if (!channelSet?.emotes?.length) return;

    pushSet(
      crossChannelSubscriberSections,
      {
        id: `sub:${entry.slug}`,
        slug: entry.slug,
        displayName: entry.displayName,
        streamerData: { user: entry.user },
      },
      channelSet,
      {
        sectionKind: "channel",
        sectionKey: `channel:sub:${entry.slug.toLowerCase()}`,
        sectionLabel: `${entry.displayName || entry.slug} Subscriber Emotes`,
        allowSubscriberEmotes: true,
        emoteFilter: (emote) => Boolean(emote?.subscribers_only),
      },
    );
  });

  return [...currentChannelSections, ...crossChannelSubscriberSections, ...globalSections, ...emojiSections];
};

export const useAccessibleKickEmotes = (chatroomId) => {
  const chatrooms = useChatStore(useShallow((state) => state.chatrooms));
  const [subscribedChannelSets, setSubscribedChannelSets] = useState([]);

  const loadKickEmotesForRoom = async (roomId, slug) => {
    if (!slug || kickEmoteLoadInFlight.has(slug) || !window.app?.kick?.getEmotes) {
      return;
    }

    kickEmoteLoadInFlight.add(slug);

    try {
      const emoteData = await window.app.kick.getEmotes(slug);
      if (!Array.isArray(emoteData)) return;

      useChatStore.setState((state) => ({
        chatrooms: state.chatrooms.map((room) =>
          room.id === roomId ? { ...room, emotes: emoteData } : room,
        ),
      }));
    } finally {
      kickEmoteLoadInFlight.delete(slug);
    }
  };

  // Auto-trigger emote loading for the active room when missing.
  useEffect(() => {
    const activeRoom = chatrooms?.find((room) => room?.id === chatroomId);
    if (!activeRoom?.streamerData?.slug) return;
    if (Array.isArray(activeRoom?.emotes)) return;

    loadKickEmotesForRoom(activeRoom.id, activeRoom.streamerData.slug);
  }, [chatroomId, chatrooms]);

  useEffect(() => {
    let cancelled = false;

    const loadSubscribedChannelSets = async () => {
      if (!window.app?.kick?.getUserSubscriptions || !window.app?.kick?.getEmotes) {
        if (!cancelled) setSubscribedChannelSets([]);
        return;
      }

      const now = Date.now();
      if (
        subscribedEmotesCache?.sets?.length &&
        now - subscribedEmotesCache.fetchedAt < SUBSCRIBED_EMOTES_CACHE_TTL_MS
      ) {
        if (!cancelled) {
          setSubscribedChannelSets(subscribedEmotesCache.sets);
        }
        return;
      }

      if (!subscribedEmotesPromise) {
        subscribedEmotesPromise = (async () => {
          const response = await window.app.kick.getUserSubscriptions();
          const payload = response?.data ?? response ?? null;
          let channels = getSubscribedChannelsFromPayload(payload);

          // Ensure your own channel emotes are always loaded from /emotes/<yourSlug>.
          if (window.app?.kick?.getSelfInfo) {
            const selfInfo = await window.app.kick.getSelfInfo();
            channels = mergeOwnChannel(channels, selfInfo);
          }

          const emoteFetches = channels.map(async (channel) => {
            const key = channel.slug.toLowerCase();

            if (!subscribedEmoteFetchInFlight.has(key)) {
              subscribedEmoteFetchInFlight.set(
                key,
                window.app.kick.getEmotes(channel.slug).finally(() => {
                  subscribedEmoteFetchInFlight.delete(key);
                }),
              );
            }

            const emotes = await subscribedEmoteFetchInFlight.get(key);
            if (!Array.isArray(emotes)) return null;

            return {
              ...channel,
              emotes,
            };
          });

          const settled = await Promise.allSettled(emoteFetches);
          const resolved = settled
            .filter((result) => result.status === "fulfilled" && result.value?.emotes?.length)
            .map((result) => result.value);

          subscribedEmotesCache = {
            fetchedAt: Date.now(),
            sets: resolved,
          };

          return resolved;
        })().finally(() => {
          subscribedEmotesPromise = null;
        });
      }

      const sets = await subscribedEmotesPromise;
      if (!cancelled) {
        setSubscribedChannelSets(Array.isArray(sets) ? sets : []);
      }
    };

    loadSubscribedChannelSets().catch((error) => {
      console.error("[Kick Emotes]: Failed loading subscribed emote sets", error);
      if (!cancelled) {
        setSubscribedChannelSets([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => computeAccessibleKickEmotes(chatrooms, chatroomId, subscribedChannelSets),
    [chatrooms, chatroomId, subscribedChannelSets],
  );
};

export { normalizeSubscriptionStatus as isKickSubscriptionActive };
