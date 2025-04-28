import { contextBridge, ipcRenderer, shell, session } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import {
  sendMessageToChannel,
  getChannelInfo,
  getChannelChatroomInfo,
  getKickEmotes,
  getSelfInfo,
  getUserChatroomInfo,
  getSilencedUsers,
  getKickTalkBadges,
} from "../../utils/services/kick/kickAPI";
import handleEmotes from "../../utils/emotes";
import processBadges from "../../utils/badges";
import fetch7TVData from "../../utils/7tvData";

import Store from "electron-store";

const authStore = new Store({
  fileExtension: "env",
});

function retrieveToken(token_name) {
  return authStore.get(token_name);
}

const authSession = {
  token: retrieveToken("SESSION_TOKEN"),
  session: retrieveToken("KICK_SESSION"),
};

// Validate Session Token by Fetching User Data
// const validateSessionToken = async () => {
//   if (!authSession.token) return false;

//   try {
//     await getSelfInfo(authSession.token, authSession.session);
//     return true;
//   } catch (error) {
//     console.error("Error validating session token:", error);
//     return false;
//   }
// };

// validateSessionToken();

// Utility Functions
const openURLExternally = (url) => {
  shell.openExternal(url);
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("app", {
      minimize: () => ipcRenderer.send("minimize"),
      maximize: () => ipcRenderer.send("maximize"),
      close: () => ipcRenderer.send("close"),
      bringToFront: () => ipcRenderer.invoke("bring-to-front"),
      logout: () => ipcRenderer.invoke("logout"),

      authDialog: {
        open: (data) => ipcRenderer.invoke("authDialog:open", { data }),
        auth: (data) => ipcRenderer.invoke("authDialog:auth", { data }),
        close: () => ipcRenderer.invoke("authDialog:close"),
      },

      userDialog: {
        open: (data) => ipcRenderer.invoke("userDialog:open", { data }),
        close: () => ipcRenderer.send("userDialog:close"),
        move: (x, y) => ipcRenderer.send("userDialog:move", { x, y }),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("userDialog:data", handler);
          return () => ipcRenderer.removeListener("userDialog:data", handler);
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

      // Kick API
      kick: {
        getChannelInfo,
        getChannelChatroomInfo,
        sendMessage: (channelId, message) => sendMessageToChannel(channelId, message, authSession.token, authSession.session),
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
        getUserInfo: (chatroomName, username) => getUserChatroomInfo(chatroomName, username),
        getUserChatroomInfo: (chatroomName, username) =>
          getUserChatroomInfo(chatroomName, username, authSession.token, authSession.session),
      },

      // Utility functions
      utils: {
        openExternal: (url) => shell.openExternal(url),
        handleEmotes,
        processBadges,
        fetch7TVData,
        getKickTalkBadges,
        getBadges: async () => await ipcRenderer.invoke("kicktalk:getBadges"),
      },

      store: {
        get: async (key) => await ipcRenderer.invoke("store:get", { key }),
        set: async (key, value) => await ipcRenderer.invoke("store:set", { key, value }),
        delete: async (key) => await ipcRenderer.invoke("store:delete", { key }),
        onUpdate: async (callback) => {
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
