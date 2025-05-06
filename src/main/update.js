import { app, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

const update = (window) => {
  autoUpdater.autoDownload = false;
  autoUpdater.disableWebInstaller = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info);
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("Update not available:", info);
  });

  autoUpdater.on("error", (error) => {
    console.log("Error:", error);
  });

  ipcMain.on("autoUpdater:checkForUpdates", () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  ipcMain.on("autoUpdater:download", (event, callback) => {
    startDownload(
      callback,
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

const startDownload = (callback, completedCallback) => {
  autoUpdater.on("download-progress", (progress) => {
    callback(null, progress);
  });

  autoUpdater.on("error", (error) => {
    callback(error, null);
  });

  autoUpdater.on("update-downloaded", completedCallback);

  autoUpdater.downloadUpdate();
};

export default update;
