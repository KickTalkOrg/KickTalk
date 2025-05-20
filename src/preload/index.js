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
  getBanUser,
  getUnbanUser,
  getTimeoutUser,
  getAuthForEvents,

  // User Actions
  getSilenceUser,
  getUnsilenceUser,

  // Pin
  getPinMessage,
  getUnpinMessage,
} from "../../utils/services/kick/kickAPI";
import { getUserStvId, getChannelEmotes } from "../../utils/services/seventv/stvAPI";

import Store from "electron-store";

const authStore = new Store({
  fileExtension: "env",
});

// Get Silenced users and save the in local storage
const saveSilencedUsers = async (sessionCookie, kickSession) => {
  try {
    const response = await getSilencedUsers(sessionCookie, kickSession);
    if (response.status === 200) {
      const silencedUsers = response.data;
      localStorage.setItem("silencedUsers", JSON.stringify(silencedUsers));
    }
  } catch (error) {
    console.error("Error fetching silenced users:", error);
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
  if (!authSession.token || !authSession.session) return false;

  try {
    // Get Kick ID and Username
    const { data } = await getSelfInfo(authSession.token, authSession.session);

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

    // Get STV ID
    const stvId = await getUserStvId(data.id);
    if (stvId) {
      localStorage.setItem("stvId", stvId);
    }

    return true;
  } catch (error) {
    console.error("Error validating session token:", error);
    return false;
  }
};

validateSessionToken();

saveSilencedUsers(authSession.token, authSession.session);

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("app", {
      openContextMenu: (data) => ipcRenderer.invoke("contextMenu:open", { data }),
      minimize: () => ipcRenderer.send("minimize"),
      maximize: () => ipcRenderer.send("maximize"),
      close: () => ipcRenderer.send("close"),
      logout: () => ipcRenderer.invoke("logout"),
      getAppInfo: () => ipcRenderer.invoke("get-app-info"),
      alwaysOnTop: () => ipcRenderer.invoke("alwaysOnTop"),
      getNotiSounds: () => ipcRenderer.invoke("getNotiSounds"),
      // showContextMenu: (message) => ipcRenderer.invoke("contextMenu:show", {
      //   data: message,
      // }),

      contextMenu: {
        messages: (data) => ipcRenderer.invoke("contextMenu:messages", { data }),
        streamerInfo: (data) => ipcRenderer.invoke("contextMenu:streamerInfo", { data }),
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
          const handler = (_, data) => callback(data);

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

      modActions: {
        getBanUser: (channelName, username) => getBanUser(channelName, username, authSession.token, authSession.session),
        getUnbanUser: (channelName, username) => getUnbanUser(channelName, username, authSession.token, authSession.session),
        getTimeoutUser: (channelName, username, banDuration) =>
          getTimeoutUser(channelName, username, banDuration, authSession.token, authSession.session),
      },

      reply: {
        open: (data) => ipcRenderer.invoke("reply:open", { data }),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("reply:data", handler);
          return () => ipcRenderer.removeListener("reply:data", handler);
        },
      },

      update: {
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);
          ipcRenderer.on("autoUpdater:update-available", handler);
          return () => {
            ipcRenderer.removeListener("autoUpdater:update-available", handler);
          };
        },
      },

      logs: {
        get: (data) => ipcRenderer.invoke("chatLogs:get", { data }),
        add: (data) => ipcRenderer.invoke("chatLogs:add", { data }),
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("chatLogs:updated", handler);
          return () => ipcRenderer.removeListener("chatLogs:updated", handler);
        },
      },

      replyLogs: {
        get: (data) => ipcRenderer.invoke("replyLogs:get", { data }),
        add: (data) => ipcRenderer.invoke("replyLogs:add", data),
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
        sendMessage: (channelId, message) => sendMessageToChannel(channelId, message, authSession.token, authSession.session),
        sendReply: (channelId, message, metadata = {}) =>
          sendReplyToChannel(channelId, message, metadata, authSession.token, authSession.session),
        getSilencedUsers,
        getSelfInfo: async () => {
          try {
            const response = await getSelfInfo(authSession.token, authSession.session);
            return response.data;
          } catch (error) {
            console.error("Error fetching user data:", error);
            return null;
          }
        },
        getEmotes: (chatroomName) => getKickEmotes(chatroomName),
        getSelfChatroomInfo: (chatroomName) => getSelfChatroomInfo(chatroomName, authSession.token, authSession.session),
        getUserChatroomInfo: (chatroomName, username) =>
          getUserChatroomInfo(chatroomName, username, authSession.token, authSession.session),
        getInitialChatroomMessages: (channelID) => getInitialChatroomMessages(channelID),
        getSilenceUser: (userId) => getSilenceUser(userId, authSession.token, authSession.session),
        getUnsilenceUser: (userId) => getUnsilenceUser(userId, authSession.token, authSession.session),
        getPinMessage: (data) => getPinMessage(data, authSession.token, authSession.session),
        getUnpinMessage: (chatroomName) => getUnpinMessage(chatroomName, authSession.token, authSession.session),
        getAuthForEvents: (eventName, socketId) => getAuthForEvents(eventName, socketId, authSession.token, authSession.session),
      },

      // 7TV API
      stv: {
        getChannelEmotes,
      },

      // Utility functions
      utils: {
        openExternal: (url) => shell.openExternal(url),
        getSoundUrl: (soundFile) => ipcRenderer.invoke("getSoundUrl", { soundFile }),
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
    });
  } catch (error) {
    console.error("Failed to expose APIs:", error);
  }
} else {
  window.electron = electronAPI;
}
