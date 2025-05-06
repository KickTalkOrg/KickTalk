import axios from "axios";

const getChannelEmotes = async (channelId) => {
  console.log("[7TV Emotes] Fetching channel emotes for", channelId);
  let formattedGlobalEmotes;

  // Try to fetch channel emotes
  try {
    const globalResponse = await axios.get(`https://7tv.io/v3/emote-sets/global`);

    if (globalResponse.status !== 200) {
      throw new Error(`[7TV Emotes] Error while fetching Global Emotes. Status: ${globalResponse.status}`);
    }

    const emoteGlobalData = globalResponse.data;

    // Format global emotes as a fallback
    formattedGlobalEmotes = {
      emote_set: {
        emotes: emoteGlobalData.emotes.map((emote) => {
          return {
            id: emote.id,
            actor_id: emote.actor_id,
            name: emote.name,
            alias: emote.data.name !== emote.name ? emote.data.name : null,
            owner: emote.data.owner,
            file: emote.data.host.files?.[0] || emote.data.host.files?.[1],
            platform: "7tv",
          };
        }),
      },
    };

    const channelResponse = await axios.get(`https://7tv.io/v3/users/kick/${channelId}`);

    if (channelResponse.status === 200) {
      const emoteChannelData = channelResponse.data;

      // Combine channel and global emotes
      const channelEmoteIds = new Set(emoteChannelData.emote_set.emotes.map((emote) => emote.id));
      const filteredGlobalEmotes = emoteGlobalData.emotes.filter((emote) => !channelEmoteIds.has(emote.id));

      // Format combined emotes
      emoteChannelData.emote_set.emotes = [...emoteChannelData.emote_set.emotes, ...filteredGlobalEmotes].map((emote) => {
        return {
          id: emote.id,
          actor_id: emote.actor_id,
          name: emote.name,
          alias: emote.data.name !== emote.name ? emote.data.name : null,
          owner: emote.data.owner,
          file: emote.data.host.files?.[0] || emote.data.host.files?.[1],
          platform: "7tv",
        };
      });

      console.log("[7TV Emotes] Successfully fetched channel and global emotes");
      return emoteChannelData;
    }
  } catch (error) {
    console.error("[7TV Emotes] Error fetching channel emotes:", error.message);
  }

  // Return only global emotes if channel emotes are unavailable
  console.log("[7TV Emotes] Using global emotes only");
  return formattedGlobalEmotes;
};

const sendUserPresence = async (stvId, userId) => {
  try {
    const response = await axios.post(
      `https://7tv.io/v3/users/${stvId}/presences`,
      {
        kind: 1,
        passive: true,
        session_id: undefined,
        data: {
          platform: "KICK",
          id: `${userId}`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.status !== 200) {
      throw new Error(`[7TV Emotes] Error while sending user presence: ${response.status}`);
    }

    return response.data;
  } catch (error) {
    console.error("[7TV Emotes] Error while sending user presence:", error.message);
  }
};

const getUserStvId = async (platformId) => {
  try {
    const getUserByConnectionQuery = `
    query GetUserByConnection($platform: ConnectionPlatform!, $id: String!) {
      user: userByConnection(platform: $platform, id: $id) {
        id
        username
        connections {
          id
          username
          display_name
          platform
          linked_at
        }
      }
    }
  `;
    const response = await axios.post(
      "https://7tv.io/v3/gql",
      {
        query: getUserByConnectionQuery,
        variables: { platform: "KICK", id: `${platformId}` },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.status !== 200) {
      throw new Error(`[7TV Emotes] Error while fetching user STV ID: ${response.status}`);
    }

    return response?.data?.data?.user?.id;
  } catch (error) {
    console.error("[7TV Emotes] Error while fetching user STV ID:", error.message);
  }
};

// const getGlobalEmotes = async () => {
//   const response = await axios.get(`https://7tv.io/v3/emote-sets/global`);

//   if (response.status !== 200) {
//     console.error(`[7TV Emotes] Error while fetching Global Emotes. Status: ${response.status}`);
//     return [];
//   }

//   return response.data;
// };

// const getUserCosmetics = async (id) => {};

export { getChannelEmotes, sendUserPresence, getUserStvId };
