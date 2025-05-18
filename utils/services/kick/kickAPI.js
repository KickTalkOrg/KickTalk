import axios from "axios";
import { create } from "zustand";
const APIUrl = "https://kick.com";
const KickTalkAPIUrl = "https://api.kicktalk.app";
const rateLimitMap = new Map();

const kickAxios = axios.create({
  baseURL: "https://kick.com",
  withCredentials: true,
  headers: {
    Accept: "*/*",
    "Content-Type": "application/json",
  },
});

// const authTest = async (channelName, socketId, sessionCookie, kickSession) => {
//   try {
//     const response = await fetch("https://kick.com/broadcasting/auth", {
//       method: "POST",
//       credentials: "include",
//       headers: {
//         // Comprehensive headers matching browser request
//         accept: "application/json",
//         "accept-encoding": "gzip, deflate, br, zstd",
//         "accept-language": "en-US,en;q=0.8",
//         authorization: `Bearer ${sessionCookie}`,
//         "content-type": "application/json",
//         origin: "https://kick.com",
//         priority: "u=1, i",
//         referer: "https://kick.com/design",

//         // XSRF Token handling
//         "x-xsrf-token": kickSession,

//         // Additional security headers
//         "sec-ch-ua": '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
//         "sec-ch-ua-mobile": "?0",
//         "sec-ch-ua-platform": '"Windows"',
//         "sec-fetch-dest": "empty",
//         "sec-fetch-mode": "cors",
//         "sec-fetch-site": "same-origin",
//         "sec-gpc": "1",
//         "user-agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",

//         // Additional potential headers
//         cookie: `session_token=${sessionCookie}; kick_session=${kickSession}; XSRF-TOKEN=${kickSession}`,
//       },
//       body: JSON.stringify({
//         channel_name: channelName, // Ensure this matches exactly
//         socket_id: socketId, // Use provided or default socket ID
//       }),
//     });

//     if (!response.ok) {
//       const errorText = await response.text();
//       console.error(`HTTP error! status: ${response.status}`);
//       console.error("Error response body:", errorText);
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     const data = await response.json();
//     console.log("Response data:", data);
//     return data;
//   } catch (error) {
//     console.error("Authentication test failed:", error);
//     throw error;
//   }
// };

/**
 *
 * [USER ACTIONS]
 *
 */

const getFollowChannel = async (channelName) => {
  // TODO: Error Handling for already following and not following
  //   {
  //     "message": "The given data was invalid.",
  //     "errors": {
  //         "channel": [
  //             "You are not following this channel."
  //         ]
  //     }
  // }
  const response = await axios.post(`${APIUrl}/api/v2/channels/${channelName}/follow`);
  return response.data;
};

const getUnfollowChannel = async (channelName) => {
  const response = await axios.delete(`${APIUrl}/api/v2/channels/${channelName}/follow`);
  return response.data;
};

/**
 *
 * [MOD ACTIONS]
 *
 */

// Ban User
const getBanUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    // First try with the original channel name
    const response = await axios.post(
      `${APIUrl}/api/v2/channels/${channelName}/bans`,
      {
        banned_username: username,
        permanent: true,
      },
      {
        headers: {
          Accept: "*/*",
          Authorization: `Bearer ${sessionCookie}`,
          "X-XSRF-TOKEN": kickSession,
        },
        Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
      },
    );

    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getBanUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

// Unban User
const getUnbanUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    const response = await axios.delete(`${APIUrl}/api/v2/channels/${channelName}/bans/${username}`, {
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${sessionCookie}`,
        "X-XSRF-TOKEN": kickSession,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    });

    return response.status;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getUnbanUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

// Get Timeout User
const getTimeoutUser = async (channelName, username, banDuration, sessionCookie, kickSession) => {
  try {
    const response = await axios.post(
      `${APIUrl}/api/v2/channels/${channelName}/bans`,
      {
        banned_username: username,
        duration: banDuration,
        permanent: false,
      },
      {
        headers: {
          Accept: "*/*",
          Authorization: `Bearer ${sessionCookie}`,
          "X-XSRF-TOKEN": kickSession,
        },
        Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
      },
    );
    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getTimeoutUser(transformedChannelName, username, banDuration, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

/** [END MOD ACTIONS] */

const getLinkThumbnail = async (url) => {
  const response = await axios.get(url, {
    referrer: `${url}`,
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });

  if (response.status !== 200) {
    return null;
  }

  const ogUrlMatch = response.data.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']\s*\/?>/i)?.[1];
  const descriptionMatch = response.data.match(/<meta name="description" content="(.*?)"\/>/)?.[1];

  if (ogUrlMatch?.includes("kick.com") && descriptionMatch) {
    return {
      clipThumbnailUrl: ogUrlMatch,
      clipTitle: descriptionMatch,
    };
  }

  return null;
};

const getChannelInfo = async (channelName) => {
  try {
    const response = await axios.get(`${APIUrl}/api/v2/channels/${channelName}`);
    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getChannelInfo(transformedChannelName);
      }
    }

    throw error;
  }
};

const getChannelChatroomInfo = async (channelName) => {
  try {
    const response = await axios.get(`${APIUrl}/api/v2/channels/${channelName}`, {
      referrer: `https://kick.com/`,
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      mode: "cors",
      credentials: "include",
    });

    return response;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getChannelChatroomInfo(transformedChannelName);
      }
    }

    throw error;
  }
};

const getInitialPollInfo = async (channelName) => {
  try {
    const response = await axios.get(`${APIUrl}/api/v2/channels/${channelName}/polls`, {
      referrer: `https://kick.com/`,
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      mode: "cors",
      credentials: "include",
    });

    return response;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getChannelChatroomInfo(transformedChannelName);
      }
    }

    throw error;
  }
};

const getUserKickId = async (sessionCookie, kickSession) => {
  const response = await axios.get(`${APIUrl}/api/v1/user`, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${sessionCookie}`,
      priority: "u=1, i",
      "x-xsrf-token": kickSession,
    },
    referrer: `https://kick.com/`,
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });

  if (!response?.data) {
    return null;
  }

  return response.data.id;
};

const getUserChatroomStatus = (sessionCookie, kickSession, channelName) => {
  return axios.get(`${APIUrl}/api/v2/channels/${channelName}/me`, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${sessionCookie}`,
      priority: "u=1, i",
      "x-xsrf-token": kickSession,
    },
    referrer: `https://kick.com/${channelName}`,
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });
};

const getInitialChatroomMessages = (channelID) => {
  return axios.get(`${APIUrl}/api/v2/channels/${channelID}/messages`);
};

const sendMessageToChannel = async (channelID, message, sessionCookie, kickSession) => {
  const now = Date.now();

  if (!rateLimitMap.has(channelID)) {
    rateLimitMap.set(channelID, {
      timestamps: [],
      cooldownUntil: 0,
      isActive: false,
    });
  }

  const channelState = rateLimitMap.get(channelID);

  if (now < channelState.cooldownUntil) {
    if (!channelState.isActive) {
      channelState.isActive = true;
      throw { code: "CHAT_RATE_LIMIT_ERROR" };
    }
    return;
  }

  channelState.isActive = false;

  channelState.timestamps = channelState.timestamps.filter((ts) => now - ts <= 3000);
  channelState.timestamps.push(now);

  if (channelState.timestamps.length >= 9) {
    channelState.cooldownUntil = now + 5000;
    channelState.isActive = true;
    throw { code: "CHAT_RATE_LIMIT_ERROR" };
  }

  return axios.post(
    `${APIUrl}/api/v2/messages/send/${channelID}`,
    { content: message, type: "message" },
    {
      headers: {
        Authorization: `Bearer ${sessionCookie}`,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    },
  );
};

const sendReplyToChannel = async (channelID, message, metadata = {}, sessionCookie, kickSession) => {
  const now = Date.now();

  if (!rateLimitMap.has(channelID)) {
    rateLimitMap.set(channelID, {
      timestamps: [],
      cooldownUntil: 0,
      isActive: false,
    });
  }

  const channelState = rateLimitMap.get(channelID);

  if (now < channelState.cooldownUntil) {
    if (!channelState.isActive) {
      channelState.isActive = true;
      throw { code: "CHAT_RATE_LIMIT_ERROR" };
    }
    return;
  }

  channelState.isActive = false;

  channelState.timestamps = channelState.timestamps.filter((ts) => now - ts <= 3000);
  channelState.timestamps.push(now);

  if (channelState.timestamps.length >= 9) {
    channelState.cooldownUntil = now + 5000;
    channelState.isActive = true;
    throw { code: "CHAT_RATE_LIMIT_ERROR" };
  }

  return axios.post(
    `${APIUrl}/api/v2/messages/send/${channelID}`,
    { content: message, type: "reply", metadata },
    {
      headers: {
        Authorization: `Bearer ${sessionCookie}`,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    },
  );
};

const getSelfInfo = (sessionCookie, kickSession) => {
  return axios.get(`${APIUrl}/api/v1/user`, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${sessionCookie}`,
      priority: "u=1, i",
      "x-xsrf-token": kickSession,
    },
    referrer: "https://kick.com/",
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });
};

const getSelfChatroomInfo = async (chatroomName, sessionCookie, kickSession) => {
  try {
    const response = await axios.get(`${APIUrl}/api/v2/channels/${chatroomName}/me`, {
      headers: {
        accept: "*/*",
        authorization: `Bearer ${sessionCookie}`,
        priority: "u=1, i",
        "x-xsrf-token": kickSession,
      },
      referrer: "https://kick.com/",
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      mode: "cors",
      credentials: "include",
    });

    return response;
  } catch (error) {
    if (chatroomName.includes("_")) {
      const transformedChatroomName = chatroomName.replaceAll("_", "-");

      if (transformedChatroomName !== chatroomName) {
        return await getSelfChatroomInfo(transformedChatroomName, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getUserChatroomInfo = async (chatroomName, username, sessionCookie, kickSession) => {
  try {
    const response = await axios.get(`${APIUrl}/api/v2/channels/${chatroomName}/users/${username}`, {
      referrer: `https://kick.com/${chatroomName}`,
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      mode: "cors",
      credentials: "include",
    });

    return response;
  } catch (error) {
    if (chatroomName.includes("_")) {
      const transformedChannelName = chatroomName.replaceAll("_", "-");

      if (transformedChannelName !== chatroomName) {
        return await getUserChatroomInfo(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getPinMessage = async (data, sessionCookie, kickSession) => {
  try {
    const currentTime = new Date().toISOString();

    const response = await axios.post(
      `${APIUrl}/api/v2/channels/${data?.chatroomName}/pinned-message`,
      {
        duration: 1200,
        message: {
          chatroom_id: data.chatroom_id,
          content: data.content,
          created_at: currentTime,
          id: data.id,
          sender: data.sender,
          type: "message",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${sessionCookie}`,
        },
        Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
      },
    );

    return response;
  } catch (error) {
    if (data?.chatroomName?.includes("_")) {
      const transformedChannelName = data?.chatroomName?.replaceAll("_", "-");

      if (transformedChannelName !== data?.chatroomName) {
        return await getPinMessage(transformedChannelName, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getUnpinMessage = async (chatroomName, sessionCookie, kickSession) => {
  try {
    const response = await axios.delete(`${APIUrl}/api/v2/channels/${chatroomName}/pinned-message`, {
      headers: {
        Authorization: `Bearer ${sessionCookie}`,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    });

    return response?.status;
  } catch (error) {
    if (chatroomName.includes("_")) {
      const transformedChannelName = chatroomName.replaceAll("_", "-");

      if (transformedChannelName !== chatroomName) {
        return await getUnpinMessage(transformedChannelName, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const processKickEmotes = (emotes) => {
  return (
    emotes?.map((set) => {
      return {
        ...set,
        name: set.name ? set.name : `channel_set`,
        emotes:
          set.emotes?.map((emote) => ({
            ...emote,
            platform: "kick",
          })) || [],
      };
    }) || []
  );
};

const getKickEmotes = async (chatroomName) => {
  try {
    const response = await axios.get(`${APIUrl}/emotes/${chatroomName}`);
    const processedEmotes = processKickEmotes(response.data);

    return processedEmotes;
  } catch (error) {
    if (chatroomName.includes("_")) {
      const transformedChannelName = chatroomName.replaceAll("_", "-");

      if (transformedChannelName !== chatroomName) {
        return await getKickEmotes(transformedChannelName);
      }
    }

    throw error;
  }
};

const getKickTalkBadges = async () => {
  const response = await axios.get(`${KickTalkAPIUrl}/badges`);

  if (response.status === 200) {
    return response.data;
  }

  return [];
};

const getSilencedUsers = (sessionCookie, kickSession) => {
  return axios.get(`${APIUrl}/api/v2/silenced-users`, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${sessionCookie}`,
      priority: "u=1, i",
      "x-xsrf-token": kickSession,
    },
    referrer: "https://kick.com/",
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });
};

const getSilenceUser = (user_id, sessionCookie, kickSession) => {
  return axios.post(
    `${APIUrl}/api/v2/silenced-users`,
    { user_id: user_id },
    {
      headers: {
        accept: "*/*",
        authorization: `Bearer ${sessionCookie}`,
        priority: "u=1, i",
        "x-xsrf-token": kickSession,
      },
      referrer: "https://kick.com/",
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "POST",
      mode: "cors",
      credentials: "include",
    },
  );
};

const getUnsilenceUser = (user_id, sessionCookie, kickSession) => {
  return axios.delete(`${APIUrl}/api/v2/silenced-users/${user_id}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${sessionCookie}`,
      priority: "u=1, i",
      "x-xsrf-token": kickSession,
    },
    referrer: "https://kick.com/design",
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "DELETE",
    mode: "cors",
    credentials: "include",
  });
};

export {
  getSelfInfo,
  getKickTalkBadges,
  getUserKickId,
  getLinkThumbnail,
  getKickEmotes,

  // Chatroom Actions
  sendMessageToChannel,
  sendReplyToChannel,

  // Silenced Users
  getSilencedUsers,
  getSilenceUser,
  getUnsilenceUser,

  // Chatroom Data
  getChannelInfo,
  getChannelChatroomInfo,
  getUserChatroomInfo,
  getSelfChatroomInfo,
  getInitialChatroomMessages,
  getUserChatroomStatus,
  getPinMessage,
  getUnpinMessage,
  getInitialPollInfo,

  // Mod Actions
  getBanUser,
  getUnbanUser,
  getTimeoutUser,

  // Auth Test
  // authTest,
};
