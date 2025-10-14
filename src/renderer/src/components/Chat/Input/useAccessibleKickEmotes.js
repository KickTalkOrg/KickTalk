import { useMemo, useEffect } from "react";
import useChatStore from "../../../providers/ChatProvider";
import { useShallow } from "zustand/react/shallow";

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

export const computeAccessibleKickEmotes = (chatrooms, activeChatroomId) => {
  if (!Array.isArray(chatrooms)) return [];

  const activeRoom = chatrooms.find((room) => room?.id === activeChatroomId);
  if (!activeRoom) return [];

  const currentChannelSections = [];
  const otherChannelSections = [];
  const globalSections = [];
  const emojiSections = [];
  const seenChannelKeys = new Set();

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

  return [...currentChannelSections, ...otherChannelSections, ...globalSections, ...emojiSections];
};

export const useAccessibleKickEmotes = (chatroomId) => {
  const chatrooms = useChatStore(useShallow((state) => state.chatrooms));

  // Auto-trigger emote loading if missing for the active room specifically
  useEffect(() => {
    const activeRoom = chatrooms?.find((r) => r?.id === chatroomId);
    if (activeRoom && !activeRoom.emotes) {
      if (activeRoom.streamerData?.slug && window.app?.kick?.getEmotes) {
        window.app.kick.getEmotes(activeRoom.streamerData.slug).then((emoteData) => {
          if (emoteData && Array.isArray(emoteData)) {
            useChatStore.setState((state) => ({
              chatrooms: state.chatrooms.map((room) => {
                if (room.id === chatroomId) {
                  return { ...room, emotes: emoteData };
                }
                return room;
              }),
            }));
          }
        });
      }
    }
  }, [chatroomId, chatrooms]);

  return useMemo(() => computeAccessibleKickEmotes(chatrooms, chatroomId), [chatrooms, chatroomId]);
};

export { normalizeSubscriptionStatus as isKickSubscriptionActive };
