import { app, shell, BrowserWindow, webFrame, ipcMain, screen, local, globalShortcut } from "electron";
import { join } from "path";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { closeBrowser } from "../../utils/kickAPI";
import store from "../../utils/config";
import dotenv from "dotenv";
dotenv.config();

ipcMain.setMaxListeners(100);

const isDev = process.env.NODE_ENV === "development";

const chatLogsStore = new Map();

let dialogInfo = null;
let mainWindow = null;
let userDialog = null;
let authDialog = null;

const authSession = {
  token: process.env.SESSION_TOKEN,
  session: process.env.KICK_SESSION,
};

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

// Get window position (useful for dialogs)
ipcMain.handle("get-window-position", () => {
  if (!mainWindow) return null;
  const position = mainWindow.getPosition();
  const size = mainWindow.getSize();
  return { x: position[0], y: position[1], width: size[0], height: size[1] };
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
      nodeIntegration: true,
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

  // if (!authSession.token && !authSession.session) {
  //   loginDialog = new BrowserWindow({
  //     width: 1280,
  //     height: 720,
  //     webPreferences: {
  //       autoplayPolicy: "user-gesture-required",
  //       nodeIntegration: false,
  //     },
  //   });

  //   loginDialog.loadURL("https://kick.com/login");

  //   const checkForSessionToken = async () => {
  //     const cookies = await session.defaultSession.cookies.get({ domain: "kick.com" });
  //     const sessionCookie = cookies.find((cookie) => cookie.name === "session_token");
  //     if (sessionCookie) {
  //       const envPath = join(__dirname, "../../.env");
  //       console.log(envPath);
  //       const kickSession = cookies.find((cookie) => cookie.name === "kick_session");
  //       if (kickSession) {
  //         // Load existing .env file if it exists
  //         dotenv.config({ path: envPath });

  //         // Save the session token&kick session to the .env file
  //         const urlEncodedSessionCookie = decodeURIComponent(sessionCookie.value);
  //         const urlEncodedkickSession = decodeURIComponent(kickSession.value);

  //         fs.writeFileSync(envPath, `SESSION_TOKEN=${urlEncodedSessionCookie}\nKICK_SESSION=${urlEncodedkickSession}`, {
  //           flag: "w",
  //         });

  //         loginDialog.close();
  //         return true;
  //       }
  //     }
  //     return false;
  //   };

  //   const interval = setInterval(async () => {
  //     const found = await checkForSessionToken();
  //     if (found) {
  //       clearInterval(interval);
  //     }
  //   }, 1000);
  // }

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
ipcMain.handle("authDialog:open", (e, { data }) => {
  const mainWindowPos = mainWindow.getPosition();
  const newX = mainWindowPos[0] + data.cords[0] - 150;
  const newY = mainWindowPos[1] + data.cords[1] - 100;

  if (authDialog) {
    authDialog.setPosition(newX, newY);
    authDialog.focus();
    return;
  }

  authDialog = new BrowserWindow({
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
