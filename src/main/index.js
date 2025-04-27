import { app, shell, BrowserWindow, ipcMain, screen, globalShortcut, session, safeStorage } from "electron";
import { join } from "path";
import Store from "electron-store";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { closeBrowser } from "../../utils/kickAPI";
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

const chatLogsStore = new Map();

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

let mainWindow = null;
let userDialog = null;
let authDialog = null;

ipcMain.handle("store:get", async (e, { key }) => {
  if (!key) return store.store;
  return store.get(key);
});

ipcMain.handle("store:set", async (e, { key, value }) => {
  return store.set(key, value);
});

ipcMain.handle("store:delete", async (e, { key }) => {
  return store.delete(key);
});

ipcMain.handle("chatLogs:get", async (e, { data }) => {
  const { chatroomId, userId } = data;

  const roomLogs = chatLogsStore.get(chatroomId) || {};
  return roomLogs.get(userId) || { message: [] };
});

ipcMain.handle("chatLogs:add", async (e, { data }) => {
  const { chatroomId, userId, message } = data;
  let roomLogs = chatLogsStore.get(chatroomId);

  if (!roomLogs) {
    roomLogs = new Map();
    chatLogsStore.set(chatroomId, roomLogs);
  }

  const userLogs = roomLogs.get(userId) || { messages: [] };
  const updatedLogs = {
    messages: [...userLogs.messages, { ...message, timestamp: Date.now() }].slice(-100),
    lastUpdate: Date.now(),
  };

  roomLogs.set(userId, updatedLogs);

  if (userDialog && dialogInfo?.chatroomId === chatroomId && dialogInfo?.userId === userId) {
    userDialog.webContents.send("chatLogs:updated", {
      chatroomId,
      userId,
      logs: updatedLogs,
    });
  }

  return updatedLogs;
});

// Handle window focus
ipcMain.handle("bring-to-front", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const createWindow = () => {
  // Create the browser window.
  const displays = screen.getAllDisplays();

  mainWindow = new BrowserWindow({
    width: store.get("lastMainWindowState.width"),
    height: store.get("lastMainWindowState.height"),
    x: store.get("lastMainWindowState.x"),
    y: store.get("lastMainWindowState.y"),
    minWidth: 350,
    minHeight: 250,
    show: false,
    backgroundColor: "#06190e",
    autoHideMenuBar: true,
    // alwaysOnTop: store.get("alwaysOnTop"),
    titleBarStyle: "hidden",
    icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
    webPreferences: {
      devTools: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    mainWindow.webContents.openDevTools();
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
    const mainWindowBounds = mainWindow.getBounds();
    const loginDialog = new BrowserWindow({
      width: 1280,
      height: 720,
      x: newX,
      y: newY,

      show: true,
      resizable: false,
      transparent: true,
      roundedCorners: true,
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
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
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

  // Cleanup puppeteer on app quit

  app.on("before-quit", () => {
    closeBrowser().catch((error) => {
      console.error("Error closing browser:", error);
    });
  });

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Set Zoom Levels
  globalShortcut.register("Ctrl+Plus", () => {
    if (mainWindow.webContents.getZoomFactor() < 1.5) {
      const newZoomFactor = mainWindow.webContents.getZoomFactor() + 0.1;
      mainWindow.webContents.setZoomFactor(newZoomFactor);
      store.set("zoomFactor", newZoomFactor);
    }
  });

  globalShortcut.register("Ctrl+-", () => {
    if (mainWindow.webContents.getZoomFactor() > 0.8) {
      const newZoomFactor = mainWindow.webContents.getZoomFactor() - 0.1;
      mainWindow.webContents.setZoomFactor(newZoomFactor);
      store.set("zoomFactor", newZoomFactor);
    }
  });
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
    userDialog.webContents.send("userDialog:data", data);
    userDialog.focus();
    return;
  }

  userDialog = new BrowserWindow({
    width: 500,
    height: 500,
    x: newX,
    y: newY,
    show: true,
    resizable: false,
    frame: false,
    transparent: true,
    roundedCorners: true,
    webPreferences: {
      devTools: true,
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
    userDialog.webContents.openDevTools();
    userDialog.webContents.send("userDialog:data", data);
  });

  // TODO: Handle Pin of Dialog
  // userDialog.on("blur", () => {
  //   if (userDialog) {
  //     userDialog.close();
  //   }
  // });

  userDialog.on("closed", () => {
    dialogInfo = null;
    userDialog = null;
  });
});

// Auth Dialog Handler
ipcMain.handle("authDialog:open", (e) => {
  const mainWindowPos = mainWindow.getPosition();
  const currentDisplay = screen.getDisplayNearestPoint({
    x: mainWindowPos[0],
    y: mainWindowPos[1],
  });
  const newX = currentDisplay.bounds.x + Math.round((currentDisplay.bounds.width - 500) / 2);
  const newY = currentDisplay.bounds.y + Math.round((currentDisplay.bounds.height - 600) / 2);

  if (authDialog) {
    authDialog.focus();
    return;
  }

  authDialog = new BrowserWindow({
    width: 500,
    height: 600,
    x: newX,
    y: newY,
    show: true,
    resizable: false,
    frame: false,
    transparent: true,
    roundedCorners: true,
    webPreferences: {
      devTools: true,
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
    authDialog.webContents.openDevTools();
  });

  // TODO: Handle Pin of Dialog
  // authDialog.on("blur", () => {
  //   if (authDialog) {
  //     authDialog.close();
  //   }
  // });

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

// Function to move the user dialog window
ipcMain.on("move-window", (e, { x, y }) => {
  if (dialog) {
    dialog.setPosition(x, y);
  }
});

// Function to close the user dialog window
ipcMain.on("close-extra-window", () => {
  dialogInfo = null;
  if (dialog) {
    userDialog.close();
    userDialog = null;
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

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
