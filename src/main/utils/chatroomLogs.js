import path from "path";
import fs from "fs";
import log from "electron-log";

// Folder to store chat logs
const defaultLogFile = log.transports.file.getFile();
const defaultDir = path.dirname(defaultLogFile.path);
const chatlogsBase = path.join(path.dirname(defaultDir), "chatlogs");

if (!fs.existsSync(chatlogsBase)) fs.mkdirSync(chatlogsBase, { recursive: true });

// Map of channel loggers
const channelLoggers = {};

const getChannelLogger = (channel) => {
    if (!channelLoggers[channel]) {
        const logger = log.create(channel);
        logger.transports.file.format = '{text}';
        logger.transports.file.resolvePathFn = () => {
            return path.join(chatlogsBase, `${channel}.log`);
        };
        channelLoggers[channel] = logger;
    }
    return channelLoggers[channel];
};

/**
 * Log a message to the appropriate channel file
 */
export const chatLog = ({ chatMessage, chatName }) => {
    const now = new Date();
    const timestamp = `[${now.toISOString().replace('T',' ').replace('Z','')}]`;

    // Log to appropriate chat log
    const logger = getChannelLogger(chatName);
    logger.info(`${timestamp} ${chatMessage}`);
};
