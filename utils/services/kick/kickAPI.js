import axios from "axios";
const APIUrl = "https://kick.com";
const KickTalkAPIUrl = "https://api.kicktalk.app";
const rateLimitMap = new Map();

// const axiosClient = axios.create({
//   baseURL: "https://kick.com",
//   withCredentials: true,
//   headers: {
//     Accept: "*/*",
//     "Content-Type": "application/json",
//   },
// });

const getKickTalkDonators = async () => {
  const response = await axios.get(`${KickTalkAPIUrl}/v1/donators`);
  return response.data;
};

const getKickAuthForEvents = async (eventChannelName, socketId, sessionCookie, kickSession) => {
  try {
    const response = await axios.post(
      `${APIUrl}/broadcasting/auth`,
      {
        socket_id: socketId,
        channel_name: eventChannelName,
      },
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US",
          authorization: `Bearer ${sessionCookie}`,
          "content-type": "application/json",
          priority: "u=1, i",
        },
        Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
        referrerPolicy: "strict-origin-when-cross-origin",
        method: "POST",
        mode: "cors",
        credentials: "include",
      },
    );

    return response?.data;
  } catch (error) {
    console.error("[KickAPI]: Auth Token Retrieval Failed:", error);
    throw error;
  }
};

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
 * [BROADCASTER ACTIONS]
 *
 */

const getModerateUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    // First try with the original channel name
    const response = await axios.post(
      `${APIUrl}/api/internal/v1/channels/${channelName}/community/moderators`,
      {
        username,
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
        return await getModerateUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getUnmoderateUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    const response = await axios.delete(`${APIUrl}/api/internal/v1/channels/${channelName}/community/moderators/${username}`, {
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${sessionCookie}`,
        "X-XSRF-TOKEN": kickSession,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    });

    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getUnmoderateUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getVipUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    const response = await axios.post(`${APIUrl}/api/internal/v1/channels/${channelName}/community/vip`, {
      username,
    });

    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getVipUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getUnvipUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    const response = await axios.delete(`${APIUrl}/api/internal/v1/channels/${channelName}/community/vip/${username}`, {
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${sessionCookie}`,
        "X-XSRF-TOKEN": kickSession,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    });

    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getUnvipUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getOGUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    const response = await axios.post(`${APIUrl}/api/internal/v1/channels/${channelName}/community/ogs`, {
      username,
    });

    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getOGUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getUnogUser = async (channelName, username, sessionCookie, kickSession) => {
  try {
    const response = await axios.delete(`${APIUrl}/api/internal/v1/channels/${channelName}/community/ogs/${username}`, {
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${sessionCookie}`,
        "X-XSRF-TOKEN": kickSession,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    });

    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getUnogUser(transformedChannelName, username, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

/**
 *
 * [CHANNEL COMMANDS]
 *
 */

const getUpdateTitle = async (channelName, title, sessionCookie, kickSession) => {
  try {
    const response = await axios.post(
      `${APIUrl}/api/v2/channels/${channelName}/chatroom`,
      {
        title,
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
        return await getUpdateTitle(transformedChannelName, title, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getClearChatroom = async (channelName, sessionCookie, kickSession) => {
  try {
    const response = await axios.post(
      `${APIUrl}/api/v2/channels/${channelName}/chat-commands`,
      {
        command: "clear",
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
        return await getClearChatroom(transformedChannelName, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getUpdateSlowmode = async (channelName, slowmodeOptions, sessionCookie, kickSession) => {
  try {
    const response = await axios.post(`${APIUrl}/api/v2/channels/${channelName}/chatroom`, slowmodeOptions, {
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${sessionCookie}`,
        "X-XSRF-TOKEN": kickSession,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    });

    return response.data;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getUpdateSlowmode(transformedChannelName, slowmodeOptions, sessionCookie, kickSession);
      }
    }

    throw error;
  }
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

// Delete Message
const getDeleteMessage = async (chatroomId, messageId, sessionCookie, kickSession) => {
  try {
    const response = await axios.delete(`${APIUrl}/api/v2/chatrooms/${chatroomId}/messages/${messageId}`, {
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${sessionCookie}`,
        "X-XSRF-TOKEN": kickSession,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    });
    return response.data;
  } catch (error) {
    console.error(`[KickAPI]: Failed to delete message ${messageId} in chatroom ${chatroomId}:`, error);
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
      // Add cache busting to ensure livestream status is fresh
      params: { t: Date.now() },
      headers: {
        "Cache-Control": "no-cache",
      },
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

const getInitialPollInfo = async (channelName, sessionCookie, kickSession) => {
  try {
    const response = await axios.get(`${APIUrl}/api/v2/channels/${channelName}/polls`, {
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${sessionCookie}`,
        "X-XSRF-TOKEN": kickSession,
      },
    });

    return response;
  } catch (error) {
    if (channelName.includes("_")) {
      const transformedChannelName = channelName.replaceAll("_", "-");

      if (transformedChannelName !== channelName) {
        return await getInitialPollInfo(transformedChannelName, sessionCookie, kickSession);
      }
    }

    throw error;
  }
};

const getSubmitPollVote = async (channelName, optionId, sessionCookie, kickSession) => {
  try {
    // https://kick.com/api/v2/channels/design/polls/vote

    const response = await axios.post(
      `${APIUrl}/api/v2/channels/${channelName}/polls/vote`,
      {
        id: optionId,
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

  const channelRateLimit = rateLimitMap.get(channelID);

  if (now < channelRateLimit.cooldownUntil) {
    if (!channelRateLimit.isActive) {
      channelRateLimit.isActive = true;
      throw { code: "CHAT_RATE_LIMIT_ERROR" };
    }
    return;
  }

  channelRateLimit.isActive = false;

  channelRateLimit.timestamps = channelRateLimit.timestamps.filter((ts) => now - ts <= 3000);
  channelRateLimit.timestamps.push(now);

  if (channelRateLimit.timestamps.length >= 9) {
    channelRateLimit.cooldownUntil = now + 5000;
    channelRateLimit.isActive = true;
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

  const channelRateLimit = rateLimitMap.get(channelID);

  if (now < channelRateLimit.cooldownUntil) {
    if (!channelRateLimit.isActive) {
      channelRateLimit.isActive = true;
      throw { code: "CHAT_RATE_LIMIT_ERROR" };
    }
    return;
  }

  channelRateLimit.isActive = false;
  channelRateLimit.timestamps = channelRateLimit.timestamps.filter((ts) => now - ts <= 3000);
  channelRateLimit.timestamps.push(now);

  if (channelRateLimit.timestamps.length >= 9) {
    channelRateLimit.cooldownUntil = now + 5000;
    channelRateLimit.isActive = true;
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

const getUserChatroomInfo = async (chatroomName, username) => {
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
        return await getUserChatroomInfo(transformedChannelName, username);
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
        return await getPinMessage({ ...data, chatroomName: transformedChannelName }, sessionCookie, kickSession);
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

const getChatroomViewers = async (chatroomId) => {
  try {
    const response = await axios.get(`${APIUrl}/current-viewers`, {
      params: {
        "ids[]": chatroomId,
      },
      referrer: "https://kick.com/",
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      mode: "cors",
      credentials: "include",
    });

    return response.data;
  } catch (error) {
    console.error(`[KickAPI]: Failed to get current viewers for chatroom ${chatroomId}:`, error);
    throw error;
  }
};

export {
  getSelfInfo,
  getKickTalkBadges,
  getKickTalkDonators,
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
  getSubmitPollVote,
  getChatroomViewers,

  // Channel Commands
  getUpdateTitle,
  getClearChatroom,
  getUpdateSlowmode,

  // Broadcaster Actions
  getModerateUser,
  getUnmoderateUser,
  getVipUser,
  getUnvipUser,
  getOGUser,
  getUnogUser,

  // Mod Actions
  getBanUser,
  getUnbanUser,
  getTimeoutUser,
  getDeleteMessage,

  // Kick Auth
  getKickAuthForEvents,
};
