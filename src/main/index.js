const { app, shell, BrowserWindow, ipcMain, screen, session, Tray, Menu, dialog } = require("electron");
import { join, basename } from "path";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { update } from "./utils/update";
import Store from "electron-store";
import store from "../../utils/config";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// Initialize telemetry early if enabled
let initTelemetry = null;
let shutdownTelemetry = null;
let isTelemetryEnabled = () => false; // Default fallback

// Function to check telemetry settings from main process
const checkTelemetrySettings = () => {
  // Check user settings
  try {
    // Use the same store approach as elsewhere in the codebase
    const settings = store.get('telemetry', { enabled: false });
    return settings.enabled === true;
  } catch (error) {
    console.warn('[Telemetry]: Could not access settings store:', error.message);
    return false;
  }
};

try {
  const telemetryModule = require("../telemetry/index.js");
  initTelemetry = telemetryModule.initTelemetry;
  shutdownTelemetry = telemetryModule.shutdownTelemetry;
  
  // Override the telemetry enabled check with our main process version
  isTelemetryEnabled = checkTelemetrySettings;
  
  if (isTelemetryEnabled()) {
    initTelemetry();
  }
} catch (error) {
  console.warn('[Telemetry]: Failed to load telemetry module:', error.message);
}

const isDev = process.env.NODE_ENV === "development";
const iconPath = process.platform === "win32" 
  ? join(__dirname, "../../resources/icons/win/KickTalk_v1.ico")
  : join(__dirname, "../../resources/icons/KickTalk_v1.png");

// Load metrics with fallback
let metrics = null;
try {
  const telemetryModule = require("../telemetry/index.js");
  metrics = telemetryModule.metrics;
} catch (error) {
  console.warn('[Telemetry]: Failed to load metrics:', error.message);
  // Fallback no-op metrics
  metrics = {
    incrementOpenWindows: () => {},
    decrementOpenWindows: () => {},
    recordError: () => {},
    recordMessageSent: () => {},
    recordMessageSendDuration: () => {},
    recordMessageReceived: () => {},
    recordRendererMemory: () => {},
    recordDomNodeCount: () => {},
    incrementWebSocketConnections: () => {},
    decrementWebSocketConnections: () => {},
    recordConnectionError: () => {},
    recordReconnection: () => {}
  };
}

const authStore = new Store({
  fileExtension: "env",
  schema: {
    SESSION_TOKEN: {
      type: "string",
    },
    KICK_SESSION: {
      type: "string",
    },
  },
});

ipcMain.setMaxListeners(100);

const userLogsStore = new Map(); // User logs by chatroom
const replyLogsStore = new Map(); // Reply threads by chatroom

const logLimits = {
  user: 80,
  reply: 50,
  replyThreads: 25,
};

let tray = null;

const createTrayContextMenu = () => {
  const isWindowVisible = mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized();
  
  return Menu.buildFromTemplate([
    {
      label: isWindowVisible ? 'Hide KickTalk' : 'Show KickTalk',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
          }
          // Update context menu after visibility change
          tray.setContextMenu(createTrayContextMenu());
        }
      }
    },
    {
      label: 'Settings',
      click: async () => {
        try {
          await openSettingsDialog({ userData: null });
        } catch (error) {
          console.error('[Tray]: Error opening settings:', error);
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: async () => {
        // Proper shutdown with telemetry cleanup
        if (isTelemetryEnabled()) {
          if (allWindows.size > 0) {
            const openWindowTitles = Array.from(allWindows).map(win => win.getTitle());
            console.error(`[ProcessExit] Closing with ${allWindows.size} windows still open: ${openWindowTitles.join(", ")}`);
            metrics.recordError(new Error("Lingering windows on exit"), { openWindows: openWindowTitles });
          }
          if (shutdownTelemetry) {
            try {
              await shutdownTelemetry();
            } catch (error) {
              console.warn('[Telemetry]: Failed to shutdown telemetry:', error.message);
            }
          }
        }
        app.quit();
      }
    }
  ]);
};

const storeToken = async (token_name, token) => {
  if (!token || !token_name) return;

  try {
    authStore.set(token_name, token);
  } catch (error) {
    console.error("[Auth Token]: Error storing token:", error);
  }
};

const retrieveToken = async (token_name) => {
  try {
    const token = await authStore.get(token_name);
    return token || null;
  } catch (error) {
    console.error("[Auth Token]: Error retrieving token:", error);
    return null;
  }
};

const clearAuthTokens = async () => {
  try {
    authStore.clear();
    await session.defaultSession.clearStorageData({
      storages: ["cookies"],
    });
  } catch (error) {
    console.error("[Auth Token]: Error clearing tokens & cookies:", error);
  }
};

let dialogInfo = null;
let replyThreadInfo = null;

let mainWindow = null;
let userDialog = null;
let authDialog = null;
let chattersDialog = null;
let settingsDialog = null;

// Track all windows for telemetry
const allWindows = new Set();

// Centralized Settings Dialog creator to avoid duplication
const openSettingsDialog = async (data) => {
  const settings = store.get();

  if (settingsDialog) {
    settingsDialog.focus();
    if (data) {
      settingsDialog.webContents.send("settingsDialog:data", { ...data, settings });
    }
    return;
  }

  const mainWindowPos = mainWindow.getPosition();
  const mainWindowSize = mainWindow.getSize();

  const newX = mainWindowPos[0] + Math.round((mainWindowSize[0] - 1200) / 2);
  const newY = mainWindowPos[1] + Math.round((mainWindowSize[1] - 700) / 2);

  settingsDialog = new BrowserWindow({
    width: 1200,
    minWidth: 800,
    height: 700,
    minHeight: 600,
    x: newX,
    y: newY,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: "#020a05",
    roundedCorners: true,
    parent: mainWindow,
    icon: iconPath,
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  metrics.incrementOpenWindows();
  allWindows.add(settingsDialog);

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    settingsDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/settings.html`);
  } else {
    settingsDialog.loadFile(join(__dirname, "../renderer/settings.html"));
  }

  settingsDialog.once("ready-to-show", () => {
    settingsDialog.show();
    if (data) {
      settingsDialog.webContents.send("settingsDialog:data", { ...data, settings });
    }
    if (isDev) {
      settingsDialog.webContents.openDevTools();
    }

    settingsDialog.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });
  });

  settingsDialog.on("closed", () => {
    allWindows.delete(settingsDialog);
    settingsDialog = null;
    metrics.decrementOpenWindows();
  });
};

let searchDialog = null;
let replyThreadDialog = null;
let availableNotificationSounds = [];

// Notification Sounds Handler
const getNotificationSounds = () => {
  // Determine the correct sounds directory based on packaging
  const basePath = app.isPackaged
    ? join(process.resourcesPath, "app.asar.unpacked/resources/sounds")
    : join(__dirname, "../../resources/sounds");

  availableNotificationSounds = fs
    .readdirSync(basePath)
    .filter((file) => file.endsWith(".mp3") || file.endsWith(".wav"))
    .map((file) => ({
      name: file.replace(/\.(mp3|wav)$/, ""),
      value: join(basePath, file),
    }));

  console.log("Notification Sounds:", availableNotificationSounds);
  return availableNotificationSounds;
};

const openNotificationFolder = async () => {
  const result = await dialog.showOpenDialog(settingsDialog || mainWindow, {
    title: "Select Notification Sound",
    filters: [
      { name: "Audio Files", extensions: ["mp3", "wav"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const selectedFile = result.filePaths[0];
  const fileName = basename(selectedFile);

  const basePath = app.isPackaged
    ? join(process.resourcesPath, "app.asar.unpacked/resources/sounds")
    : join(__dirname, "../../resources/sounds");

  const destPath = join(basePath, fileName);

  try {
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }

    // Copy file to sounds directory
    fs.copyFileSync(selectedFile, destPath);
    getNotificationSounds();

    console.log("[Notification Sounds]: File uploaded successfully:", fileName);

    return {
      name: fileName.split(".")[0],
      value: destPath,
      fileName: fileName,
    };
  } catch (error) {
    console.error("[Notification Sounds]: Error uploading file:", error);
    return null;
  }
};

getNotificationSounds(); // Load initially

const handleNotificationSound = (soundFile) => {
  if (!soundFile) return null;

  const audioBuffer = fs.readFileSync(soundFile);
  const audioBase64 = audioBuffer.toString("base64");
  const mimeType = soundFile.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  return `data:${mimeType};base64,${audioBase64}`;
};

const getSoundUrl = (soundObject) => {
  if (!soundObject?.value) return null;

  if (isDev) {
    try {
      return handleNotificationSound(soundObject.value);
    } catch (error) {
      console.error("[Notification Sounds]: Error reading sound file:", error);
      return null;
    }
  } else {
    return `file://${soundObject.value}`;
  }
};

ipcMain.handle("notificationSounds:openFolder", async () => {
  return await openNotificationFolder();
});

ipcMain.handle("notificationSounds:getAvailable", () => {
  getNotificationSounds();
  return availableNotificationSounds;
});

ipcMain.handle("notificationSounds:getSoundUrl", (e, { soundFile }) => {
  if (!soundFile) {
    const defaultSound = availableNotificationSounds.find((s) => s.name === "default");
    return getSoundUrl(defaultSound);
  }

  const found = availableNotificationSounds.find((s) => s.name === soundFile || s.value.endsWith(soundFile));

  // If not found, fallback to default
  if (!found) {
    const defaultSound = availableNotificationSounds.find((s) => s.name === "default");
    return getSoundUrl(defaultSound);
  }

  // Return the found sound
  return getSoundUrl(found);
});

// [Store Handlers]
ipcMain.handle("store:get", async (e, { key }) => {
  if (!key) return store.store;
  return store.get(key);
});

ipcMain.handle("store:set", (e, { key, value }) => {
  const result = store.set(key, value);

  // Broadcast to all windows
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("store:updated", { [key]: value });
  });

  if (key === "general") {
    if (process.platform === "darwin") {
      mainWindow.setVisibleOnAllWorkspaces(value.alwaysOnTop, { visibleOnFullScreen: true });
      mainWindow.setAlwaysOnTop(value.alwaysOnTop);
    } else if (process.platform === "win32") {
      mainWindow.setAlwaysOnTop(value.alwaysOnTop, "screen-saver", 1);
    } else if (process.platform === "linux") {
      mainWindow.setAlwaysOnTop(value.alwaysOnTop, "screen-saver", 1);
    }

    // Handle auto-update setting changes
    if (Object.prototype.hasOwnProperty.call(value, 'autoUpdate') && value.autoUpdate === false) {
      // Dismiss any active update notifications when auto-update is disabled
      mainWindow.webContents.send("autoUpdater:dismiss");
    }
  }

  return result;
});

ipcMain.handle("store:delete", (e, { key }) => {
  const result = store.delete(key);
  mainWindow.webContents.send("store:updated", { [key]: null });

  return result;
});

const addUserLog = (chatroomId, userId, message, isDeleted = false) => {
  if (!chatroomId || !userId || !message) {
    console.error("[Chat Logs]: Invalid data received:", { chatroomId, userId, message, isDeleted });
    return null;
  }

  const key = `${chatroomId}-${userId}`;

  // Get or Create User Logs for room
  let userLogs = userLogsStore.get(key) || [];

  // If updating a deleted flag, update the existing message
  if (isDeleted) {
    userLogs = userLogs.map((msg) => {
      if (msg.id === message.id) {
        return { ...msg, deleted: true };
      }
      return msg;
    });
  } else {
    userLogs = [...userLogs.filter((m) => m.id !== message.id), message]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-logLimits.user);
  }

  // Store User Logs
  userLogsStore.set(key, userLogs);

  if (userDialog && dialogInfo?.chatroomId === chatroomId && dialogInfo?.userId === userId) {
    userDialog.webContents.send("chatLogs:updated", {
      chatroomId,
      userId,
      logs: userLogs,
    });
  }

  return { messages: userLogs };
};

const addReplyLog = (chatroomId, message, isDeleted = false) => {
  if (!message || !chatroomId || !message.metadata?.original_message?.id) {
    console.error("[Reply Logs]: Invalid data received:", { chatroomId, message, isDeleted });
    return null;
  }

  const key = message.metadata.original_message.id;

  // Get Chatroom Reply Threads
  let chatroomReplyThreads = replyLogsStore.get(chatroomId);
  if (!chatroomReplyThreads) {
    chatroomReplyThreads = new Map();
    replyLogsStore.set(chatroomId, chatroomReplyThreads);
  }

  // Get or Create Reply Logs for original message
  let replyThreadLogs = chatroomReplyThreads.get(key) || [];

  // If this is a delete operation, update existing message
  if (isDeleted) {
    replyThreadLogs = replyThreadLogs.map((msg) => {
      if (msg.id === message.id) {
        return { ...msg, deleted: true };
      }
      return msg;
    });
  } else {
    // Normal add operation
    replyThreadLogs = [...replyThreadLogs.filter((m) => m.id !== message.id), message]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-logLimits.reply);
  }

  // Store Reply Logs
  chatroomReplyThreads.set(key, replyThreadLogs);

  if (chatroomReplyThreads.size > logLimits.replyThreads) {
    const oldestKey = chatroomReplyThreads.keys().next().value;
    chatroomReplyThreads.delete(oldestKey);
  }

  // Update user dialog if the reply is from the user being viewed
  if (userDialog && dialogInfo?.chatroomId === chatroomId && dialogInfo?.userId === message.sender.id) {
    userDialog.webContents.send("chatLogs:updated", {
      chatroomId,
      userId: message.sender.id,
      logs: replyThreadLogs,
    });
  }

  if (replyThreadDialog && replyThreadInfo?.originalMessageId === key) {
    replyThreadDialog.webContents.send("replyLogs:updated", {
      originalMessageId: key,
      messages: replyThreadLogs,
    });
  }

  return replyThreadLogs;
};

ipcMain.handle("chatLogs:get", async (e, { data }) => {
  const { chatroomId, userId } = data;
  if (!chatroomId || !userId) return [];

  const key = `${chatroomId}-${userId}`;
  return userLogsStore.get(key) || [];
});

ipcMain.handle("chatLogs:add", async (e, { data }) => {
  const { chatroomId, userId, message } = data;
  return addUserLog(chatroomId, userId, message);
});

ipcMain.handle("replyLogs:get", async (e, { data }) => {
  const { originalMessageId, chatroomId, userId } = data;
  if (!chatroomId) return [];

  const chatroomReplyThreads = replyLogsStore.get(chatroomId);
  if (!chatroomReplyThreads) return [];

  if (userId) {
    const allUserReplies = [];
    chatroomReplyThreads.forEach((replies) => {
      const userReplies = replies.filter((reply) => reply.sender.id === userId);
      allUserReplies.push(...userReplies);
    });
    return allUserReplies;
  }

  // Otherwise return replies for a specific thread
  const replyThreadLogs = chatroomReplyThreads.get(originalMessageId);
  return replyThreadLogs || [];
});

ipcMain.handle("replyLogs:add", async (e, data) => {
  const { message, chatroomId } = data;
  return addReplyLog(chatroomId, message);
});

ipcMain.handle("logs:updateDeleted", async (e, { chatroomId, messageId }) => {
  let updated = false;
  userLogsStore.forEach((userLogs, key) => {
    if (key.startsWith(`${chatroomId}-`)) {
      const messageToUpdate = userLogs.find((msg) => msg.id === messageId);
      if (messageToUpdate) {
        const userId = key.substring(`${chatroomId}-`.length);
        addUserLog(chatroomId, userId, messageToUpdate, true);
        updated = true;
      }
    }
  });
  return updated;
});

ipcMain.handle("replyLogs:updateDeleted", async (e, { chatroomId, messageId }) => {
  const chatroomReplyThreads = replyLogsStore.get(chatroomId);
  if (!chatroomReplyThreads) return false;

  let updated = false;
  chatroomReplyThreads.forEach((replyThreadLogs) => {
    const messageToUpdate = replyThreadLogs.find((msg) => msg.id === messageId);
    if (messageToUpdate) {
      addReplyLog(chatroomId, messageToUpdate, true);
      updated = true;
    }
  });
  return updated;
});

// Handle window focus
ipcMain.handle("bring-to-front", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});


const setAlwaysOnTop = (window) => {
  const alwaysOnTopSetting = store.get("general.alwaysOnTop");

  if (alwaysOnTopSetting) {
    if (process.platform === "darwin") {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.setFullScreenable(false);
      window.setAlwaysOnTop(true);
    } else if (process.platform === "win32") {
      window.setAlwaysOnTop(true, "screen-saver");
      window.setVisibleOnAllWorkspaces(true);
    } else if (process.platform === "linux") {
      window.setAlwaysOnTop(true, "screen-saver");
      window.setVisibleOnAllWorkspaces(true);
    }
  }
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: store.get("lastMainWindowState.width"),
    height: store.get("lastMainWindowState.height"),
    x: store.get("lastMainWindowState.x"),
    y: store.get("lastMainWindowState.y"),
    minWidth: 335,
    minHeight: 250,
    show: false,
    backgroundColor: "#06190e",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    roundedCorners: true,
    icon: iconPath,
    webPreferences: {
      devTools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setThumbarButtons([
    {
      icon: iconPath,
      click: () => {
        mainWindow.show();
      },
    },
  ]);

  setAlwaysOnTop(mainWindow);
  metrics.incrementOpenWindows();

  mainWindow.once("ready-to-show", async () => {
    mainWindow.show();
    setAlwaysOnTop(mainWindow);
    allWindows.add(mainWindow);

    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.on("resize", () => {
    store.set("lastMainWindowState", { ...mainWindow.getNormalBounds() });
  });

  mainWindow.on("close", () => {
    store.set("lastMainWindowState", { ...mainWindow.getNormalBounds() });
    allWindows.delete(mainWindow);
    metrics.decrementOpenWindows();
  });

  // Update tray context menu when window state changes
  mainWindow.on('show', () => {
    if (tray) tray.setContextMenu(createTrayContextMenu());
  });

  mainWindow.on('hide', () => {
    if (tray) tray.setContextMenu(createTrayContextMenu());
  });

  mainWindow.on('minimize', () => {
    if (tray) tray.setContextMenu(createTrayContextMenu());
  });

  mainWindow.on('restore', () => {
    if (tray) tray.setContextMenu(createTrayContextMenu());
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  mainWindow.webContents.setZoomFactor(store.get("zoomFactor"));

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

const loginToKick = async (method) => {
  const authSession = {
    token: await retrieveToken("SESSION_TOKEN"),
    session: await retrieveToken("KICK_SESSION"),
  };

  if (authSession.token && authSession.session) return true;

  const mainWindowPos = mainWindow.getPosition();
  const mainWindowSize = mainWindow.getSize();

  const newX = mainWindowPos[0] + Math.round((mainWindowSize[0] - 1400) / 2);
  const newY = mainWindowPos[1] + Math.round((mainWindowSize[1] - 750) / 2);

  return new Promise((resolve) => {
    const loginDialog = new BrowserWindow({
      width: 460,
      height: 630,
      x: newX,
      y: newY,
      show: true,
      resizable: false,
      transparent: true,
      autoHideMenuBar: true,
      parent: authDialog,
      roundedCorners: true,
      icon: iconPath,
      webPreferences: {
        autoplayPolicy: "user-gesture-required",
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    metrics.incrementOpenWindows();
    allWindows.add(loginDialog);

    switch (method) {
      case "kick":
        loginDialog.loadURL("https://kick.com/");
        loginDialog.webContents.on("did-finish-load", () => {
          loginDialog.webContents.executeJavaScript(
            `const interval = setInterval(() => {
              const el = document.querySelector('div.flex.items-center.gap-4 > button:last-child');
              if (el) {
                el.click();
                clearInterval(interval);  
              }
            }, 100);`,
          );
          loginDialog.webContents.setAudioMuted(true);
        });
        break;
      case "google":
        loginDialog.loadURL(
          "https://accounts.google.com/o/oauth2/auth?client_id=582091208538-64t6f8i044gppt1etba67qu07t4fimuf.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fkick.com%2Fsocial%2Fgoogle%2Fcallback&scope=openid+profile+email&response_type=code",
        );
        break;
      case "apple":
        loginDialog.loadURL(
          "https://appleid.apple.com/auth/authorize?client_id=com.kick&redirect_uri=https%3A%2F%2Fkick.com%2Fredirect%2Fapple&scope=name%20email&response_type=code&response_mode=form_post",
        );
        break;
      default:
        console.error("[Auth Login]:Unknown login method:", method);
    }

    const checkForSessionToken = async () => {
      const cookies = await session.defaultSession.cookies.get({ domain: "kick.com" });
      const sessionCookie = cookies.find((cookie) => cookie.name === "session_token");
      const kickSession = cookies.find((cookie) => cookie.name === "kick_session");
      if (sessionCookie && kickSession) {
        // Save the session token and kick session to the .env file
        const sessionToken = decodeURIComponent(sessionCookie.value);
        const kickSessionValue = decodeURIComponent(kickSession.value);

        await storeToken("SESSION_TOKEN", sessionToken);
        await storeToken("KICK_SESSION", kickSessionValue);

        loginDialog.close();
        authDialog.close();
        mainWindow.webContents.reload();

        resolve(true);
        return true;
      }

      return false;
    };

    const interval = setInterval(async () => {
      if (await checkForSessionToken()) {
        clearInterval(interval);
      }
    }, 1000);

    loginDialog.on("closed", () => {
      clearInterval(interval);
      resolve(false);
      allWindows.delete(loginDialog);
      metrics.decrementOpenWindows();
    });
  });
};

const setupLocalShortcuts = () => {
  mainWindow.webContents.on("zoom-changed", (event, zoomDirection) => {
    if (zoomDirection === "in") {
      event.preventDefault();
      if (mainWindow.webContents.getZoomFactor() < 1.5) {
        const newZoomFactor = mainWindow.webContents.getZoomFactor() + 0.1;
        mainWindow.webContents.setZoomFactor(newZoomFactor);
        store.set("zoomFactor", newZoomFactor);
      }
    } else if (zoomDirection === "out") {
      event.preventDefault();
      if (mainWindow.webContents.getZoomFactor() > 0.8) {
        const newZoomFactor = mainWindow.webContents.getZoomFactor() - 0.1;
        mainWindow.webContents.setZoomFactor(newZoomFactor);
        store.set("zoomFactor", newZoomFactor);
      }
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!mainWindow.isFocused()) return;

    if (input.control || input.meta) {
      // if mouse scroll up zoom in mouse only

      if (input.key === "=" || input.key === "+") {
        event.preventDefault();
        if (mainWindow.webContents.getZoomFactor() < 1.5) {
          const newZoomFactor = mainWindow.webContents.getZoomFactor() + 0.1;
          mainWindow.webContents.setZoomFactor(newZoomFactor);
          store.set("zoomFactor", newZoomFactor);
        }
      }

      // Zoom out with Ctrl/Cmd + Minus
      else if (input.key === "-") {
        event.preventDefault();
        if (mainWindow.webContents.getZoomFactor() > 0.8) {
          const newZoomFactor = mainWindow.webContents.getZoomFactor() - 0.1;
          mainWindow.webContents.setZoomFactor(newZoomFactor);
          store.set("zoomFactor", newZoomFactor);
        }
      }

      // Reset zoom with Ctrl/Cmd + 0
      else if (input.key === "0") {
        event.preventDefault();
        const newZoomFactor = 1;
        mainWindow.webContents.setZoomFactor(newZoomFactor);
        store.set("zoomFactor", newZoomFactor);
      }
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  tray = new Tray(iconPath);
  tray.setToolTip("KickTalk");
  
  // Set up context menu
  tray.setContextMenu(createTrayContextMenu());
  
  // Handle single-click to show/hide window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }
      // Update context menu after visibility change
      tray.setContextMenu(createTrayContextMenu());
    }
  });

  // Set the icon for the app
  if (process.platform === "win32") {
    app.setAppUserModelId(process.execPath);
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId("com.kicktalk.app");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on("ping", () => console.log("pong"));

  createWindow();

  // Initialize auto-updater
  update(mainWindow);

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Set up local shortcuts instead of global ones
  setupLocalShortcuts();
});

// Logout Handler
ipcMain.handle("logout", () => {
  dialog
    .showMessageBox(settingsDialog, {
      type: "question",
      title: "Sign Out",
      message: "Are you sure you want to sign out?",
      buttons: ["Yes", "Cancel"],
    })
    // Dialog returns a promise so let's handle it correctly
    .then((result) => {
      if (result.response !== 0) return;

      if (result.response === 0) {
        clearAuthTokens();
        mainWindow.webContents.reload();
        settingsDialog.close();
      }
    });
});

// User Dialog Handler
ipcMain.handle("userDialog:open", (e, { data }) => {
  dialogInfo = {
    chatroomId: data.chatroomId,
    userId: data.sender.id,
  };

  const mainWindowPos = mainWindow.getPosition();
  const newX = mainWindowPos[0] + data.cords[0] - 150;
  const newY = mainWindowPos[1] + data.cords[1] - 100;

  if (userDialog) {
    userDialog.setPosition(newX, newY);
    userDialog.webContents.send("userDialog:data", { ...data, pinned: false });
    return;
  }

  userDialog = new BrowserWindow({
    width: 600,
    height: 600,
    x: newX,
    y: newY,
    show: false,
    resizable: false,
    frame: false,
    transparent: true,
    parent: mainWindow,
    backgroundColor: "#020a05",
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  metrics.incrementOpenWindows();
  allWindows.add(userDialog);

  // Load the same URL as main window but with dialog hash
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    userDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/user.html`);
  } else {
    userDialog.loadFile(join(__dirname, "../renderer/user.html"));
  }

  userDialog.once("ready-to-show", () => {
    userDialog.show();

    userDialog.setAlwaysOnTop(false);
    userDialog.setVisibleOnAllWorkspaces(false);
    userDialog.focus();

    userDialog.webContents.send("userDialog:data", { ...data, pinned: false });
    userDialog.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });
  });

  userDialog.on("blur", () => {
    if (userDialog && !userDialog.isAlwaysOnTop()) {
      userDialog.close();
    }
  });

  userDialog.on("closed", () => {
    setAlwaysOnTop(mainWindow);
    dialogInfo = null;
    allWindows.delete(userDialog);
    userDialog = null;
    metrics.decrementOpenWindows();
  });
});

ipcMain.handle("userDialog:pin", async (e, forcePinState) => {
  if (userDialog) {
    const newPinState = forcePinState !== undefined ? forcePinState : !userDialog.isAlwaysOnTop();

    if (isDev && newPinState) {
      // userDialog.webContents.openDevTools();
    }

    // Don't persist pin state - it should reset when dialog closes
    await userDialog.setAlwaysOnTop(newPinState);
    await userDialog.setVisibleOnAllWorkspaces(newPinState);
  }
});

// Auth Dialog Handler
ipcMain.handle("authDialog:open", (e) => {
  const mainWindowPos = mainWindow.getPosition();
  const currentDisplay = screen.getDisplayNearestPoint({
    x: mainWindowPos[0],
    y: mainWindowPos[1],
  });
  const newX = currentDisplay.bounds.x + Math.round((currentDisplay.bounds.width - 600) / 2);
  const newY = currentDisplay.bounds.y + Math.round((currentDisplay.bounds.height - 750) / 2);

  if (authDialog) {
    authDialog.focus();
    return;
  }

  authDialog = new BrowserWindow({
    width: 600,
    minHeight: 400,
    x: newX,
    y: newY,
    show: true,
    resizable: false,
    frame: false,
    transparent: true,
    roundedCorners: true,
    parent: mainWindow,
    icon: iconPath,
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  metrics.incrementOpenWindows();
  allWindows.add(authDialog);

  // Load the same URL as main window but with dialog hash
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    authDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/auth.html`);
  } else {
    authDialog.loadFile(join(__dirname, "../renderer/auth.html"));
  }

  authDialog.once("ready-to-show", () => {
    authDialog.show();
    if (isDev) {
      authDialog.webContents.openDevTools();
    }
  });

  authDialog.on("closed", () => {
    allWindows.delete(authDialog);
    authDialog = null;
    metrics.decrementOpenWindows();
  });
});

ipcMain.handle("authDialog:auth", async (e, { data }) => {
  if (data.type) {
    const result = await loginToKick(data.type);
    if (result) {
      authDialog.close();
      authDialog = null;
    }
  }
});

ipcMain.handle("authDialog:close", () => {
  if (authDialog) {
    authDialog.close();
    authDialog = null;
  }
});

ipcMain.handle("alwaysOnTop", () => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop());
  }
});

// Window Controls
ipcMain.on("minimize", () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on("maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on("close", () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// Get App Info
ipcMain.handle("get-app-info", () => {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
  };
});

// Telemetry handlers
ipcMain.handle("telemetry:recordMessageSent", (e, { chatroomId, messageType = 'regular', duration = null, success = true, streamerName = null }) => {
  if (isTelemetryEnabled()) {
    metrics.recordMessageSent(chatroomId, messageType, streamerName);
    if (duration !== null) {
      metrics.recordMessageSendDuration(duration, chatroomId, success);
    }
  }
});

ipcMain.handle("telemetry:recordError", (e, { error, context = {} }) => {
  if (isTelemetryEnabled()) {
    const errorObj = new Error(error.message || error);
    errorObj.name = error.name || 'RendererError';
    errorObj.stack = error.stack;
    metrics.recordError(errorObj, context);
  }
});

ipcMain.handle("telemetry:recordRendererMemory", (e, memory) => {
  if (isTelemetryEnabled()) {
    metrics.recordRendererMemory(memory);
  }
});

ipcMain.handle("telemetry:recordDomNodeCount", (e, count) => {
  if (isTelemetryEnabled()) {
    metrics.recordDomNodeCount(count);
  }
});

ipcMain.handle("telemetry:recordWebSocketConnection", (e, { chatroomId, streamerId, connected, streamerName }) => {
  if (isTelemetryEnabled()) {
    if (connected) {
      metrics.incrementWebSocketConnections(chatroomId, streamerId, streamerName);
    } else {
      metrics.decrementWebSocketConnections(chatroomId, streamerId, streamerName);
    }
  }
});

ipcMain.handle("telemetry:recordConnectionError", (e, { chatroomId, errorType }) => {
  if (isTelemetryEnabled()) {
    metrics.recordConnectionError(errorType, chatroomId);
  }
});

ipcMain.handle("telemetry:recordMessageReceived", (e, { chatroomId, messageType, senderId, streamerName }) => {
  if (isTelemetryEnabled()) {
    metrics.recordMessageReceived(chatroomId, messageType, senderId, streamerName);
  }
});

ipcMain.handle("telemetry:recordReconnection", (e, { chatroomId, reason }) => {
  if (isTelemetryEnabled()) {
    metrics.recordReconnection(chatroomId, reason);
  }
});

ipcMain.handle("telemetry:recordAPIRequest", (e, { endpoint, method, statusCode, duration }) => {
  if (isTelemetryEnabled()) {
    metrics.recordAPIRequest(endpoint, method, statusCode, duration);
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    // Shutdown telemetry before quitting
    if (isTelemetryEnabled()) {
      if (allWindows.size > 0) {
        const openWindowTitles = Array.from(allWindows).map(win => win.getTitle());
        console.error(`[ProcessExit] Closing with ${allWindows.size} windows still open: ${openWindowTitles.join(", ")}`);
        metrics.recordError(new Error("Lingering windows on exit"), { openWindows: openWindowTitles });
      }
      if (shutdownTelemetry) {
        try {
          await shutdownTelemetry();
        } catch (error) {
          console.warn('[Telemetry]: Failed to shutdown telemetry:', error.message);
        }
      }
    }
    app.quit();
  }
});

// Chatters Dialog Handler
ipcMain.handle("chattersDialog:open", (e, { data }) => {
  if (chattersDialog) {
    chattersDialog.focus();
    if (data) {
      chattersDialog.webContents.send("chattersDialog:data", data);
    }
    return;
  }

  const mainWindowPos = mainWindow.getPosition();
  const newX = mainWindowPos[0] + 100;
  const newY = mainWindowPos[1] + 100;

  chattersDialog = new BrowserWindow({
    width: 350,
    minWidth: 350,
    height: 600,
    minHeight: 400,
    x: newX,
    y: newY,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    roundedCorners: true,
    parent: mainWindow,
    icon: iconPath,
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  metrics.incrementOpenWindows();
  allWindows.add(chattersDialog);

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    chattersDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/chatters.html`);
  } else {
    chattersDialog.loadFile(join(__dirname, "../renderer/chatters.html"));
  }

  chattersDialog.once("ready-to-show", () => {
    chattersDialog.show();
    if (isDev) {
      chattersDialog.webContents.openDevTools();
    }
    if (data) {
      chattersDialog.webContents.send("chattersDialog:data", data);
    }
  });

  chattersDialog.on("closed", () => {
    allWindows.delete(chattersDialog);
    chattersDialog = null;
    metrics.decrementOpenWindows();
  });
});

ipcMain.handle("chattersDialog:close", () => {
  try {
    if (chattersDialog) {
      chattersDialog.close();
      chattersDialog = null;
    }
  } catch (error) {
    console.error("[Chatters Dialog]: Error closing dialog:", error);
    chattersDialog = null;
  }
});

// Search Dialog Handler
ipcMain.handle("searchDialog:open", (e, { data }) => {
  if (searchDialog) {
    searchDialog.focus();
    searchDialog.webContents.send("searchDialog:data", data);
    return;
  }

  const mainWindowPos = mainWindow.getPosition();
  const newX = mainWindowPos[0] + 100;
  const newY = mainWindowPos[1] + 100;

  searchDialog = new BrowserWindow({
    width: 650,
    minWidth: 650,
    height: 600,
    minHeight: 600,
    x: newX,
    y: newY,
    show: false,
    resizable: true,
    frame: false,
    transparent: true,
    roundedCorners: true,
    parent: mainWindow,
    icon: iconPath,
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  metrics.incrementOpenWindows();
  allWindows.add(searchDialog);

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    searchDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/search.html`);
  } else {
    searchDialog.loadFile(join(__dirname, "../renderer/search.html"));
  }

  searchDialog.once("ready-to-show", () => {
    searchDialog.show();
    if (isDev) {
      searchDialog.webContents.openDevTools({ mode: "detach" });
    }

    if (data) {
      searchDialog.webContents.send("searchDialog:data", data);
      searchDialog.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
      });
    }
  });

  searchDialog.on("closed", () => {
    allWindows.delete(searchDialog);
    searchDialog = null;
    metrics.decrementOpenWindows();
  });
});

ipcMain.handle("searchDialog:close", () => {
  try {
    if (searchDialog) {
      searchDialog.close();
      searchDialog = null;
    }
  } catch (error) {
    console.error("[Search Dialog]: Error closing dialog:", error);
    searchDialog = null;
  }
});

// Settings Dialog Handler
ipcMain.handle("settingsDialog:open", async (e, { data }) => {
  await openSettingsDialog(data);
});

ipcMain.handle("settingsDialog:close", () => {
  try {
    if (settingsDialog) {
      settingsDialog.close();
      settingsDialog = null;
    }
  } catch (error) {
    console.error("[Settings Dialog]: Error closing dialog:", error);
    settingsDialog = null;
  }
});

// Reply Input Handler
ipcMain.handle("reply:open", (e, { data }) => {
  mainWindow.webContents.send("reply:data", data);
});

// Reply Thread Dialog Handler
ipcMain.handle("replyThreadDialog:open", (e, { data }) => {
  replyThreadInfo = {
    chatroomId: data.chatroomId,
    originalMessageId: data.originalMessageId,
  };
  if (replyThreadDialog) {
    replyThreadDialog.focus();
    replyThreadDialog.webContents.send("replyThreadDialog:data", data);
    return;
  }

  const mainWindowPos = mainWindow.getPosition();
  const newX = mainWindowPos[0] + 100;
  const newY = mainWindowPos[1] + 100;

  replyThreadDialog = new BrowserWindow({
    width: 550,
    height: 500,
    x: newX,
    y: newY,
    show: false,
    resizable: false,
    frame: false,
    transparent: true,
    parent: mainWindow,
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  metrics.incrementOpenWindows();
  allWindows.add(replyThreadDialog);

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    replyThreadDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/replyThread.html`);
  } else {
    replyThreadDialog.loadFile(join(__dirname, "../renderer/replyThread.html"));
  }

  replyThreadDialog.once("ready-to-show", () => {
    replyThreadDialog.show();

    if (data) {
      replyThreadDialog.webContents.send("replyThreadDialog:data", data);
    }

    if (isDev) {
      replyThreadDialog.webContents.openDevTools();
    }
  });

  replyThreadDialog.on("closed", () => {
    allWindows.delete(replyThreadDialog);
    replyThreadDialog = null;
    metrics.decrementOpenWindows();
  });
});

ipcMain.handle("replyThreadDialog:close", () => {
  try {
    if (replyThreadDialog) {
      replyThreadDialog.close();
    }
  } catch (error) {
    console.error("[Reply Thread Dialog]: Error closing dialog:", error);
  }
});
