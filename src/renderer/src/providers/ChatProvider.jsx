import { create } from "zustand";
import KickPusher from "../../../../utils/services/kick/kickPusher";
import { chatroomErrorHandler } from "../utils/chatErrors";
import queueChannelFetch from "../../../../utils/fetchQueue";
import StvWebSocket from "../../../../utils/services/seventv/stvWebsocket";
import useCosmeticsStore from "./CosmeticsProvider";
import { sendUserPresence } from "../../../../utils/services/seventv/stvAPI";
import dayjs from "dayjs";

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
    isChatroomPaused: {},
  };
};

const useChatStore = create((set, get) => ({
  ...getInitialState(),

  // Handles Sending Presence Updates to 7TV for a chatroom
  sendPresenceUpdate: (stvId, userId) => {
    if (!stvId) {
      console.log("[7TV Presence]: No STV ID provided, skipping presence update");
      return;
    }

    const authTokens = window.app.auth.getToken();
    if (!authTokens?.token || !authTokens?.session) {
      console.log("[7TV Presence]: No auth tokens available, skipping presence update");
      return;
    }

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

      const response = await window.app.kick.sendMessage(chatroomId, message);

      if (response?.data?.status?.code === 401) {
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "You must login to chat.",
          timestamp: new Date().toISOString(),
        });

        return false;
      }

      return true;
    } catch (error) {
      const errMsg = chatroomErrorHandler(error);

      get().addMessage(chatroomId, {
        id: crypto.randomUUID(),
        type: "system",
        chatroom_id: chatroomId,
        content: errMsg,
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  },

  sendReply: async (chatroomId, content, metadata = {}) => {
    try {
      const message = content.trim();
      console.info("Sending reply to chatroom:", chatroomId);

      const response = await window.app.kick.sendReply(chatroomId, message, metadata);

      if (response?.data?.status?.code === 401) {
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "You must login to chat.",
          timestamp: new Date().toISOString(),
        });

        return false;
      }

      return true;
    } catch (error) {
      const errMsg = chatroomErrorHandler(error);

      get().addMessage(chatroomId, {
        id: crypto.randomUUID(),
        type: "system",
        content: errMsg,
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  },

  getUpdateSoundPlayed: (chatroomId, messageId) => {
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

  connectToStvWebSocket: (chatroom) => {
    const stvId = chatroom?.channel7TVEmotes?.user?.id;
    const stvEmoteSets = chatroom?.channel7TVEmotes?.find((set) => set.type === "channel")?.setInfo.id;
    console.log("[DEBUGGING]", stvEmoteSets);

    const existingConnection = get().connections[chatroom.id]?.stvSocket;
    if (existingConnection) {
      console.log("Closing existing 7TV WebSocket for chatroom:", chatroom.id);
      existingConnection.close();
    }

    const stvSocket = new StvWebSocket(chatroom.streamerData.user_id, stvId, stvEmoteSets);

    console.log("Connecting to 7TV WebSocket for chatroom:", chatroom.id);

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
      console.log("7TV WebSocket message:", event);
      const SevenTVEvent = event.detail;
      const { type, body } = SevenTVEvent;

      switch (type) {
        case "connection_established":
          break;
        case "emote_set.update":
          get().handleEmoteSetUpdate(chatroom.id, body);
          break;
        case "cosmetic.create":
          console.log("Cosmetic create event:", body);
          useCosmeticsStore?.getState()?.addCosmetics(body);
          break;
        case "entitlement.create":
          const username = body?.object?.user?.connections?.find((c) => c.platform === "KICK")?.username;
          const transformedUsername = username?.replaceAll("-", "_").toLowerCase();

          console.log("Entitlement create event:", body, transformedUsername, username);
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
        const authTokens = window.app.auth.getToken();
        if (storeStvId && authTokens?.token && authTokens?.session) {
          sendUserPresence(storeStvId, chatroom.streamerData.user_id);
          stvPresenceUpdates.set(chatroom.streamerData.user_id, Date.now());
        } else {
          console.log("[7TV Presence]: No STV ID or auth tokens available for WebSocket presence update");
        }
      }, 2000);
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
        case "App\\Events\\LivestreamUpdated":
          get().handleStreamStatus(chatroom.id, parsedEvent, true);
          break;
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
        // case "App\\Events\\PollUpdateEvent":
        //   console.log("Poll update event:", parsedEvent);
        //   get().handlePollUpdate(chatroom.id, parsedEvent?.poll);
        //   break;
        // case "App\\Events\\PollDeleteEvent":
        //   get().handlePollDelete(chatroom.id);
        //   break;
      }
    });

    // Message Events
    pusher.addEventListener("message", (event) => {
      const parsedEvent = JSON.parse(event.detail.data);

      switch (event.detail.event) {
        case "App\\Events\\ChatMessageEvent":
          if (!window.__chatMessageBatch) {
            window.__chatMessageBatch = {};
          }
          if (!window.__chatMessageBatch[chatroom.id]) {
            window.__chatMessageBatch[chatroom.id] = {
              queue: [],
              timer: null,
            };
          }
          // batching setting from settings
          const batchingInterval = window.__chatMessageBatchInterval ?? 200; // 0 = instant
          get().addChatter(chatroom.id, parsedEvent?.sender);
          // queue batch
          window.__chatMessageBatch[chatroom.id].queue.push({
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          });
          console.log(
            `[Batching] Added message to queue for chatroom ${chatroom.id}. Queue length:`,
            window.__chatMessageBatch[chatroom.id].queue.length,
            "Batching interval:",
            batchingInterval,
          );
          // flusher
          const flushBatch = () => {
            const batch = window.__chatMessageBatch[chatroom.id].queue;
            if (batch.length > 0) {
              console.log(`[Batching] Flushing ${batch.length} messages for chatroom ${chatroom.id}`);
              batch.forEach((msg) => get().addMessage(chatroom.id, msg));
              window.__chatMessageBatch[chatroom.id].queue = [];
            }
          };
          if (batchingInterval === 0) {
            // If someone wants it instantly then it just basically always flushes and batches instantly
            console.log("[Batching] Instant mode, flushing immediately");
            flushBatch();
          } else {
            if (!window.__chatMessageBatch[chatroom.id].timer) {
              console.log(`[Batching] Starting timer for chatroom ${chatroom.id} with interval ${batchingInterval}ms`);
              window.__chatMessageBatch[chatroom.id].timer = setTimeout(() => {
                flushBatch();
                window.__chatMessageBatch[chatroom.id].timer = null;
                console.log(`[Batching] Timer ended for chatroom ${chatroom.id}`);
              }, batchingInterval);
            } else {
              console.log(`[Batching] Timer already running for chatroom ${chatroom.id}`);
            }
          }
          if (parsedEvent?.type === "reply") {
            window.app.replyLogs.add({
              chatroomId: chatroom.id,
              message: parsedEvent,
            });
          } else {
            window.app.logs.add({
              chatroomId: chatroom.id,
              userId: parsedEvent.sender.id,
              message: parsedEvent,
            });
          }
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

    // connect to Pusher after getting initial data
    pusher.connect();

    if (pusher.chat.OPEN) {
      const channel7TVEmotes = await window.app.stv.getChannelEmotes(chatroom.streamerData.user_id);

      if (channel7TVEmotes) {
        const seenEmoteNames = new Set();

        // Remove duplicate emotes across all sets
        channel7TVEmotes.forEach((set) => {
          set.emotes = set.emotes.filter((emote) => {
            if (seenEmoteNames.has(emote.name)) {
              return false; // Skip duplicate
            }
            seenEmoteNames.add(emote.name);
            return true; // Keep first seen instance
          });
        });

        seenEmoteNames.clear();

        const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
        const updatedChatrooms = savedChatrooms.map((room) => (room.id === chatroom.id ? { ...room, channel7TVEmotes } : room));

        localStorage.setItem("chatrooms", JSON.stringify(updatedChatrooms));

        set((state) => ({
          chatrooms: state.chatrooms.map((room) => (room.id === chatroom.id ? { ...room, channel7TVEmotes } : room)),
        }));
      }
    }

    // TOOD: Cleanup promise.allSettled

    const fetchInitialUserChatroomInfo = async () => {
      const response = await window.app.kick.getSelfChatroomInfo(chatroom?.streamerData?.slug);

      if (!response?.data) {
        console.log("[Initial User Chatroom Info]: No data received, skipping update");
        return;
      }

      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return {
              ...room,
              userChatroomInfo: response.data,
            };
          }
          return room;
        }),
      }));
    };

    fetchInitialUserChatroomInfo();

    const fetchEmotes = async () => {
      console.log("[Kick Emotes]: Fetching emotes for chatroom:", chatroom?.streamerData?.slug);
      const data = await window.app.kick.getEmotes(chatroom?.streamerData?.slug);
      const currentChatroom = get().chatrooms.find((room) => room.id === chatroom.id);

      let sevenTVEmoteNames = new Set();
      await currentChatroom?.channel7TVEmotes.forEach((set) => {
        set.emotes.forEach((emote) => {
          if (emote.name) sevenTVEmoteNames.add(emote.name);
        });
      });

      let removedEmotes = [];
      console.log("BUH", currentChatroom?.channel7TVEmotes);
      if (Array.isArray(data)) {
        console.log("WUH", data);
        data.forEach((set) => {
          set.emotes = set.emotes.filter((emote) => {
            if (sevenTVEmoteNames.has(emote.name)) {
              removedEmotes.push(emote.name);
              console.log("[DEBUGGING]: Removing 7TV emote from Kick emotes:", emote.name);
              return false;
            }
            return true;
          });
        });
      }

      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return { ...room, emotes: data };
          }
          return room;
        }),
      }));
      sevenTVEmoteNames.clear();
      console.log(sevenTVEmoteNames);
    };

    fetchEmotes();

    // Fetch Initial Chatroom Info
    const fetchInitialChatroomInfo = async () => {
      const response = await window.app.kick.getChannelChatroomInfo(chatroom?.streamerData?.slug);

      if (!response?.data) {
        console.log("[Initial Chatroom Info]: No data received, skipping update");
        return;
      }

      const currentChatroom = get().chatrooms.find((room) => room.id === chatroom.id);
      const updatedChatroom = {
        ...currentChatroom,
        initialChatroomInfo: response.data,
        isStreamerLive: response.data?.livestream?.is_live,
        streamerData: {
          ...currentChatroom.streamerData,
          livestream: response.data?.livestream
            ? { ...currentChatroom.streamerData?.livestream, ...response.data?.livestream }
            : null,
        },
      };

      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return updatedChatroom;
          }
          return room;
        }),
      }));

      // Update local storage with the updated chatroom
      const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
      const updatedChatrooms = savedChatrooms.map((room) => (room.id === chatroom.id ? updatedChatroom : room));
      localStorage.setItem("chatrooms", JSON.stringify(updatedChatrooms));
    };

    fetchInitialChatroomInfo();

    // Fetch initial messages
    const fetchInitialMessages = async () => {
      const response = await window.app.kick.getInitialChatroomMessages(chatroom.streamerData.id);

      if (!response?.data?.data) {
        console.log("[Initial Messages]: No data received, skipping update");
        return;
      }

      const data = response.data.data;

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

    // const fetchInitialPollInfo = async () => {
    //   const response = await window.app.kick.getInitialPollInfo(chatroom?.streamerData?.slug);

    //   if (!response) {
    //     console.log("[Initial Poll Info]: No response received, skipping update");
    //     return;
    //   }

    //   if (response.data?.status?.code === 404) {
    //     get().handlePollDelete(chatroom.id);
    //   }

    //   if (response.data?.status?.code === 200) {
    //     get().handlePollUpdate(chatroom.id, response.data?.data?.poll);
    //   }
    // };

    // fetchInitialPollInfo();

    set((state) => ({
      connections: {
        ...state.connections,
        [chatroom.id]: {
          ...state.connections[chatroom.id],
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
    set((state) => {
      const messages = state.messages[chatroomId] || [];
      const newMessage = { ...message, chatroom_id: chatroomId, deleted: false };

      if (messages.some((msg) => msg.id === newMessage.id)) {
        return state;
      }

      let updatedMessages = message?.is_old ? [newMessage, ...messages] : [...messages, newMessage];

      // Keep a fixed window of messages based on pause state
      if (state.isChatroomPaused?.[chatroomId] && updatedMessages.length > 800) {
        updatedMessages = updatedMessages.slice(-400);
      } else if (!state.isChatroomPaused?.[chatroomId] && updatedMessages.length > 150) {
        updatedMessages = updatedMessages.slice(-150);
      }

      return {
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages,
        },
      };
    });
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
        savedChatrooms.some(
          (chatroom) =>
            chatroom.username.toLowerCase() === username.toLowerCase() ||
            chatroom.username.toLowerCase() === username.replaceAll("-", "_"),
        ) ||
        savedChatrooms.length >= 5
      ) {
        return;
      }

      const response = await queueChannelFetch(username);
      if (!response?.user) return;

      const newChatroom = {
        id: response.chatroom.id,
        username: response.user.username,
        displayName: response.user.username, // Custom display name for renaming
        slug: response?.slug,
        streamerData: response,
        channel7TVEmotes: [],
        order: savedChatrooms.length,
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
    console.log(`[ChatProvider]: Removing chatroom ${chatroomId}`);

    const { connections } = get();
    const connection = connections[chatroomId];
    const stvSocket = connection?.stvSocket;
    const kickPusher = connection?.kickPusher;

    if (stvSocket) {
      stvSocket.close();
    }

    if (kickPusher) {
      kickPusher.close();
    }

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

  // Ordered Chatrooms
  getOrderedChatrooms: () => {
    return get().chatrooms.sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  updateChatroomOrder: (chatroomId, newOrder) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => (room.id === chatroomId ? { ...room, order: newOrder } : room)),
    }));

    const updatedChatrooms = get().chatrooms;

    // Update local storage
    localStorage.setItem("chatrooms", JSON.stringify(updatedChatrooms));
  },

  reorderChatrooms: (reorderedChatrooms) => {
    const chatroomsWithNewOrder = reorderedChatrooms.map((chatroom, index) => ({
      ...chatroom,
      order: index,
    }));

    set({ chatrooms: chatroomsWithNewOrder });

    // Update local storage
    localStorage.setItem("chatrooms", JSON.stringify(chatroomsWithNewOrder));
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

  // handleUpdatePlaySound: (chatroomId, messageId) => {
  //   set((state) => {
  //     return {
  //       ...state,
  //       messages: state.messages[chatroomId].map((message) => {
  //         if (message.id === messageId) {
  //           return { ...message, playSound: !message.playSound };
  //         }
  //         return message;
  //       }),
  //     };
  //   });
  // },

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

    // Update persistent logs with deleted status
    window.app.logs.updateDeleted(chatroomId, messageId);
    window.app.replyLogs.updateDeleted(chatroomId, messageId);
  },

  getDeleteMessage: async (chatroomId, messageId) => {
    try {
      await window.app.modActions.getDeleteMessage(chatroomId, messageId);
      return true;
    } catch (error) {
      console.error("[Delete Message]: Error getting delete message:", error);

      // if (error.response?.status === 400) {
      //   const errMsg = chatroomErrorHandler({ code: "DELETE_MESSAGE_ERROR" });
      //   get().addMessage(chatroomId, {
      //     id: crypto.randomUUID(),
      //     type: "system",
      //     content: errMsg,
      //     timestamp: new Date().toISOString(),
      //   });
      // }

      return false;
    }
  },

  getPinMessage: async (chatroomId, messageData) => {
    try {
      await window.app.kick.getPinMessage(messageData);
      return true;
    } catch (error) {
      console.error("[Pin Message]: Error getting pin message:", error);

      if (error.response?.status === 400) {
        const errMsg = chatroomErrorHandler({ code: "PINNED_MESSAGE_NOT_FOUND_ERROR" });
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: errMsg,
          timestamp: new Date().toISOString(),
        });
      }

      return false;
    }
  },

  handlePinnedMessageCreated: (chatroomId, event) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, pinDetails: event };
        }
        return room;
      }),
    }));
  },

  // handlePollUpdate: (chatroomId, poll) => {
  //   set((state) => {
  //     const currentPoll = state.chatrooms.find((room) => room.id === chatroomId)?.pollDetails;
  //     return {
  //       chatrooms: state.chatrooms.map((room) => {
  //         if (room.id === chatroomId) {
  //           return { ...room, pollDetails: currentPoll ? { ...currentPoll, ...poll } : poll };
  //         }
  //         return room;
  //       }),
  //     };
  //   });
  // },

  handlePinnedMessageDeleted: (chatroomId, event) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, pinDetails: null };
        }
        return room;
      }),
    }));
  },

  // handlePollDelete: (chatroomId) => {
  //   set((state) => ({
  //     chatrooms: state.chatrooms.map((room) => {
  //       if (room.id === chatroomId) {
  //         return { ...room, pollDetails: null };
  //       }
  //       return room;
  //     }),
  //   }));
  // },

  handleStreamStatus: (chatroomId, event, isLive) => {
    const currentChatroom = get().chatrooms.find((room) => room.id === chatroomId);
    const updatedChatroom = {
      ...currentChatroom,
      isStreamerLive: isLive,
      streamerData: {
        ...currentChatroom.streamerData,
        livestream: event?.livestream ? { ...currentChatroom.streamerData?.livestream, ...event?.livestream } : null,
      },
    };

    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return updatedChatroom;
        }
        return room;
      }),
    }));

    // Update local storage with the updated chatroom
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
    const updatedChatrooms = savedChatrooms.map((room) => (room.id === chatroomId ? updatedChatroom : room));
    localStorage.setItem("chatrooms", JSON.stringify(updatedChatrooms));
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

  // Add initial chatroom messages, reverse the order of the messages
  addInitialChatroomMessages: (chatroomId, data) => {
    [...data].reverse().forEach((message) => {
      message.is_old = true;
      message.metadata = JSON.parse(message.metadata);

      get().addChatter(chatroomId, message?.sender);
      window.app.logs.add({
        chatroomId: chatroomId,
        userId: message?.sender?.id,
        message: message,
      });

      get().addMessage(chatroomId, message);
    });
  },

  handleChatroomPause: (chatroomId, isPaused) => {
    set((state) => ({
      isChatroomPaused: { ...state.isChatroomPaused, [chatroomId]: isPaused },
    }));
  },

  handleEmoteSetUpdate: (chatroomId, body) => {
    if (!body) return;

    const { pulled = [], pushed = [], updated = [] } = body;

    const chatroom = get().chatrooms.find((room) => room.id === chatroomId);
    if (!chatroom) return;
    const channelEmoteSet = Array.isArray(chatroom.channel7TVEmotes)
      ? chatroom.channel7TVEmotes.find((set) => set.type === "channel")
      : null;
    if (!channelEmoteSet?.emotes) return;

    let emotes = channelEmoteSet.emotes || [];

    if (pulled.length > 0) {
      pulled.forEach((pulledItem) => {
        let emoteId = null;
        if (typeof pulledItem === "string") {
          emoteId = pulledItem;
        } else if (pulledItem && typeof pulledItem === "object" && pulledItem.old_value && pulledItem.old_value.id) {
          emoteId = pulledItem.old_value.id;
        }
        if (emoteId) {
          emotes = emotes.filter((emote) => emote.id !== emoteId);
        }
      });
    }

    if (pushed.length > 0) {
      pushed.forEach((emote) => {
        const value = emote.value;
        if (!value?.id || emotes.some((e) => e.id === value.id)) return;
        emotes.push({
          id: value.id,
          actor_id: value.actor_id,
          name: value.name,
          alias: value.data?.name !== value.name ? value.data?.name : null,
          owner: value.data?.owner,
          file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
          platform: "7tv",
        });
      });
    }

    if (updated.length > 0) {
      updated.forEach((emote) => {
        const { old_value, value } = emote;
        if (!old_value?.id || !value?.id) return;
        emotes = emotes.filter((e) => e.id !== old_value.id);
        emotes.push({
          id: value.id,
          actor_id: value.actor_id,
          name: value.name,
          alias: value.data?.name !== value.name ? value.data?.name : null,
          owner: value.data?.owner,
          file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
          platform: "7tv",
        });
      });
    }

    emotes.sort((a, b) => a.name.localeCompare(b.name));

    let updatedChannel7TVEmotes;
    if (Array.isArray(chatroom.channel7TVEmotes)) {
      updatedChannel7TVEmotes = chatroom.channel7TVEmotes.map((set) => (set.type === "channel" ? { ...set, emotes } : set));
    } else if (chatroom.channel7TVEmotes && chatroom.channel7TVEmotes.emote_set) {
      updatedChannel7TVEmotes = {
        ...chatroom.channel7TVEmotes,
        emote_set: {
          ...chatroom.channel7TVEmotes.emote_set,
          emotes,
        },
      };
    } else {
      updatedChannel7TVEmotes = chatroom.channel7TVEmotes;
    }

    set((state) => ({
      chatrooms: state.chatrooms.map((room) =>
        room.id === chatroomId ? { ...room, channel7TVEmotes: updatedChannel7TVEmotes } : room,
      ),
    }));

    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
    localStorage.setItem(
      "chatrooms",
      JSON.stringify(
        savedChatrooms.map((room) => (room.id === chatroomId ? { ...room, channel7TVEmotes: updatedChannel7TVEmotes } : room)),
      ),
    );
  },

  refresh7TVEmotes: async (chatroomId) => {
    try {
      const chatroom = get().chatrooms.find((room) => room.id === chatroomId);
      if (!chatroom || chatroom?.last7TVSetUpdated > dayjs().subtract(30, "second").toISOString()) return;

      // System message starting refresh
      get().addMessage(chatroomId, {
        id: crypto.randomUUID(),
        type: "system",
        content: "Refreshing 7TV emotes...",
        timestamp: new Date().toISOString(),
      });

      // Fetch new emote sets
      const channel7TVEmotes = await window.app.stv.getChannelEmotes(chatroom.streamerData.user_id);

      // Update local storage and state
      if (channel7TVEmotes) {
        const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
        const updatedChatrooms = savedChatrooms.map((room) =>
          room.id === chatroomId ? { ...room, channel7TVEmotes, last7TVSetUpdated: dayjs().toISOString() } : room,
        );
        localStorage.setItem("chatrooms", JSON.stringify(updatedChatrooms));

        set((state) => ({
          chatrooms: state.chatrooms.map((room) => {
            if (room.id === chatroom.id) {
              return { ...room, channel7TVEmotes, last7TVSetUpdated: dayjs().toISOString() };
            }
            return room;
          }),
        }));

        // Send system message on success
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "7TV emotes refreshed successfully!",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("[7TV Refresh]: Error refreshing emotes:", error);
      // Send system message on error
      get().addMessage(chatroomId, {
        id: crypto.randomUUID(),
        type: "system",
        content: "Failed to refresh 7TV emotes. Please try again.",
        timestamp: new Date().toISOString(),
      });
    }
  },

  refreshKickEmotes: async (chatroomId) => {
    try {
      const chatroom = get().chatrooms.find((room) => room.id === chatroomId);
      if (!chatroom || chatroom?.lastKickEmoteRefresh > dayjs().subtract(30, "second").toISOString()) return;

      // System message starting Refresh
      get().addMessage(chatroomId, {
        id: crypto.randomUUID(),
        type: "system",
        content: "Refreshing Kick emotes...",
        timestamp: new Date().toISOString(),
      });

      // Fetch new emote sets
      const kickEmotes = await window.app.kick.getEmotes(chatroom.slug);

      // Update local storage and state
      if (kickEmotes) {
        set((state) => ({
          chatrooms: state.chatrooms.map((room) => {
            if (room.id === chatroom.id) {
              return { ...room, emotes: kickEmotes, lastKickEmoteRefresh: dayjs().toISOString() };
            }
            return room;
          }),
        }));

        // Send system message on success
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "Kick emotes refreshed successfully!",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("[Kick Refresh]: Error refreshing emotes:", error);
      // Send system message on error
      get().addMessage(chatroomId, {
        id: crypto.randomUUID(),
        type: "system",
        content: "Failed to refresh Kick emotes. Please try again.",
        timestamp: new Date().toISOString(),
      });
    }
  },

  renameChatroom: (chatroomId, newDisplayName) => {
    // Update localStorage
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
    localStorage.setItem(
      "chatrooms",
      JSON.stringify(savedChatrooms.map((room) => (room.id === chatroomId ? { ...room, displayName: newDisplayName } : room))),
    );

    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, displayName: newDisplayName };
        }
        return room;
      }),
    }));
  },
}));

if (window.location.pathname === "/" || window.location.pathname.endsWith("index.html")) {
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
        const authTokens = window.app.auth.getToken();

        if (storeStvId && authTokens?.token && authTokens?.session) {
          initializePresenceUpdates();
        } else {
          console.log("[7TV Presence]: No STV ID or auth tokens found after delay");
        }
      }, 8 * 1000); // 8 seconds delay

      return;
    }

    // Check for auth tokens before starting presence updates
    const authTokens = window.app.auth.getToken();
    if (!authTokens?.token || !authTokens?.session) {
      console.log("[7TV Presence]: No auth tokens available, skipping presence update initialization");
      return;
    }

    // Send presence updates every 2 minutes
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
      1 * 60 * 1000,
    );

    return () => {
      if (presenceUpdatesInterval) {
        console.log("[7TV Presence]: Clearing presence update checks");
        clearInterval(presenceUpdatesInterval);
      }
    };
  };

  initializePresenceUpdates();
}

export default useChatStore;
