import { ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import store from "../../../utils/config";

export const update = (mainWindow) => {
  // Only run auto-updater in production
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    log.info("[Auto Updater]: Skipping auto-updater in development mode");
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = "info";
  log.info("[Auto Updater]: Initialized");

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.forceDevUpdateConfig = true;

  const sendUpdateEvent = (status) => {
    log.info(`[Auto Updater]: Status - ${status}`);
    mainWindow.webContents.send("autoUpdater:status", status);
  };

  // Setup Event Handlers
  autoUpdater.on("checking-for-update", () => {
    log.info("[Auto Updater]: Checking for update...");
    sendUpdateEvent({ event: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    log.info("[Auto Updater]: Update available:", info);
    sendUpdateEvent({ event: "available", version: info.version, releaseDate: info.releaseDate, files: info.files });

    // autoUpdater.downloadUpdate().catch((error) => {
    //   log.error("[Auto Updater]: Error downloading update:", err);
    //   sendUpdateEvent({ event: "error", error: err.message });
    // });
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("[Auto Updater]: Update not available:", info);
    sendUpdateEvent({ event: "not-available", version: info.version, releaseDate: info.releaseDate, files: info.files });
  });

  autoUpdater.on("download-progress", (progress) => {
    log.info(`[Auto Updater]: Download progress: ${progress.percent}%`);
    sendUpdateEvent({
      event: "downloading",
      percent: progress.percent || 0,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("[Auto Updater]: Update downloaded");
    sendUpdateEvent({
      event: "ready",
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    log.error("[Auto Updater]: Update error:", err);

    if (err.message && (err.message.includes("download") || err.message.includes("Download"))) {
      sendUpdateEvent({
        event: "download-failed",
        error: err.message,
      });
    } else {
      sendUpdateEvent({
        event: "error",
        error: err.message,
      });
    }
  });

  // IPC Handlers
  ipcMain.handle("autoUpdater:check", async () => {
    try {
      log.info("[Auto Updater]: Checking for updates...");
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      log.error("[Auto Updater]: Error checking for updates:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("autoUpdater:download", async () => {
    try {
      log.info("[Auto Updater]: Downloading update...");
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      log.error("[Auto Updater]: Error downloading update:", error);
      return { success: false, error: error.message };
    }
  });

  // Force quit and install immediately
  ipcMain.handle("autoUpdater:install", () => {
    log.info("[Auto Updater]: Installing update and quitting...");
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
  });

  // Handle auto-update setting changes
  ipcMain.handle("autoUpdater:setEnabled", (event, enabled) => {
    try {
      store.set("general.autoUpdate", enabled);
      log.info(`[Auto Updater]: Auto-update ${enabled ? 'enabled' : 'disabled'} via settings`);
      return { success: true };
    } catch (error) {
      log.error("[Auto Updater]: Error updating auto-update setting:", error);
      return { success: false, error: error.message };
    }
  });

  // Check for updates after a slight delay to allow app to fully initialize
  setTimeout(() => {
    // Check if auto-update is enabled in settings (default: true)
    const autoUpdateEnabled = store.get("general.autoUpdate", true);
    
    if (!autoUpdateEnabled) {
      log.info("[Auto Updater]: Auto-update disabled in settings, skipping initial check");
      return;
    }
    
    log.info("[Auto Updater]: Performing initial update check...");
    autoUpdater.checkForUpdates().catch((err) => {
      log.error("[Auto Updater]: Initial update check failed:", err);
    });
  }, 3000);
};
