import { app, shell, BrowserWindow, ipcMain, screen, session, Menu, Tray, clipboard } from "electron";
import { join } from "path";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { update } from "./utils/update";
import Store from "electron-store";
import store from "../../utils/config";

import dotenv from "dotenv";
dotenv.config();

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

const isDev = process.env.NODE_ENV === "development";

const userLogsStore = new Map(); // User logs by chatroom
const replyLogsStore = new Map(); // Reply threads by chatroom

const logLimits = {
  user: 80,
  reply: 50,
  replyThreads: 25,
};

let tray = null;

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
let searchDialog = null;
let replyThreadDialog = null;
let contextMenuWindow = null;

ipcMain.handle("store:get", async (e, { key }) => {
  if (!key) return store.store;
  return store.get(key);
});

ipcMain.handle("store:set", (e, { key, value }) => {
  const result = store.set(key, value);

  mainWindow.webContents.send("store:updated", { [key]: value });

  if (key === "general") {
    if (process.platform === "darwin") {
      mainWindow.setVisibleOnAllWorkspaces(value.alwaysOnTop, { visibleOnFullScreen: true });
      mainWindow.setAlwaysOnTop(value.alwaysOnTop);
    } else if (process.platform === "win32") {
      mainWindow.setAlwaysOnTop(value.alwaysOnTop, "screen-saver", 1);
    } else if (process.platform === "linux") {
      mainWindow.setAlwaysOnTop(value.alwaysOnTop, "screen-saver", 1);
    }
  }

  return result;
});

ipcMain.handle("store:delete", (e, { key }) => {
  const result = store.delete(key);
  mainWindow.webContents.send("store:updated", { [key]: null });

  return result;
});

const addUserLog = (chatroomId, userId, message) => {
  if (!chatroomId || !userId || !message) {
    console.error("[Chat Logs]: Invalid data received:", data);
    return null;
  }

  const key = `${chatroomId}-${userId}`;

  // Get or Create User Logs for room
  let userLogs = userLogsStore.get(key) || [];
  userLogs = [...userLogs.filter((m) => m.id !== message.id), message].slice(-logLimits.user);

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

const addReplyLog = (chatroomId, message) => {
  if (!message || !chatroomId || !message.metadata?.original_message?.id) {
    console.error("[Reply Logs]: Invalid data received:", data);
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
  replyThreadLogs = [...replyThreadLogs.filter((m) => m.id !== message.id), message].slice(-logLimits.reply);

  // Store Reply Logs
  chatroomReplyThreads.set(key, replyThreadLogs);

  if (chatroomReplyThreads.size > logLimits.replyThreads) {
    const oldestKey = chatroomReplyThreads.keys().next().value;
    chatroomReplyThreads.delete(oldestKey);
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
  const { originalMessageId, chatroomId } = data;
  if (!originalMessageId || !chatroomId) return [];

  const chatroomReplyThreads = replyLogsStore.get(chatroomId);
  if (!chatroomReplyThreads) return [];

  const replyThreadLogs = chatroomReplyThreads.get(originalMessageId);
  return replyThreadLogs || [];
});

ipcMain.handle("replyLogs:add", async (e, data) => {
  const { message, chatroomId } = data;
  return addReplyLog(chatroomId, message);
});

// setInterval(() => {

// const now = Date.now();
// const maxAge = now - 1000 * 3 * 60 * 60; // 3 hours

// userLogsStore.forEach((logs, key) => {
//   if (logs.timestamp < maxAge) {
//     userLogsStore.delete(key);
//   }
// });
// }, 3000);

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
    icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
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
      icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
      click: () => {
        mainWindow.show();
      },
    },
  ]);

  setAlwaysOnTop(mainWindow);

  mainWindow.on("ready-to-show", async () => {
    mainWindow.show();
    setAlwaysOnTop(mainWindow);
    update(mainWindow);

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on("resize", () => {
    store.set("lastMainWindowState", { ...mainWindow.getNormalBounds() });
  });

  mainWindow.on("close", () => {
    store.set("lastMainWindowState", { ...mainWindow.getNormalBounds() });
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

// Create the context menu window
// const createContextMenuWindow = (data) => {
//   const mainWindowPos = mainWindow.getPosition();

//   const newX = Math.round(mainWindowPos[0] + data.x);
//   const newY = Math.round(mainWindowPos[1] + data.y);

//   if (contextMenuWindow) {
//     contextMenuWindow.setPosition(newX, newY);
//     contextMenuWindow.show();
//     contextMenuWindow.focus();
//     contextMenuWindow.webContents.send("contextMenu:data", data);
//     return contextMenuWindow;
//   }

//   contextMenuWindow = new BrowserWindow({
//     width: 200,
//     height: 1,
//     x: newX,
//     y: newY,
//     show: true,
//     frame: false,
//     resizable: false,
//     transparent: false,
//     alwaysOnTop: true,
//     parent: mainWindow,
//     skipTaskbar: true,
//     useContentSize: true,
//     webPreferences: {
//       nodeIntegration: false,
//       contextIsolation: true,
//       preload: join(__dirname, "../preload/index.js"),
//       sandbox: false,
//     },
//   });

//   contextMenuWindow.on("blur", () => {
//     if (contextMenuWindow) {
//       contextMenuWindow.hide();
//     }
//   });

//   if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
//     contextMenuWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/contextMenu.html`);
//   } else {
//     contextMenuWindow.loadFile(join(__dirname, "../renderer/contextMenu.html"));
//   }
// };

// ipcMain.handle("contextMenu:show", (e, data) => {
//   const mainWindowPos = mainWindow.getPosition();

//   const newX = Math.round(mainWindowPos[0] + data.x);
//   const newY = Math.round(mainWindowPos[1] + data.y);

//   if (contextMenuWindow) {
//     contextMenuWindow.setPosition(newX, newY);
//     contextMenuWindow.webContents.send("contextMenu:data", data);
//     contextMenuWindow.show();
//     contextMenuWindow.focus();
//     return;
//   }

//   contextMenuWindow = new BrowserWindow({
//     width: 200,
//     height: data?.type === "message" ? 50 : data?.type === "streamer" ? 100 : 100,
//     x: newX,
//     y: newY,
//     show: true,
//     frame: false,
//     transparent: true,
//     alwaysOnTop: true,
//     parent: mainWindow,
//     skipTaskbar: true,
//     webPreferences: {
//       nodeIntegration: false,
//       contextIsolation: true,
//       preload: join(__dirname, "../preload/index.js"),
//       sandbox: false,
//     },
//   });

//   // Load the same URL as main window but with dialog hash
//   if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
//     contextMenuWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/contextMenu.html`);
//   } else {
//     contextMenuWindow.loadFile(join(__dirname, "../renderer/contextMenu.html"));
//   }

//   contextMenuWindow.once("ready-to-show", () => {
//     contextMenuWindow.show();
//     contextMenuWindow.focus();
//     contextMenuWindow.webContents.send("contextMenu:data", data);
//   });

// contextMenuWindow.on("blur", () => {
//   if (contextMenuWindow) {
//     contextMenuWindow.hide();
//   }
// });

//   contextMenuWindow.on("closed", () => {
//     contextMenuWindow = null;
//   });
// });

// ipcMain.handle("contextMenu:show", (e, { data }) => {
//   if (!contextMenuWindow) {
//     createContextMenuWindow(data);
//   }

//   contextMenuWindow.webContents.send("contextMenu:data", data);
//   contextMenuWindow.show();
//   contextMenuWindow.focus();
// });

// ipcMain.handle("contextMenu:data", (e, data) => {
//   if (!contextMenuWindow) return;
//   contextMenuWindow.webContents.send("contextMenu:data", data);
// });

// ipcMain.handle("contextMenu:show", (e, data) => {
//   console.log("contextMenu:show", data);

//   if (!contextMenuWindow) {
//     const mainWindowPos = mainWindow.getPosition();
//     menuWindow = createContextMenuWindow();
//     menuWindow.setPosition(Math.round(mainWindowPos[0] + data.x), Math.round(mainWindowPos[1] + data.y));
//   } else {
//     menuWindow = contextMenuWindow;
//   }

//   menuWindow.webContents.send("contextMenu:data", data);

//   menuWindow.show();
//   menuWindow.focus();
// });

ipcMain.handle("contextMenu:hide", () => {
  if (contextMenuWindow) {
    contextMenuWindow.hide();
  }
});

ipcMain.handle("contextMenu:messages", (e, { data }) => {
  const template = [
    {
      label: "Reply",
      click: () => {
        mainWindow.webContents.send("reply:data", data);
      },
    },
    {
      label: "Copy Message",
      click: () => {
        clipboard.writeText(data.content.trim());
      },
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

ipcMain.handle("contextMenu:streamerInfo", (e, { data }) => {
  const template = [
    {
      label: "Open stream in browser",
      click: () => {
        shell.openExternal(`https://kick.com/${data.slug}`);
      },
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

const loginToKick = async (method) => {
  const authSession = {
    token: await retrieveToken("SESSION_TOKEN"),
    session: await retrieveToken("KICK_SESSION"),
  };

  if (authSession.token && authSession.session) return true;

  const mainWindowPos = mainWindow.getPosition();
  const currentDisplay = screen.getDisplayNearestPoint({
    x: mainWindowPos[0],
    y: mainWindowPos[1],
  });
  const newX = currentDisplay.bounds.x + Math.round((currentDisplay.bounds.width - 500) / 2);
  const newY = currentDisplay.bounds.y + Math.round((currentDisplay.bounds.height - 600) / 2);

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
      icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
      webPreferences: {
        autoplayPolicy: "user-gesture-required",
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    switch (method) {
      case "kick":
        loginDialog.loadURL("https://kick.com/login");
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
    });
  });
};

const createSearchDialog = () => {
  if (searchDialog) {
    searchDialog.show();
    searchDialog.focus();
  } else {
    searchDialog = new BrowserWindow({
      width: 400,
      height: 300,
      x: mainWindow.getPosition()[0] + 100,
      y: mainWindow.getPosition()[1] + 100,
      show: true,
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

    if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
      searchDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/search.html`);
    } else {
      searchDialog.loadFile(join(__dirname, "../renderer/search.html"));
    }

    searchDialog.once("ready-to-show", () => {
      searchDialog.show();
      if (isDev) {
        searchDialog.webContents.openDevTools();
      }
    });

    searchDialog.on("closed", () => {
      searchDialog = null;
    });
  }
};

const setupLocalShortcuts = () => {
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!mainWindow.isFocused()) return;

    if (input.control || input.meta) {
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

    // Open search dialog
    // if (input.control && input.key === "f") {
    //   event.preventDefault();
    //   createSearchDialog();
    // }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  tray = new Tray(join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"));
  tray.setToolTip("KickTalk");

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

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Set up local shortcuts instead of global ones
  setupLocalShortcuts();

  // Set Zoom Levels
  // globalShortcut.register("CommandOrControl+Plus", () => {
  //   if (mainWindow && mainWindow.isFocused()) {
  //     if (mainWindow.webContents.getZoomFactor() < 1.5) {
  //       const newZoomFactor = mainWindow.webContents.getZoomFactor() + 0.1;
  //       mainWindow.webContents.setZoomFactor(newZoomFactor);
  //       store.set("zoomFactor", newZoomFactor);
  //     }
  //   }
  // });

  // globalShortcut.register("CommandOrControl+-", () => {
  //   if (mainWindow && mainWindow.isFocused()) {
  //     if (mainWindow.webContents.getZoomFactor() > 0.8) {
  //       const newZoomFactor = mainWindow.webContents.getZoomFactor() - 0.1;
  //       mainWindow.webContents.setZoomFactor(newZoomFactor);
  //       store.set("zoomFactor", newZoomFactor);
  //     }
  //   }
  // });

  // globalShortcut.register("CommandOrControl+0", () => {
  //   if (mainWindow && mainWindow.isFocused()) {
  //     const newZoomFactor = 1;
  //     mainWindow.webContents.setZoomFactor(newZoomFactor);
  //     store.set("zoomFactor", newZoomFactor);
  //   }
  // });

  // // Open Search Dialog
  // globalShortcut.register("Ctrl+F", () => {
  //   if (mainWindow && mainWindow.isFocused()) {
  //     console.log("Opening Search Dialog");
  //     if (window?.app && window?.app?.searchDialog) {
  //       window.app.searchDialog.open();
  //     }
  //   }
  // });
});

// Logout Handler
ipcMain.handle("logout", () => {
  clearAuthTokens();
  mainWindow.webContents.reload();
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
    userDialog.webContents.send("userDialog:data", { ...data, pinned: userDialog.isAlwaysOnTop() });

    return;
  }

  userDialog = new BrowserWindow({
    width: 550,
    height: 600,
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

  // Load the same URL as main window but with dialog hash
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    userDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/user.html`);
  } else {
    userDialog.loadFile(join(__dirname, "../renderer/user.html"));
  }

  userDialog.once("ready-to-show", () => {
    userDialog.show();
    userDialog.setAlwaysOnTop(false);
    userDialog.focus();

    userDialog.webContents.send("userDialog:data", { ...data, pinned: userDialog.isAlwaysOnTop() });
    userDialog.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });
  });

  userDialog.on("blur", () => {
    if (userDialog && !userDialog.isAlwaysOnTop()) {
      userDialog.close();
      mainWindow.setAlwaysOnTop(store.get("general.alwaysOnTop"));
    }
  });

  userDialog.on("closed", () => {
    dialogInfo = null;
    userDialog = null;
  });
});

ipcMain.handle("userDialog:pin", async (e, forcePinState) => {
  if (userDialog) {
    const newPinState = forcePinState !== undefined ? forcePinState : !userDialog.isAlwaysOnTop();

    if (isDev && newPinState) {
      userDialog.webContents.openDevTools();
    }

    await userDialog.setAlwaysOnTop(newPinState, "screen-saver");
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
    icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

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
    authDialog = null;
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

// Window drag handler
ipcMain.handle("window-drag", (e, { mouseX, mouseY }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    win.setPosition(mouseX, mouseY);
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

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Chatters Dialog Handler
ipcMain.handle("chattersDialog:open", (e, { data }) => {
  if (chattersDialog) {
    chattersDialog.focus();
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
    icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    chattersDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/chatters.html`);
  } else {
    chattersDialog.loadFile(join(__dirname, "../renderer/chatters.html"));
  }

  chattersDialog.once("ready-to-show", () => {
    chattersDialog.show();
    if (data) {
      chattersDialog.webContents.send("chattersDialog:data", data);
    }
    if (isDev) {
      chattersDialog.webContents.openDevTools();
    }
  });

  chattersDialog.on("closed", () => {
    chattersDialog = null;
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
// ipcMain.handle("searchDialog:open", (e, { data }) => {
// if (searchDialog) {
//   searchDialog.focus();
//   return;
// }

// const mainWindowPos = mainWindow.getPosition();
// const newX = mainWindowPos[0] + 100;
// const newY = mainWindowPos[1] + 100;

// searchDialog = new BrowserWindow({
//   width: 350,
//   minWidth: 350,
//   height: 600,
//   minHeight: 400,
//   x: newX,
//   y: newY,
//   show: false,
//   resizable: true,
//   frame: false,
//   transparent: true,
//   roundedCorners: true,
//   parent: mainWindow,
//   icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
//   webPreferences: {
//     devtools: true,
//     nodeIntegration: false,
//     contextIsolation: true,
//     preload: join(__dirname, "../preload/index.js"),
//     sandbox: false,
//   },
// });

// if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
//   searchDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/search.html`);
// } else {
//   searchDialog.loadFile(join(__dirname, "../renderer/search.html"));
// }

// searchDialog.once("ready-to-show", () => {
//   searchDialog.show();
//   if (data) {
//     searchDialog.webContents.send("searchDialog:data", data);
//   }
//   if (isDev) {
//     searchDialog.webContents.openDevTools();
//   }
// });

// searchDialog.on("closed", () => {
//   searchDialog = null;
// });
// });

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
ipcMain.handle("settingsDialog:open", (e, { data }) => {
  if (settingsDialog) {
    settingsDialog.focus();
    return;
  }

  const mainWindowPos = mainWindow.getPosition();
  const newX = mainWindowPos[0] + 100;
  const newY = mainWindowPos[1] + 100;

  settingsDialog = new BrowserWindow({
    width: 1000,
    minWidth: 1000,
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
    icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
    webPreferences: {
      devtools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    settingsDialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/settings.html`);
  } else {
    settingsDialog.loadFile(join(__dirname, "../renderer/settings.html"));
  }

  settingsDialog.once("ready-to-show", () => {
    settingsDialog.show();
    if (data) {
      settingsDialog.webContents.send("settingsDialog:data", data);
    }
    if (isDev) {
      settingsDialog.webContents.openDevTools();
    }
  });

  settingsDialog.on("closed", () => {
    settingsDialog = null;
  });
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
    replyThreadDialog = null;
  });
});

ipcMain.handle("replyThreadDialog:close", () => {
  try {
    if (replyThreadDialog) {
      replyThreadDialog.close();
      replyThreadDialog = null;
    }
  } catch (error) {
    console.error("[Reply Thread Dialog]: Error closing dialog:", error);
    replyThreadDialog = null;
  }
});
