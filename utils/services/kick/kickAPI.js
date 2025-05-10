import axios from "axios";
import { create } from "zustand";
const APIUrl = "https://kick.com";
const KickTalkAPIUrl = "https://api.kicktalk.app";
const rateLimitMap = new Map();

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

const getChannelInfo = async (channelID) => {
  // TODO: Update Regex replace for url
  const transformedChannelID = channelID.replace("_", "-");

  const response = await axios.get(`${APIUrl}/api/v2/channels/${transformedChannelID}`);
  return response.data;
};

const getChannelChatroomInfo = (channelName) => {
  const transformedChannelName = channelName.replace("_", "-");

  return axios.get(`${APIUrl}/api/v2/channels/${transformedChannelName}`, {
    referrer: `https://kick.com/`,
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });
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

  channelState.timestamps = channelState.timestamps.filter(ts => now - ts <= 3000);
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
    }
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

const getUserChatroomInfo = (chatroomName, username, sessionCookie, kickSession) => {
  const transformedChannelName = chatroomName.replace("_", "-");
  return axios.get(`${APIUrl}/api/v2/channels/${transformedChannelName}/users/${username}`, {
    referrer: `https://kick.com/${transformedChannelName}`,
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });
};

const pinMessage = (data, sessionCookie, kickSession) => {
  const currentTime = new Date().toISOString();
  return axios.post(
    `${APIUrl}/api/v2/channels/${data.chatroomName}/pinned-message`,
    { duration: 1200, message:{
       chatroom_id: data.chatroom_id, content: data.content, created_at: currentTime, id: data.id, sender: data.sender ,type: "message" 
    }},  
    {
      headers: {
        Authorization: `Bearer ${sessionCookie}`,
      },
      Cookie: `kick_session=${kickSession}, session_token=${sessionCookie}, x-xsrf-token=${sessionCookie}, XSRF-TOKEN=${kickSession}`,
    }
  );
};

const getKickEmotes = async (chatroomName) => {
  const transformedChannelName = chatroomName.replace("_", "-");
  const response = await axios.get(`${APIUrl}/emotes/${transformedChannelName}`);

  const processedEmotes =
    response?.data?.map((set) => {
      return {
        ...set,
        emotes:
          set.emotes?.map((emote) => ({
            ...emote,
            platform: "kick",
          })) || [],
      };
    }) || [];

  return processedEmotes;
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

const silenceUser = (user_id, sessionCookie, kickSession) => {
  return axios.post(`${APIUrl}/api/v2/silenced-users`,
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
    }
  );
};

const unsilenceUser = (user_id, sessionCookie, kickSession) => {
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

const sendUsernameToServer = (username) => {
  return axios.post(`${KickTalkAPIUrl}/t/internal/username`, { username });
};

export {
  getChannelInfo,
  getChannelChatroomInfo,
  sendMessageToChannel,
  getSelfInfo,
  getKickEmotes,
  getKickTalkBadges,
  getUserChatroomInfo,
  getSilencedUsers,
  getInitialChatroomMessages,
  getUserChatroomStatus,
  sendUsernameToServer,
  getUserKickId,
  getLinkThumbnail,
  silenceUser,
  unsilenceUser,
  pinMessage,
};
