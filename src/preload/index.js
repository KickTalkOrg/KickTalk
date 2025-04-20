import { contextBridge, ipcRenderer, shell } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import {
  sendMessageToChannel,
  getChannelInfo,
  getChannelChatroomInfo,
  getSelfInfo,
  getUserChatroomInfo,
} from "../../utils/kickAPI2";
import handleEmotes from "../../utils/emotes";
import processBadges from "../../utils/badges";
import fetch7TVData from "../../utils/7tvData";

import path from "node:path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const session = {
  token: process.env.SESSION_TOKEN,
  session: process.env.KICK_SESSION,
};

// Validate Session Token by Fetching User Data
const validateSessionToken = async () => {
  if (!session.token) return false;

  try {
    const userData = await getSelfInfo(session.token, session.session);
    const newSettings = {
      notificationPhrases: [userData.data.username, `@${userData.data.username}`],
    };

    editSettings(newSettings);
    return true;
  } catch (error) {
    console.error("Error validating session token:", error);
    return false;
  }
};

validateSessionToken();

// Utility Functions
const openURLExternally = (url) => {
  shell.openExternal(url);
};

// Load or create settings file
const loadSettings = () => {
  try {
    const settingsPath = path.resolve("settings.json");
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf-8");
      return JSON.parse(data);
    } else {
      const defaultSettings = {
        load7TVPaints: true,
        load7TVEmotes: true,
        load7TVBadges: true,
        notifications: true,
        notificationsSound: true,
        notificationSoundFile: "default",
        notificationBackground: true,
        notificationBackgroundColour: "#800000",
        notificationPhrases: [],
      };
      fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), "utf-8");
      return defaultSettings;
    }
  } catch (error) {
    console.error("Error loading settings:", error);
    return null;
  }
};

// Edit settings file
// TODO: Replace with electron-store
const editSettings = (newSettings) => {
  try {
    const settingsPath = path.resolve("settings.json");
    const currentSettings = loadSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2), "utf-8");
    return;
  } catch (error) {
    console.error("Error editing settings:", error);
    return null;
  }
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("app", {
      minimize: () => ipcRenderer.send("minimize"),
      maximize: () => ipcRenderer.send("maximize"),
      close: () => ipcRenderer.send("close"),
      bringToFront: () => ipcRenderer.invoke("bring-to-front"),
      getPosition: () => ipcRenderer.invoke("get-window-position"),

      authDialog: {
        open: (data) => ipcRenderer.invoke("authDialog:open", { data }),
        close: () => ipcRenderer.send("authDialog:close"),
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
        sendMessage: (channelId, message) => sendMessageToChannel(channelId, message, session.token, session.session),
        getSelfInfo: async () => {
          try {
            const response = await getSelfInfo(session.token, session.session);
            return response.data;
          } catch (error) {
            console.error("Error fetching user data:", error);
            return null;
          }
        },
        getUserInfo: (chatroomName, username) => getUserChatroomInfo(chatroomName, username),
      },

      // Utility functions
      utils: {
        openExternal: (url) => shell.openExternal(url),
        handleEmotes,
        processBadges,
        fetch7TVData,
      },

      loadSettings,
      editSettings,
    });
  } catch (error) {
    console.error("Failed to expose APIs:", error);
  }
} else {
  window.electron = electronAPI;
}
