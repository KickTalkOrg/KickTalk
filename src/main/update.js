import { autoUpdater } from "electron-updater";
import { ipcMain } from "electron";
console.log("AutoUpdater initialized");
const startDownload = (callback, completedCallback) => {
  autoUpdater.on("download-progress", (progress) => {
    mainWindow.webContents.send("autoUpdater:downloadProgress", progress);
  });

  autoUpdater.on("error", (error) => {
    console.log("autoUpdater:downloadError", error);
  });

  autoUpdater.on("update-downloaded", completedCallback);

  autoUpdater.downloadUpdate();
};

export const update = (mainWindow) => {
  autoUpdater.autoDownload = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.forceDevUpdateConfig = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info);
    mainWindow.webContents.send("autoUpdater:update-available", info);
    startDownload(
      (error, progressInfo) => {
        if (error) {
          console.log("autoUpdater:downloadError", error);
          mainWindow.webContents.send("autoUpdater:downloadError", error);
        } else {
          console.log("autoUpdater:downloadProgress", progressInfo);
          mainWindow.webContents.send("autoUpdater:downloadProgress", progressInfo);
        }
      },
      () => {
        console.log("autoUpdater:downloadCompleted");
        mainWindow.webContents.send("autoUpdater:downloadCompleted");
      },
    );
  });

  autoUpdater.on("update-not-available", (info) => {
    mainWindow.webContents.send("audoUpdater:update-not-available", info);
    console.log("Update not available:", info);
  });

  autoUpdater.on("error", (error) => {
    console.log("Error:", error);
  });

  ipcMain.on("autoUpdater:checkForUpdates", () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  autoUpdater.checkForUpdatesAndNotify();

  ipcMain.on("autoUpdater:download", (event, callback) => {
    startDownload(
      (error, progressInfo) => {
        if (error) {
          event.reply("autoUpdater:downloadError", error);
        } else {
          event.reply("autoUpdater:downloadProgress", progressInfo);
        }
      },
      () => {
        event.sender.send("autoUpdater:downloadCompleted");
      },
    );
  });

  ipcMain.on("autoUpdater:quitAndInstall", () => {
    autoUpdater.quitAndInstall();
  });
};