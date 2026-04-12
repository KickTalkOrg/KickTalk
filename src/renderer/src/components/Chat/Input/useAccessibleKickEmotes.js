import { useMemo, useEffect, useState } from "react";
import useChatStore from "../../../providers/ChatProvider";
import { useShallow } from "zustand/react/shallow";

const kickEmoteLoadInFlight = new Set();
const kickSubscriptionsInFlight = new Map();
const SUBSCRIBED_CHANNELS_TTL_MS = 5 * 60 * 1000;
let subscribedChannelsCache = {
  fetchedAt: 0,
  sets: [],
};
let subscribedChannelsPromise = null;

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

const extractSubscriptionItems = (payload) => {
  const buckets = [
    payload,
    payload?.data,
  ];

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

  const displayName =
    channel?.name ||
    user?.username ||
    user?.display_name ||
    user?.slug ||
    slug;

  return {
    slug,
    displayName,
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

export const computeAccessibleKickEmotes = (chatrooms, activeChatroomId, subscribedChannelSets = []) => {
  if (!Array.isArray(chatrooms)) return [];

  const activeRoom = chatrooms.find((room) => room?.id === activeChatroomId);
  if (!activeRoom) return [];

  const currentChannelSections = [];
  const otherChannelSections = [];
  const globalSections = [];
  const emojiSections = [];
  const seenChannelKeys = new Set();
  const loadedSlugs = new Set(
    chatrooms
      .map((room) => room?.streamerData?.slug?.toLowerCase())
      .filter(Boolean),
  );

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

  const activeSubscription = normalizeSubscriptionStatus(activeRoom?.userChatroomInfo?.subscription);

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

  chatrooms.forEach((room) => {
    if (!room || room.id === activeChatroomId) return;
    if (!normalizeSubscriptionStatus(room?.userChatroomInfo?.subscription)) return;

    const channelSet = (room.emotes || []).find((set) => (set?.name || "").toLowerCase() === "channel_set");
    if (!channelSet?.emotes?.length) return;

    pushSet(otherChannelSections, room, channelSet, {
      sectionKind: "channel",
      sectionKey: `channel:${room.id}`,
      sectionLabel: room.displayName || room?.streamerData?.user?.username || channelSet?.user?.username || "Channel Emotes",
      allowSubscriberEmotes: true,
      emoteFilter: (emote) => Boolean(emote?.subscribers_only),
    });
  });

  subscribedChannelSets.forEach((entry) => {
    if (!entry?.slug || !Array.isArray(entry?.emotes)) return;
    if (loadedSlugs.has(entry.slug.toLowerCase())) return;

    const syntheticRoom = {
      id: `sub:${entry.slug}`,
      slug: entry.slug,
      displayName: entry.displayName || entry.user?.username || entry.slug,
      streamerData: { user: entry.user || null },
      userChatroomInfo: { subscription: true },
    };

    const channelSet = entry.emotes.find((set) => (set?.name || "").toLowerCase() === "channel_set");
    if (!channelSet?.emotes?.length) return;

    pushSet(otherChannelSections, syntheticRoom, channelSet, {
      sectionKind: "channel",
      sectionKey: `channel:sub:${entry.slug.toLowerCase()}`,
      sectionLabel: entry?.isOwnChannel
        ? `My Channel - ${syntheticRoom.displayName || channelSet?.user?.username || "Channel Emotes"}`
        : syntheticRoom.displayName || channelSet?.user?.username || "Channel Emotes",
      allowSubscriberEmotes: true,
      emoteFilter: entry?.isOwnChannel
        ? undefined
        : (emote) => Boolean(emote?.subscribers_only),
    });
  });

  return [...currentChannelSections, ...otherChannelSections, ...globalSections, ...emojiSections];
};

export const useAccessibleKickEmotes = (chatroomId) => {
  const chatrooms = useChatStore(useShallow((state) => state.chatrooms));
  const [subscribedChannelSets, setSubscribedChannelSets] = useState([]);

  const shouldFetchKickEmotesForRoom = (room) => {
    if (!room?.streamerData?.slug) return false;
    if (Array.isArray(room?.emotes)) return false;
    return true;
  };

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

  // Auto-trigger emote loading for all subscribed rooms, not just the active tab.
  useEffect(() => {
    if (!Array.isArray(chatrooms) || chatrooms.length === 0) return;

    chatrooms.forEach((room) => {
      if (!shouldFetchKickEmotesForRoom(room)) return;
      loadKickEmotesForRoom(room.id, room.streamerData.slug);
    });
  }, [chatroomId, chatrooms]);

  useEffect(() => {
    let cancelled = false;

    const fetchSubscribedChannelSets = async () => {
      const now = Date.now();
      if (
        subscribedChannelsCache?.sets?.length &&
        now - subscribedChannelsCache.fetchedAt < SUBSCRIBED_CHANNELS_TTL_MS
      ) {
        return subscribedChannelsCache.sets;
      }

      if (subscribedChannelsPromise) {
        return subscribedChannelsPromise;
      }

      subscribedChannelsPromise = (async () => {
        if (!window.app?.kick?.getEmotes) return [];

        let subscribedChannels = [];

        if (window.app?.kick?.getUserSubscriptions) {
          const response = await window.app.kick.getUserSubscriptions();
          const payload = response?.data ?? response ?? null;
          subscribedChannels = getSubscribedChannelsFromPayload(payload);
        }

        if (window.app?.kick?.getSelfInfo) {
          const selfInfo = await window.app.kick.getSelfInfo();
          const ownChannelSlug =
            selfInfo?.streamer_channel?.slug ||
            selfInfo?.streamer_channel?.username ||
            null;

          if (ownChannelSlug) {
            const ownChannelKey = ownChannelSlug.toLowerCase();
            const hasOwnChannel = subscribedChannels.some(
              (channel) => channel?.slug?.toLowerCase() === ownChannelKey,
            );

            if (!hasOwnChannel) {
              subscribedChannels.push({
                slug: ownChannelSlug,
                displayName:
                  selfInfo?.streamer_channel?.username ||
                  selfInfo?.username ||
                  ownChannelSlug,
                isOwnChannel: true,
                user: {
                  username:
                    selfInfo?.streamer_channel?.username ||
                    selfInfo?.username ||
                    ownChannelSlug,
                  slug: ownChannelSlug,
                  profile_pic:
                    selfInfo?.streamer_channel?.user?.profile_pic ||
                    selfInfo?.profilepic ||
                    null,
                },
              });
            } else {
              subscribedChannels = subscribedChannels.map((channel) =>
                channel?.slug?.toLowerCase() === ownChannelKey
                  ? { ...channel, isOwnChannel: true }
                  : channel,
              );
            }
          }
        }

        const emoteFetches = subscribedChannels.map(async (channel) => {
          const slug = channel.slug;
          if (!slug) return null;

          const key = slug.toLowerCase();
          if (!kickSubscriptionsInFlight.has(key)) {
            kickSubscriptionsInFlight.set(
              key,
              window.app.kick.getEmotes(slug).finally(() => {
                kickSubscriptionsInFlight.delete(key);
              }),
            );
          }

          const emotes = await kickSubscriptionsInFlight.get(key);
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

        subscribedChannelsCache = {
          fetchedAt: Date.now(),
          sets: resolved,
        };
        return resolved;
      })();

      try {
        return await subscribedChannelsPromise;
      } finally {
        subscribedChannelsPromise = null;
      }
    };

    const loadSubscribedChannelEmotes = async () => {
      if (!window.app?.kick?.getEmotes) return;

      try {
        const resolved = await fetchSubscribedChannelSets();

        if (!cancelled) {
          setSubscribedChannelSets(resolved);
        }
      } catch (error) {
        if (!cancelled) {
          setSubscribedChannelSets([]);
        }
        console.error("[Kick Emotes]: Failed to fetch subscribed channel emotes", error);
      }
    };

    loadSubscribedChannelEmotes();

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
