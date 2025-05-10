import { create } from "zustand";
import KickPusher from "../../../../utils/services/kick/kickPusher";
import { chatroomErrorHandler } from "../utils/chatErrors";
import queueChannelFetch from "../../../../utils/fetchQueue";
import StvWebSocket from "../../../../utils/services/seventv/stvWebsocket";
import useCosmeticsStore from "./CosmeticsProvider";
import { sendUserPresence } from "../../../../utils/services/seventv/stvAPI";

let stvPresenceUpdates = new Map();
let storeStvId = null;
const PRESENCE_UPDATE_INTERVAL = 30 * 1000;

// Load initial state from local storage
const getInitialState = () => {
  const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];

  return {
    chatrooms: savedChatrooms,
    messages: {},
    connections: {},
  };
};

const useChatStore = create((set, get) => ({
  ...getInitialState(),

  // Handles Sending Presence Updates to 7TV for a chatroom
  sendPresenceUpdate: async (stvId, userId) => {
    const currentTime = Date.now();

    if (stvPresenceUpdates.has(userId)) {
      const lastUpdateTime = stvPresenceUpdates.get(userId);
      console.log("[7TV Presence]: Last update time for chatroom:", userId, lastUpdateTime, stvPresenceUpdates);
      if (currentTime - lastUpdateTime < PRESENCE_UPDATE_INTERVAL) {
        return;
      }
    }

    stvPresenceUpdates.set(userId, currentTime);
    sendUserPresence(stvId, userId);
  },

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

  // updateSoundPlayed: (chatroomId, messageId) => {
  //   set((state) => ({
  //     messages: {
  //       ...state.messages,
  //       [chatroomId]: state.messages[chatroomId].map((message) => {
  //         if (message.id === messageId) {
  //           return { ...message, soundPlayed: true };
  //         }
  //         return message;
  //       }),
  //     },
  //   }));
  // },

  connectToStvWebSocket: (chatroom) => {
    const stvId = chatroom?.channel7TVEmotes?.user?.id;

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
        case "connection_established":
          break;
        // case "emote_set.update":
        //   get().handleEmoteSetUpdate(chatroom.id, body);
        //   break;
        case "cosmetic.create":
          console.log("Cosmetic create event:", body);
          useCosmeticsStore?.getState()?.addCosmetics(body);
          break;
        case "entitlement.create":
          const username = body?.object?.user?.connections?.find((c) => c.platform === "KICK")?.username;
          const transformedUsername = username?.replace("-", "_");
          console.log("Entitlement create event:", body, transformedUsername);
          useCosmeticsStore?.getState()?.addUserStyle(transformedUsername, body);
          break;

        default:
          break;
      }
    });

    storeStvId = localStorage.getItem("stvId");

    stvSocket.addEventListener("open", () => {
      console.log("7TV WebSocket connected for chatroom:", chatroom.id);

      setTimeout(() => {
        sendUserPresence(storeStvId, chatroom.streamerData.user_id);
      }, 2000);
      stvPresenceUpdates.set(chatroom.streamerData.user_id, Date.now());
    });

    stvSocket.addEventListener("close", () => {
      console.log("7TV WebSocket disconnected for chatroom:", chatroom.id);
      stvPresenceUpdates.delete(chatroom.streamerData.user_id);
    });
  },

  connectToChatroom: async (chatroom) => {
    if (!chatroom?.id) return;
    const pusher = new KickPusher(chatroom.id, chatroom.streamerData.id);

    // Connection Events
    pusher.addEventListener("connection", (event) => {
      console.info("Connected to chatroom:", chatroom.id);
      get().addMessage(chatroom.id, {
        id: crypto.randomUUID(),
        type: "system",
        ...event?.detail,
        timestamp: new Date().toISOString(),
      });
      return;
    });

    // Channel Events
    pusher.addEventListener("channel", (event) => {
      const parsedEvent = JSON.parse(event.detail.data);
      switch (event.detail.event) {
        // case "App\\Events\\LivestreamUpdated":
        // get().handleStreamStatus(chatroom.id, parsedEvent, true);
        // break;
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
          // Add user to chatters list if they're not already in there
          get().addChatter(chatroom.id, parsedEvent?.sender);

          // Add Message to Chatroom
          get().addMessage(chatroom.id, {
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          });

          // Add Message to User Logs
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

    if (pusher.chat.OPEN) {
      const channel7TVEmotes = await window.app.stv.getChannelEmotes(chatroom.streamerData.user_id);

      if (channel7TVEmotes) {
        const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
        const updatedChatrooms = savedChatrooms.map((room) => (room.id === chatroom.id ? { ...room, channel7TVEmotes } : room));

        localStorage.setItem("chatrooms", JSON.stringify(updatedChatrooms));
      }

      set((state) => ({
        chatrooms: state.chatrooms.map((room) => (room.id === chatroom.id ? { ...room, channel7TVEmotes } : room)),
      }));
    }

    const fetchInitialUserChatroomInfo = async () => {
      const { data } = await window.app.kick.getSelfChatroomInfo(chatroom?.slug);

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
      const { data } = await window.app.kick.getChannelChatroomInfo(chatroom?.slug);

      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return {
              ...room,
              initialChatroomInfo: data,
              isStreamerLive: data?.livestream?.is_live,
              streamStatus: data?.livestream,
            };
          }
          return room;
        }),
      }));
    };

    fetchInitialChatroomInfo();

    // Fetch initial messages
    // TODO: Finish adding initial messages
    const fetchInitialMessages = async () => {
      const {
        data: { data },
      } = await window.app.kick.getInitialChatroomMessages(chatroom.streamerData.id);

      if (!data) return;

      // Handle initial pinned message
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

  addMessage: (chatroomId, message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatroomId]: [...(state.messages[chatroomId] || []), { ...message, deleted: false }].slice(-200), // Keep last 200 messages
      },
    }));
  },

  addChatter: (chatroomId, chatter) => {
    set((state) => {
      const chatroom = state.chatrooms.find((room) => room.id === chatroomId);
      if (!chatroom) return state;

      // Check if chatter already exists
      if (chatroom.chatters?.some((c) => c.id === chatter.id)) {
        return state;
      }

      return {
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroomId) {
            return { ...room, chatters: [...(room.chatters || []), chatter] };
          }
          return room;
        }),
      };
    });
  },

  addChatroom: async (username) => {
    try {
      const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];

      if (
        savedChatrooms.some((chatroom) => chatroom.username.toLowerCase() === username.toLowerCase()) ||
        savedChatrooms.length >= 5
      ) {
        return;
      }

      const response = await queueChannelFetch(username);
      if (!response?.user) return;

      const newChatroom = {
        id: response.chatroom.id,
        username: response.user.username,
        slug: username,
        streamerData: response,
        channel7TVEmotes: [],
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

    data?.forEach((message) => {
      get().addChatter(chatroomId, message?.sender);
    });

    set((state) => ({
      messages: {
        ...state.messages,
        [chatroomId]: [...(state.messages[chatroomId] || []), ...data],
      },
    }));
  },

  // handleEmoteSetUpdate: (chatroomId, body) => {
  //   if (!body) return;

  //   const { pulled, pushed, updated } = body;

  //   const chatroom7TVEmoteSet = get().chatrooms?.filter((room) => room.id === chatroomId)[0]?.channel7TVEmotes;
  //   let updatedEmoteSet = [...chatroom7TVEmoteSet?.emote_set?.emotes];

  //   switch (true) {
  //     case pulled?.length > 0:
  //       pulled?.forEach((emote) => {
  //         console.log("[7TV] Emote Pulled from chatroom:", chatroomId, emote, chatroom7TVEmoteSet);
  //         console.log(updatedEmoteSet.filter((emote) => emote.id !== emote));
  //         // updatedEmoteSet = updatedEmoteSet.filter((emote) => emote.id !== emote);
  //       });
  //       break;
  //     case pushed?.length > 0:
  //       pushed?.forEach((emote) => {
  //         const { value } = emote;
  //         if (!value?.id) return;

  //         if (updatedEmoteSet.find((emote) => emote.id === value.id)) {
  //           return;
  //         }

  //         const newEmote = {
  //           id: value.id,
  //           actor_id: value.actor_id,
  //           name: value.name,
  //           alias: value.data?.name !== value.name ? value.data?.name : null,
  //           owner: value.data?.owner,
  //           file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
  //           platform: "7tv",
  //         };

  //         console.log("new emote:", newEmote);

  //         updatedEmoteSet.push(newEmote);
  //       });
  //       break;
  //     case updated?.length > 0:
  //       updated?.forEach((emote) => {
  //         console.log("[7TV] Emote Updated in chatroom:", chatroomId, emote, chatroom7TVEmoteSet);

  //         const { old_value, value } = emote;
  //         if (!old_value?.id || !value?.id) return;

  //         updatedEmoteSet = updatedEmoteSet.filter((emote) => emote.id !== old_value.id);

  //         const newEmote = {
  //           id: value.id,
  //           actor_id: value.actor_id,
  //           name: value.name,
  //           alias: value.data?.name !== value.name ? value.data?.name : null,
  //           owner: value.data?.owner,
  //           file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
  //           platform: "7tv",
  //         };

  //         updatedEmoteSet.push(newEmote);

  //         console.log(emote);
  //       });
  //       // updatedEmoteSet = chatroom7TVEmotes.map((emote) => {
  //       //   if (body?.updated?.includes(emote.id)) {
  //       //     return { ...emote, ...body?.updated };
  //       //   }
  //       //   return emote;
  //       // });
  //       break;
  //   }

  //   console.log("updated emote set:", updatedEmoteSet);
  //   const updatedChannel7TVEmotes = { ...chatroom7TVEmoteSet, emote_set: { emotes: updatedEmoteSet } };

  //   localStorage.setItem("channel7TVEmotes", JSON.stringify(updatedChannel7TVEmotes));

  //   console.log("updated channel 7tv emotes:", updatedChannel7TVEmotes);

  //   set((state) => ({
  //     chatrooms: state.chatrooms.map((room) => {
  //       if (room.id === chatroomId) {
  //         return { ...room, channel7TVEmotes: updatedChannel7TVEmotes };
  //       }
  //       return room;
  //     }),
  //   }));
  // },
}));

// Initialize connections when the store is created
useChatStore.getState().initializeConnections();

// Initialize presence updates when the store is created
let presenceUpdatesInterval = null;

const initializePresenceUpdates = () => {
  if (presenceUpdatesInterval) {
    clearInterval(presenceUpdatesInterval);
  }

  if (!storeStvId) {
    console.log("[7TV Presence]: No 7TV ID found, skipping presence update checks");
    setTimeout(() => {
      storeStvId = localStorage.getItem("stvId");
      if (storeStvId) {
        initializePresenceUpdates();
      } else {
        console.log("[7TV Presence]: No STV ID found after delay");
      }
    }, 10 * 10000); // 10 seconds delay

    return;
  }

  // Send presence updates every 1 minute
  console.log("[7TV Presence]: Initializing presence update checks");
  presenceUpdatesInterval = setInterval(
    () => {
      const chatrooms = useChatStore.getState()?.chatrooms;
      if (chatrooms?.length === 0) return;

      chatrooms.forEach((chatroom) => {
        console.log("[7TV Presence]: Sending presence check for chatroom:", chatroom.streamerData.user_id);
        useChatStore.getState().sendPresenceUpdate(storeStvId, chatroom.streamerData.user_id);
      });
    },
    2 * 60 * 1000,
  );

  return () => {
    if (presenceUpdatesInterval) {
      console.log("[7TV Presence]: Clearing presence update checks");
      clearInterval(presenceUpdatesInterval);
    }
  };
};

initializePresenceUpdates();

export default useChatStore;
