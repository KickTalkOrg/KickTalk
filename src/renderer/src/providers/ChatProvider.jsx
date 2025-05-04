import { create } from "zustand";
import KickPusher from "../../../../utils/services/kick/kickPusher";
import { chatroomErrorHandler } from "../utils/chatErrors";
import queueChannelFetch from "../../../../utils/fetchQueue";
import StvWebSocket from "../../../../utils/services/seventv/stvWebsocket";

// Load initial state from local storage
const getInitialState = () => {
  const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];

  return {
    chatrooms: savedChatrooms,
    messages: {},
    connections: {},
    chatroomCosmetics: {},
  };
};

const useChatStore = create((set, get) => ({
  ...getInitialState(),

  sendMessage: async (chatroomId, content) => {
    try {
      const message = content.trim();
      console.info("Sending message to chatroom:", chatroomId);

      await window.app.kick.sendMessage(chatroomId, message);
      return true;
    } catch (error) {
      const errMsg = chatroomErrorHandler(error);

      set((state) => ({
        messages: {
          ...state.messages,
          [chatroomId]: [
            ...(state.messages[chatroomId] || []),
            {
              id: crypto.randomUUID(),
              type: "system",
              content: errMsg,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }));

      return false;
    }
  },

  updateSoundPlayed: (chatroomId, messageId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatroomId]: state.messages[chatroomId].map((message) => {
          if (message.id === messageId) {
            return { ...message, soundPlayed: true };
          }
          return message;
        }),
      },
    }));
  },

  addMessage: (chatroomId, message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatroomId]: [...(state.messages[chatroomId] || []), { ...message, deleted: false }].slice(-250), // Keep last 300 messages
      },
    }));
  },

  connectToStvWebSocket: (chatroom) => {
    const stvId = chatroom?.channel7TVEmotes?.user?.id;
    if (!stvId) return;

    const stvEmoteSets = chatroom?.channel7TVEmotes?.emote_set?.id || [];
    const stvSocket = new StvWebSocket(chatroom.streamerData.user_id, stvId, stvEmoteSets);

    set((state) => ({
      connections: {
        ...state.connections,
        [chatroom.id]: {
          ...state.connections[chatroom.id],
          stvSocket: stvSocket,
        },
      },
    }));

    stvSocket.connect();

    stvSocket.addEventListener("message", (event) => {
      const SevenTVEvent = event.detail;
      const { type, body } = SevenTVEvent;

      switch (type) {
        case "cosmetic.create":
          console.log("cosmetic.creation", body);
          set((state) => ({
            chatroomCosmetics: {
              ...state.chatroomCosmetics,
              chatroomCosmetics: body,
            },
          }));
          break;
        case "entitlement.create":
          console.log("entitlement.create", body.object.user.username);
          set((state) => ({
            chatroomCosmetics: {
              ...state.chatroomCosmetics,
              userInfo: {
                ...state.chatroomCosmetics.userInfo,
                [body.object.user.username]: {
                  ...state.chatroomCosmetics[body.id],
                  entitlement: body,
                },
              },
            },
          }));
          break;
        default:
          break;
      }
    });

    stvSocket.addEventListener("open", () => {
      console.log("7TV WebSocket connected for chatroom:", chatroom.id);
    });

    stvSocket.addEventListener("close", () => {
      console.log("7TV WebSocket disconnected for chatroom:", chatroom.id);
    });
  },

  connectToChatroom: (chatroom) => {
    if (!chatroom?.id) return;
    const pusher = new KickPusher(chatroom.id, chatroom.streamerData.id);

    // Connection Events
    pusher.addEventListener("connection", (event) => {
      console.info("Connected to chatroom:", chatroom.id);

      if (!get().connections[chatroom.id]) {
        get().addMessage(chatroom.id, {
          id: crypto.randomUUID(),
          type: "system",
          ...event?.detail,
          timestamp: new Date().toISOString(),
        });
      }

      return;
    });

    // Channel Events
    pusher.addEventListener("channel", (event) => {
      const parsedEvent = JSON.parse(event.detail.data);
      switch (event.detail.event) {
        case "App\\Events\\ChatroomUpdatedEvent":
          get().handleChatroomUpdated(chatroom.id, parsedEvent);
          break;
        case "App\\Events\\StreamerIsLive":
          console.log("Streamer is live", parsedEvent);
          get().handleStreamStatus(chatroom.id, parsedEvent, true);
          break;
        case "App\\Events\\StopStreamBroadcast":
          console.log("Streamer is offline", parsedEvent);
          get().handleStreamStatus(chatroom.id, parsedEvent, false);
          break;
        case "App\\Events\\PinnedMessageCreatedEvent":
          get().handlePinnedMessageCreated(chatroom.id, parsedEvent);
          break;
        case "App\\Events\\PinnedMessageDeletedEvent":
          get().handlePinnedMessageDeleted(chatroom.id);
          break;
      }
    });

    // Message Events
    pusher.addEventListener("message", (event) => {
      const parsedEvent = JSON.parse(event.detail.data);

      switch (event.detail.event) {
        case "App\\Events\\ChatMessageEvent":
          get().addMessage(chatroom.id, {
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          });

          window.app.logs.add({
            chatroomId: chatroom.id,
            userId: parsedEvent.sender.id,
            message: parsedEvent,
          });

          break;
        case "App\\Events\\MessageDeletedEvent":
          get().handleMessageDelete(chatroom.id, parsedEvent.message.id);
          break;
        case "App\\Events\\UserBannedEvent":
          get().handleUserBanned(chatroom.id, parsedEvent);
          get().addMessage(chatroom.id, {
            id: crypto.randomUUID(),
            type: "mod_action",
            modAction: parsedEvent?.permanent ? "banned" : "ban_temporary",
            modActionDetails: parsedEvent,
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          });

          break;
        case "App\\Events\\UserUnbannedEvent":
          get().handleUserUnbanned(chatroom.id, parsedEvent);
          get().addMessage(chatroom.id, {
            id: crypto.randomUUID(),
            type: "mod_action",
            modAction: parsedEvent?.permanent ? "unbanned" : "removed_timeout",
            modActionDetails: parsedEvent,
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          });
          break;
      }
    });

    pusher.connect();

    const fetchEmotes = async () => {
      const data = await window.app.kick.getEmotes(chatroom.slug);
      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return { ...room, emotes: data };
          }
          return room;
        }),
      }));
    };

    fetchEmotes();

    // Fetch Initial Chatroom Info
    const fetchInitialChatroomInfo = async () => {
      const { data } = await window.app.kick.getChannelChatroomInfo(chatroom.slug);

      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return {
              ...room,
              chatroomInfo: data,
              isStreamerLive: data?.livestream?.is_live,
              streamStatus: data?.livestream,
            };
          }
          return room;
        }),
      }));
    };

    fetchInitialChatroomInfo();

    const fetchInitialUserChatroomInfo = async () => {
      const { data } = await window.app.kick.getUserChatroomInfo(chatroom.slug);
      console.log("userChatroomInfo", data);
      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return {
              ...room,
              userChatroomInfo: data,
            };
          }
          return room;
        }),
      }));
    };

    fetchInitialUserChatroomInfo();

    // Fetch initial messages
    // TODO: Finish adding initial messages
    const fetchInitialMessages = async () => {
      const {
        data: { data },
      } = await window.app.kick.getInitialChatroomMessages(chatroom.streamerData.id);

      if (!data) return;

      // Handle initialpinned message
      if (data?.pinned_message) {
        get().handlePinnedMessageCreated(chatroom.id, data.pinned_message);
      }

      // Add initial messages to the chatroom
      if (data?.messages) {
        get().addInitialChatroomMessages(chatroom.id, data.messages.reverse());
      }
    };

    fetchInitialMessages();

    set((state) => ({
      connections: {
        ...state.connections,
        [chatroom.id]: {
          kickPusher: pusher,
        },
      },
    }));
  },

  addChatroom: async (username) => {
    try {
      const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
      if (savedChatrooms.some((chatroom) => chatroom.username.toLowerCase() === username.toLowerCase())) {
        return;
      }

      const response = await queueChannelFetch(username);
      if (!response?.user) return;

      const channel7TVEmotes = await window.app.stv.getChannelEmotes(response.user.id);
      const newChatroom = {
        id: response.chatroom.id,
        username: response.user.username,
        slug: username,
        streamerData: response,
        channel7TVEmotes,
      };

      set((state) => ({
        chatrooms: [...state.chatrooms, newChatroom],
      }));

      // Connect to chatroom
      get().connectToChatroom(newChatroom);

      // Connect to 7TV WebSocket
      get().connectToStvWebSocket(newChatroom);

      // Save to local storage
      localStorage.setItem("chatrooms", JSON.stringify([...savedChatrooms, newChatroom]));

      return newChatroom;
    } catch (error) {
      console.error("[Chatroom Store]: Error adding chatroom:", error);
    }
  },

  removeChatroom: (chatroomId) => {
    const { connections } = get();
    const connection = connections[chatroomId];
    const stvSocket = connection?.stvSocket;
    const kickPusher = connection?.kickPusher;

    if (stvSocket) stvSocket.close();
    if (kickPusher) kickPusher.close();

    set((state) => {
      const { [chatroomId]: _, ...messages } = state.messages;
      const { [chatroomId]: __, ...connections } = state.connections;

      return {
        chatrooms: state.chatrooms.filter((room) => room.id !== chatroomId),
        messages,
        connections,
      };
    });

    // Remove chatroom from local storage
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
    localStorage.setItem("chatrooms", JSON.stringify(savedChatrooms.filter((room) => room.id !== chatroomId)));
  },

  initializeConnections: () => {
    get()?.chatrooms?.forEach((chatroom) => {
      if (!get().connections[chatroom.id]) {
        // Connect to chatroom
        get().connectToChatroom(chatroom);

        // Connect to 7TV WebSocket
        get().connectToStvWebSocket(chatroom);
      }
    });
  },

  handleUserBanned: (chatroomId, event) => {
    set((state) => {
      const messages = state.messages[chatroomId];
      if (!messages) return state;

      const updatedMessages = messages.map((message) => {
        if (message?.sender?.id === event?.user?.id) {
          return {
            ...message,
            deleted: true,
            modAction: event?.permanent ? "banned" : "ban_temporary",
            modActionDetails: event,
          };
        }
        return message;
      });

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages,
        },
      };
    });
  },

  handleUpdatePlaySound: (chatroomId, messageId) => {
    set((state) => {
      return {
        ...state,
        messages: state.messages[chatroomId].map((message) => {
          if (message.id === messageId) {
            return { ...message, playSound: !message.playSound };
          }
          return message;
        }),
      };
    });
  },

  handleUserUnbanned: (chatroomId, event) => {
    set((state) => {
      const messages = state.messages[chatroomId];
      if (!messages) return state;

      const updatedMessages = messages.map((message) => {
        if (message?.sender?.id === event?.user?.id) {
          return { ...message, deleted: false, modAction: "unbanned", modActionDetails: event };
        }
        return message;
      });

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages,
        },
      };
    });
  },

  handleMessageDelete: (chatroomId, messageId) => {
    set((state) => {
      const messages = state.messages[chatroomId];
      if (!messages) return state;

      const updatedMessages = messages.map((message) => {
        if (message.id === messageId) {
          return { ...message, deleted: true };
        }
        return message;
      });

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages,
        },
      };
    });
  },

  handlePinnedMessageCreated: (chatroomId, event) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, pinnedMessage: event };
        }
        return room;
      }),
    }));
  },

  handlePinnedMessageDeleted: (chatroomId, event) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, pinnedMessage: null };
        }
        return room;
      }),
    }));
  },

  handleStreamStatus: (chatroomId, event, isLive) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, isStreamerLive: isLive, streamStatus: event };
        }
        return room;
      }),
    }));
  },

  handleChatroomUpdated: (chatroomId, event) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, chatroomInfo: event };
        }
        return room;
      }),
    }));
  },

  addInitialChatroomMessages: (chatroomId, data) => {
    data.map((message) => {
      message.is_old = true;
      message.metadata = JSON.parse(message.metadata);
    });

    console.log("Adding initial chatroom messages:", data);

    set((state) => ({
      messages: {
        ...state.messages,
        [chatroomId]: [...(state.messages[chatroomId] || []), ...data],
      },
    }));
  },
}));

// Initialize connections when the store is created
useChatStore.getState().initializeConnections();

export default useChatStore;
