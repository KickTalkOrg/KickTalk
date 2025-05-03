import Store from "electron-store";

const schema = {
  general: {
    type: "object",
    properties: {
      alwaysOnTop: {
        type: "boolean",
        default: true,
      },
    },
    default: {
      alwaysOnTop: true,
    },
  },
  chatrooms: {
    type: "object",
    properties: {
      showModActions: {
        type: "boolean",
      },
    },
    default: {
      showModActions: true,
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
      soundFile: {
        type: "string",
        default: "../resources/sounds/default.wav",
      },
      background: {
        type: "boolean",
        default: true,
      },
      backgroundColour: {
        type: "string",
        default: "#000000",
      },
      phrases: {
        type: "array",
        default: [],
      },
    },
    default: {
      enabled: true,
      sound: true,
      background: true,
      backgroundColour: "#000000",
      phrases: [],
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
  theme: {
    type: "string",
    enum: ["light", "dark"],
    default: "dark",
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
