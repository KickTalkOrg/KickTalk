import axios from "axios";
const APIUrl = "https://kick.com";
const KickTalkAPIUrl = "https://api.kicktalk.app";

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

const sendMessageToChannel = (channelID, message, sessionCookie, kickSession) => {
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
    headers: {
      accept: "*/*",
      authorization: `Bearer ${sessionCookie}`,
      priority: "u=1, i",
      "x-xsrf-token": kickSession,
    },
    referrer: `https://kick.com/${transformedChannelName}`,
    referrerPolicy: "strict-origin-when-cross-origin",
    method: "GET",
    mode: "cors",
    credentials: "include",
  });
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
};
