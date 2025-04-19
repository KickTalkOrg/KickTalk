import { app, shell, BrowserWindow, ipcMain, screen, session } from "electron";
import { join } from "path";
import fs from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { closeBrowser } from "../../utils/kickAPI";
import Store from "electron-store";
import dotenv from "dotenv";

dotenv.config();

const chatLogsStore = new Map();

let dialogInfo = null;
let mainWindow = null;
let dialog = null;
let loginDialog = null;

const authSession = {
  token: process.env.SESSION_TOKEN,
  session: process.env.KICK_SESSION,
};

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
    messages: [...userLogs.messages, { ...message, timestamp: Date.now() }].slice(-50),
    lastUpdate: Date.now(),
  };

  roomLogs.set(userId, updatedLogs);

  if (dialog && dialogInfo?.chatroomId === chatroomId && dialogInfo?.userId === userId) {
    dialog.webContents.send("chatLogs:updated", {
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
    width: 600,
    height: 900,
    x: displays[0].workArea.x / 2,
    y: displays[0].workArea.y / 2,
    minWidth: 350,
    show: false,
    backgroundColor: "#06190e",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    icon: join(__dirname, "../../resources/icons/win/KickTalk_v1.ico"),
    webPreferences: {
      devTools: true,
      nodeIntegration: true,
      contextIsolation: true,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.openDevTools(); // Open DevTools
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
  electronApp.setAppUserModelId("com.electron");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on("ping", () => console.log("pong"));

  createWindow();

  if (!authSession.token && !authSession.session) {
    loginDialog = new BrowserWindow({
      width: 1280,
      height: 720,
      webPreferences: {
        autoplayPolicy: "user-gesture-required",
        nodeIntegration: false,
      },
    });

    loginDialog.loadURL("https://kick.com/login");

    const checkForSessionToken = async () => {
      const cookies = await session.defaultSession.cookies.get({ domain: "kick.com" });
      const sessionCookie = cookies.find((cookie) => cookie.name === "session_token");
      if (sessionCookie) {
        const envPath = join(__dirname, "../../.env");
        console.log(envPath);
        const kickSession = cookies.find((cookie) => cookie.name === "kick_session");
        if (kickSession) {
          // Load existing .env file if it exists
          dotenv.config({ path: envPath });

          // Save the session token&kick session to the .env file
          const urlEncodedSessionCookie = decodeURIComponent(sessionCookie.value);
          const urlEncodedkickSession = decodeURIComponent(kickSession.value);

          fs.writeFileSync(envPath, `SESSION_TOKEN=${urlEncodedSessionCookie}\nKICK_SESSION=${urlEncodedkickSession}`, {
            flag: "w",
          });

          loginDialog.close();
          return true;
        }
      }
      return false;
    };

    const interval = setInterval(async () => {
      const found = await checkForSessionToken();
      if (found) {
        clearInterval(interval);
      }
    }, 1000);
  }

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
});

// User Dialog Handler
ipcMain.handle("dialog:open", (e, { data }) => {
  dialogInfo = {
    chatroomId: data.chatroomId,
    userId: data.sender.id,
  };

  const mainWindowPos = mainWindow.getPosition();
  const newX = mainWindowPos[0] + data.cords[0] - 150;
  const newY = mainWindowPos[1] + data.cords[1] - 100;

  if (dialog) {
    dialog.setPosition(newX, newY);
    dialog.webContents.send("dialog:data", data);
    dialog.focus();
    return;
  }

  dialog = new BrowserWindow({
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
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    dialog.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/dialog.html`);
  } else {
    dialog.loadFile(join(__dirname, "../renderer/dialog.html"));
  }

  dialog.once("ready-to-show", () => {
    dialog.show();
    dialog.webContents.send("dialog:data", data);
  });

  dialog.webContents.openDevTools(); // Open DevTools

  // TODO: Handle Pin of Dialog
  // dialog.on("blur", () => {
  //   if (dialog) {
  //     dialog.close();
  //   }
  // });

  dialog.on("closed", () => {
    dialogInfo = null;
    dialog = null;
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
    dialog.close();
    dialog = null;
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
