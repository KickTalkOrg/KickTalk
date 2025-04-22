import Store from "electron-store";

const schema = {
  alwaysOnTop: {
    type: "boolean",
    default: true,
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
  userDialog: {
    type: "object",
    properties: {
      alwaysOnTop: {
        type: "boolean",
        default: true,
      },
    },
  },
};

const store = new Store({
  schema,
});

export default store;
