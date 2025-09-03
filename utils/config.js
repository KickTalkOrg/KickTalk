import Store from "electron-store";

const schema = {
  kickId: {
    type: "string",
    default: "",
  },
  general: {
    type: "object",
    properties: {
      alwaysOnTop: {
        type: "boolean",
        default: false,
      },
      dialogAlwaysOnTop: {
        type: "boolean",
        default: false,
      },
      wrapChatroomsList: {
        type: "boolean",
        default: false,
      },
      compactChatroomsList: {
        type: "boolean",
        default: false,
      },
      showTabImages: {
        type: "boolean",
        default: true,
      },
      timestampFormat: {
        type: "string",
        enum: ["disabled", "h:mm", "hh:mm", "h:mm a", "hh:mm a", "h:mm:ss", "hh:mm:ss", "h:mm:ss a", "hh:mm:ss a"],
        default: "disabled",
      },
    },
    default: {
      alwaysOnTop: false,
      dialogAlwaysOnTop: false,
      wrapChatroomsList: false,
      compactChatroomsList: false,
      showTabImages: true,
      timestampFormat: "disabled",
    },
  },
  chatrooms: {
    type: "object",
    properties: {
      showModActions: {
        type: "boolean",
        default: true,
      },
      batchingInterval: {
        type: "number",
        default: 0,
        minimum: 0,
        maximum: 10000,
      },
      batching: {
        type: "boolean",
        default: false,
      },
      showInfoBar: {
        type: "boolean",
        default: true,
      },
    },
    default: {
      showModActions: true,
      batchingInterval: 0,
      batching: false,
      showInfoBar: true,
    },
  },
  notifications: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        default: true,
      },
      sound: {
        type: "boolean",
        default: true,
      },
      volume: {
        type: "number",
        default: 0.2,
        minimum: 0,
        maximum: 1,
      },
      soundFile: {
        type: "string",
        default: "../resources/sounds/default.wav",
      },
      soundFileName: {
        type: "string",
        default: "default",
      },
      background: {
        type: "boolean",
        default: true,
      },
      backgroundColour: {
        type: "string",
        default: "#000000",
      },
      backgroundRgba: {
        type: "object",
        default: {
          r: 128,
          g: 0,
          b: 0,
          a: 1,
        },
      },
      phrases: {
        type: "array",
        default: [],
      },
    },
    default: {
      enabled: true,
      sound: true,
      volume: 0.2,
      soundFile: "../resources/sounds/default.wav",
      soundFileName: "default",
    },
  },
  moderation: {
    type: "object",
    properties: {
      quickModTools: {
        type: "boolean",
        default: true,
      },
    },
    default: {
      quickModTools: true,
    },
  },
  sevenTV: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        default: true,
      },
      paints: {
        type: "boolean",
        default: true,
      },
      emotes: {
        type: "boolean",
        default: true,
      },
      badges: {
        type: "boolean",
        default: true,
      },
    },
    default: {
      enabled: true,
      paints: true,
      emotes: true,
      badges: true,
    },
  },
  customTheme: {
    type: "object",
    properties: {
      current: {
        type: "string",
        enum: ["default", "dark", "blue", "purple", "red"],
        default: "default",
      },
    },
    default: {
      current: "default",
    },
  },
  theme: {
    type: "string",
    enum: ["light", "dark"],
    default: "dark",
  },
  streamlink: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        default: false,
      },
      quality: {
        type: "string",
        enum: ["best", "worst", "audio_only", "1080p60", "1080p", "720p60", "720p", "480p", "360p", "160p"],
        default: "best",
      },
      player: {
        type: "string",
        default: "vlc",
      },
      customArgs: {
        type: "string",
        default: "--hls-live-edge 2 --hls-segment-stream-data --stream-segment-threads 5",
      },
    },
    default: {
      enabled: false,
      quality: "best",
      player: "vlc",
      customArgs: "--hls-live-edge 2 --hls-segment-stream-data --stream-segment-threads 5",
    },
  },
  zoomFactor: {
    type: "number",
    default: 1,
  },
  lastMainWindowState: {
    type: "object",
    properties: {
      x: {
        type: "number",
      },
      y: {
        type: "number",
      },
      width: {
        type: "number",
      },
      height: {
        type: "number",
      },
    },
    default: { x: undefined, y: undefined, width: 480, height: 900 },
  },
};

const store = new Store({
  schema,
});

export default store;
