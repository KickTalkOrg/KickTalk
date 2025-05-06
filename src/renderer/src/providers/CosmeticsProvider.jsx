import { create } from "zustand";

const useCosmeticsStore = create((set, get) => ({
  userStyles: {},
  globalCosmetics: {
    badges: [],
    paints: [],
  },

  addUserStyle: async (username, body) => {
    if (!body?.object?.user?.style) return;

    const transformedUsername = username.toLowerCase();
    const userStyle = body.object.user;

    set((state) => {
      const currentStyle = state.userStyles[transformedUsername] || {};
      if (currentStyle.badgeId === body.object.user.style.badge_id && currentStyle.paintId === body.object.user.style.paint_id)
        return state;

      return {
        userStyles: {
          ...state.userStyles,
          [transformedUsername]: {
            badgeId: userStyle.style.badge_id,
            paintId: userStyle.style.paint_id,
            color: userStyle.style.color,
            kickConnection: userStyle.connections?.find((c) => c.type === "KICK"),
            entitlement: body,
            userId: userStyle.id,
            username: userStyle.username,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  getUserStyle: (username) => {
    const transformedUsername = username.toLowerCase();
    const userStyle = get().userStyles[transformedUsername];

    if (!userStyle?.badgeId && !userStyle?.paintId) return null;

    const badge = get().globalCosmetics?.badges?.find((b) => b.id === userStyle.badgeId);
    const paint = get().globalCosmetics?.paints?.find((p) => p.id === userStyle.paintId);

    return {
      badge,
      paint,
      color: userStyle.color,
      username: userStyle.username,
    };
  },

  addCosmetics: (body) => {
    set(() => {
      const newState = {
        globalCosmetics: {
          ...body,
        },
      };

      return newState;
    });
  },

  getUserBadge: (username) => {
    const transformedUsername = username.toLowerCase();

    const userStyle = get().userStyles[transformedUsername];
    if (!userStyle?.badgeId) return null;

    return get().globalCosmetics[userStyle.badgeId];
  },

  getUserPaint: (username) => {
    const transformedUsername = username.toLowerCase();

    const userStyle = get().userStyles[transformedUsername];
    if (!userStyle?.paintId) return null;

    return get().globalCosmetics[userStyle.paintId];
  },
}));

export default useCosmeticsStore;
