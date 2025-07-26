import { contextBridge, ipcRenderer, shell, session } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import {
  sendMessageToChannel,
  sendReplyToChannel,
  getChannelInfo,
  getChannelChatroomInfo,
  getKickEmotes,
  getSelfInfo,
  getUserChatroomInfo,
  getSelfChatroomInfo,
  getSilencedUsers,
  getLinkThumbnail,
  getInitialChatroomMessages,
  getInitialPollInfo,
  getSubmitPollVote,
  getChatroomViewers,

  // Mod Actions
  getBanUser,
  getUnbanUser,
  getTimeoutUser,
  getDeleteMessage,

  // User Actions
  getSilenceUser,
  getUnsilenceUser,

  // Pin
  getPinMessage,
  getUnpinMessage,

  // Kick Auth for Events
  getKickAuthForEvents,
  getUpdateTitle,
  getClearChatroom,
} from "../../utils/services/kick/kickAPI";
import { getUserStvProfile, getChannelEmotes } from "../../utils/services/seventv/stvAPI";

import Store from "electron-store";

const authStore = new Store({
  fileExtension: "env",
});

// Get Silenced users and save the in local storage
const saveSilencedUsers = async (sessionCookie, kickSession) => {
  try {
    if (!sessionCookie || !kickSession) {
      console.log("[Silenced Users]: No session tokens available, skipping fetch");
      return;
    }

    const response = await getSilencedUsers(sessionCookie, kickSession);
    if (response.status === 200) {
      const silencedUsers = response.data;
      localStorage.setItem("silencedUsers", JSON.stringify(silencedUsers));
      console.log("[Silenced Users]: Successfully loaded and saved to storage");
    }
  } catch (error) {
    console.error("[Silenced Users]: Error fetching silenced users:", error);
  }
};
const retrieveToken = (token_name) => {
  return authStore.get(token_name);
};

const authSession = {
  token: retrieveToken("SESSION_TOKEN"),
  session: retrieveToken("KICK_SESSION"),
};

// Validate Session Token by Fetching User Data
const validateSessionToken = async () => {
  if (!authSession.token || !authSession.session) {
    console.log("[Session Validation]: No session tokens available");
    authStore.clear();
    localStorage.clear();
    return false;
  }

  try {
    // Get Kick ID and Username
    const { data } = await getSelfInfo(authSession.token, authSession.session);

    if (!data?.id) {
      console.warn("[Session Validation]: No user data received");
      authStore.clear();
      localStorage.clear();

      return false;
    }

    const kickId = localStorage.getItem("kickId");
    const kickUsername = localStorage.getItem("kickUsername");

    if (data?.streamer_channel?.user_id) {
      if (!kickId || kickId !== data?.streamer_channel?.user_id) {
        localStorage.setItem("kickId", data.streamer_channel.user_id);
      }

      if (!kickUsername || kickUsername?.toLowerCase() !== data?.streamer_channel?.slug?.toLowerCase()) {
        localStorage.setItem("kickUsername", data.streamer_channel.slug);
      }
    }

    // Get STV ID with error handling
    try {
      const stvData = await getUserStvProfile(data.id);
      console.log("[Session Validation]: STV Data:", stvData);
      const personalEmoteSets = stvData?.emoteSets?.filter((set) => set.type === "personal");
      if (stvData) {
        localStorage.setItem("stvId", stvData.user_id);
        localStorage.setItem("stvPersonalEmoteSets", JSON.stringify(personalEmoteSets));
        console.log("[Session Validation]: Updated stvId and stvPersonalEmoteSets");
      }
    } catch (stvError) {
      console.warn("[Session Validation]: Failed to get STV ID:", stvError);
    }

    console.log("[Session Validation]: Session validated successfully");
    return true;
  } catch (error) {
    console.error("Error validating session token:", error);
    return false;
  }
};

// Enhanced token management
const tokenManager = {
  async isValidToken() {
    return await validateSessionToken();
  },

  getToken() {
    return {
      token: authStore.get("SESSION_TOKEN"),
      session: authStore.get("KICK_SESSION"),
    };
  },

  clearTokens() {
    authStore.delete("SESSION_TOKEN");
    authStore.delete("KICK_SESSION");
  },
};

// Check Auth for API calls that require it
const withAuth = async (func) => {
  if (!authSession.token || !authSession.session) {
    console.warn("Unauthorized: No token or session found");
    return null;
  }

  return func(authSession.token, authSession.session);
};

// Initialize with error handling
const initializePreload = async () => {
  try {
    console.log("[Preload]: Starting initialization...");

    // Validate session
    const isValidSession = await validateSessionToken();

    if (isValidSession) {
      await saveSilencedUsers(authSession.token, authSession.session);
    } else {
      console.log("[Preload]: Session invalid, skipping user-specific data");
    }

    console.log("[Preload]: Initialization complete");
  } catch (error) {
    console.error("[Preload]: Initialization failed:", error);
  }
};

// Run initialization
initializePreload();

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("app", {
      minimize: () => ipcRenderer.send("minimize"),
      maximize: () => ipcRenderer.send("maximize"),
      close: () => ipcRenderer.send("close"),
      logout: () => ipcRenderer.invoke("logout"),
      getAppInfo: () => ipcRenderer.invoke("get-app-info"),
      alwaysOnTop: () => ipcRenderer.invoke("alwaysOnTop"),

      notificationSounds: {
        getAvailable: () => ipcRenderer.invoke("notificationSounds:getAvailable"),
        getSoundUrl: (soundFile) => ipcRenderer.invoke("notificationSounds:getSoundUrl", { soundFile }),
        openFolder: () => ipcRenderer.invoke("notificationSounds:openFolder"),
      },

      authDialog: {
        open: (data) => ipcRenderer.invoke("authDialog:open", { data }),
        auth: (data) => ipcRenderer.invoke("authDialog:auth", { data }),
        close: () => ipcRenderer.invoke("authDialog:close"),
      },

      userDialog: {
        open: (data) => ipcRenderer.invoke("userDialog:open", { data }),
        close: () => ipcRenderer.send("userDialog:close"),
        move: (x, y) => ipcRenderer.send("userDialog:move", { x, y }),
        pin: (pinState) => ipcRenderer.invoke("userDialog:pin", pinState),
        onData: (callback) => {
          const handler = (_, data) => {
            callback(data);
          };

          ipcRenderer.on("userDialog:data", handler);
          return () => ipcRenderer.removeListener("userDialog:data", handler);
        },
      },

      chattersDialog: {
        open: (data) => ipcRenderer.invoke("chattersDialog:open", { data }),
        close: () => ipcRenderer.invoke("chattersDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("chattersDialog:data", handler);
          return () => ipcRenderer.removeListener("chattersDialog:data", handler);
        },
      },

      settingsDialog: {
        open: (data) => ipcRenderer.invoke("settingsDialog:open", { data }),
        close: () => ipcRenderer.invoke("settingsDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("settingsDialog:data", handler);
          return () => ipcRenderer.removeListener("settingsDialog:data", handler);
        },
      },

      searchDialog: {
        open: (data) => ipcRenderer.invoke("searchDialog:open", { data }),
        close: () => ipcRenderer.invoke("searchDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => {
            callback(data);
          };
          ipcRenderer.on("searchDialog:data", handler);
          return () => ipcRenderer.removeListener("searchDialog:data", handler);
        },
      },

      modActions: {
        getBanUser: (channelName, username) => withAuth((token, session) => getBanUser(channelName, username, token, session)),
        getUnbanUser: (channelName, username) =>
          withAuth((token, session) => getUnbanUser(channelName, username, token, session)),
        getTimeoutUser: (channelName, username, banDuration) =>
          withAuth((token, session) => getTimeoutUser(channelName, username, banDuration, token, session)),
        getDeleteMessage: (chatroomId, messageId) =>
          withAuth((token, session) => getDeleteMessage(chatroomId, messageId, token, session)),
      },

      reply: {
        open: (data) => ipcRenderer.invoke("reply:open", { data }),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("reply:data", handler);
          return () => ipcRenderer.removeListener("reply:data", handler);
        },
      },

      provider: {
        refresh: (provider) => ipcRenderer.invoke("provider:refresh", { provider }),
      },

      update: {
        checkForUpdates: () => ipcRenderer.invoke("autoUpdater:check"),
        downloadUpdate: () => ipcRenderer.invoke("autoUpdater:download"),
        installUpdate: () => ipcRenderer.invoke("autoUpdater:install"),
        onUpdate: (callback) => {
          const handler = (event, update) => callback(update);
          ipcRenderer.on("autoUpdater:status", handler);
          return () => ipcRenderer.removeListener("autoUpdater:status", handler);
        },
      },

      logs: {
        get: (data) => ipcRenderer.invoke("chatLogs:get", { data }),
        add: (data) => ipcRenderer.invoke("chatLogs:add", { data }),
        updateDeleted: (chatroomId, messageId) => ipcRenderer.invoke("logs:updateDeleted", { chatroomId, messageId }),
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("chatLogs:updated", handler);
          return () => ipcRenderer.removeListener("chatLogs:updated", handler);
        },
      },

      replyLogs: {
        get: (data) => ipcRenderer.invoke("replyLogs:get", { data }),
        add: (data) => ipcRenderer.invoke("replyLogs:add", data),
        updateDeleted: (chatroomId, messageId) => ipcRenderer.invoke("replyLogs:updateDeleted", { chatroomId, messageId }),
        clear: (data) => ipcRenderer.invoke("replyLogs:clear", { data }),
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("replyLogs:updated", handler);
          return () => ipcRenderer.removeListener("replyLogs:updated", handler);
        },
      },

      replyThreadDialog: {
        open: (data) => ipcRenderer.invoke("replyThreadDialog:open", { data }),
        close: () => ipcRenderer.invoke("replyThreadDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("replyThreadDialog:data", handler);
          return () => ipcRenderer.removeListener("replyThreadDialog:data", handler);
        },
      },

      // Kick API
      kick: {
        getChannelInfo,
        getChannelChatroomInfo,
        getInitialPollInfo: (channelName) => withAuth((token, session) => getInitialPollInfo(channelName, token, session)),
        sendMessage: (channelId, message) =>
          withAuth((token, session) => sendMessageToChannel(channelId, message, token, session)),
        sendReply: (channelId, message, metadata = {}) =>
          withAuth((token, session) => sendReplyToChannel(channelId, message, metadata, token, session)),
        getSilencedUsers: () => withAuth((token, session) => getSilencedUsers(token, session)),
        getSelfInfo: async () => {
          try {
            const response = await withAuth(getSelfInfo);
            return response?.data || null;
          } catch (error) {
            console.error("Error fetching user data:", error);
            return null;
          }
        },
        getEmotes: (chatroomName) => getKickEmotes(chatroomName),
        getSelfChatroomInfo: (chatroomName) => withAuth((token, session) => getSelfChatroomInfo(chatroomName, token, session)),
        getUserChatroomInfo: (chatroomName, username) => getUserChatroomInfo(chatroomName, username),
        getInitialChatroomMessages: (channelID) => getInitialChatroomMessages(channelID),
        getSilenceUser: (userId) => withAuth((token, session) => getSilenceUser(userId, token, session)),
        getUnsilenceUser: (userId) => withAuth((token, session) => getUnsilenceUser(userId, token, session)),
        getPinMessage: (data) => withAuth((token, session) => getPinMessage(data, token, session)),
        getUnpinMessage: (chatroomName) => withAuth((token, session) => getUnpinMessage(chatroomName, token, session)),
        getSubmitPollVote: (channelName, optionId) =>
          withAuth((token, session) => getSubmitPollVote(channelName, optionId, token, session)),
        getKickAuthForEvents: (eventName, socketId) =>
          withAuth((token, session) => getKickAuthForEvents(eventName, socketId, token, session)),
        getChatroomViewers: (chatroomId) => getChatroomViewers(chatroomId),
      },

      // kickChannelActions: {
      //   // Broadcaster Actions

      //   // Channel Commands
      //   getUpdateTitle: (channelName, title) => withAuth((token, session) => getUpdateTitle(channelName, title, token, session)),
      //   getClearChatroom: (channelName) => withAuth((token, session) => getClearChatroom(channelName, token, session)),
      //   getUpdateSlowmode: (channelName, slowmodeOptions) =>
      //     withAuth((token, session) => getUpdateSlowmode(channelName, slowmodeOptions, token, session)),
      // },

      // 7TV API
      stv: {
        getChannelEmotes,
      },

      // Utility functions
      utils: {
        openExternal: (url) => shell.openExternal(url),
      },

      store: {
        get: async (key) => await ipcRenderer.invoke("store:get", { key }),
        set: async (key, value) => await ipcRenderer.invoke("store:set", { key, value }),
        delete: async (key) => await ipcRenderer.invoke("store:delete", { key }),
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);
          ipcRenderer.on("store:updated", handler);
          return () => ipcRenderer.removeListener("store:updated", handler);
        },
      },

      // Authentication utilities
      auth: {
        isValidToken: () => tokenManager.isValidToken(),
        clearTokens: () => tokenManager.clearTokens(),
        getToken: () => tokenManager.getToken(),
      },

      // Telemetry utilities
      telemetry: {
        recordMessageSent: (chatroomId, messageType, duration, success, streamerName) =>
          ipcRenderer.invoke("telemetry:recordMessageSent", { chatroomId, messageType, duration, success, streamerName }),
        recordError: (error, context) =>
          ipcRenderer.invoke("telemetry:recordError", { error, context }),
        recordRendererMemory: (memory) =>
          ipcRenderer.invoke("telemetry:recordRendererMemory", memory),
        recordDomNodeCount: (count) =>
          ipcRenderer.invoke("telemetry:recordDomNodeCount", count),
        recordWebSocketConnection: (chatroomId, streamerId, connected, streamerName) =>
          ipcRenderer.invoke("telemetry:recordWebSocketConnection", { chatroomId, streamerId, connected, streamerName }),
        recordConnectionError: (chatroomId, errorType) =>
          ipcRenderer.invoke("telemetry:recordConnectionError", { chatroomId, errorType }),
        recordMessageReceived: (chatroomId, messageType, senderId, streamerName) =>
          ipcRenderer.invoke("telemetry:recordMessageReceived", { chatroomId, messageType, senderId, streamerName }),
        recordReconnection: (chatroomId, reason) =>
          ipcRenderer.invoke("telemetry:recordReconnection", { chatroomId, reason }),
        recordAPIRequest: (endpoint, method, statusCode, duration) =>
          ipcRenderer.invoke("telemetry:recordAPIRequest", { endpoint, method, statusCode, duration }),
      },
    });
   } catch (error) {
    console.error("Failed to expose APIs:", error);
  }
} else {
  window.electron = electronAPI;
}
