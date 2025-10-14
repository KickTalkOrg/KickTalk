import { useEffect } from "react";
import { create } from "zustand";
import KickPusher from "../../../../utils/services/kick/kickPusher";
import { chatroomErrorHandler } from "../utils/chatErrors";
import queueChannelFetch from "../../../../utils/fetchQueue";
import StvWebSocket from "../../../../utils/services/seventv/stvWebsocket";
import ConnectionManager from "../../../../utils/services/connectionManager";
import useCosmeticsStore from "./CosmeticsProvider";
import { sendUserPresence } from "../../../../utils/services/seventv/stvAPI";
import { getKickTalkDonators } from "../../../../utils/services/kick/kickAPI";
import dayjs from "dayjs";

// Message states for optimistic sending
const MESSAGE_STATES = {
  OPTIMISTIC: 'optimistic',  // Sent, waiting for confirmation
  CONFIRMED: 'confirmed',    // Received back from server
  FAILED: 'failed'          // Send failed, needs retry
};

let stvPresenceUpdates = new Map();
let storeStvId = null;
const PRESENCE_UPDATE_INTERVAL = 30 * 1000;

// Global connection manager instance
let connectionManager = null;
let initializationInProgress = false;
// Periodic cleanup interval for memory management
let memoryCleanupInterval = null;

// Load initial state from local storage
const getInitialState = () => {
  const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
  const savedMentionsTab = localStorage.getItem("hasMentionsTab") === "true";
  const savedPersonalEmoteSets = JSON.parse(localStorage.getItem("stvPersonalEmoteSets")) || [];

  const chatrooms = savedChatrooms.map((room) => {
    const { pinDetails = null, pollDetails = null, chatters = [], ...rest } = room;
    return rest;
  });

  return {
    chatrooms,
    messages: {},
    connections: {},
    chatters: {},
    donators: [],
    personalEmoteSets: savedPersonalEmoteSets,
    isChatroomPaused: {}, // Store for all Chatroom Pauses
    mentions: {}, // Store for all Mentions
    currentChatroomId: null, // Track the currently active chatroom
    hasMentionsTab: savedMentionsTab, // Track if mentions tab is enabled
    currentUser: null, // Cache current user info for optimistic messages
  };
};

const useChatStore = create((set, get) => ({
  ...getInitialState(),

  // Clean up all batching
  cleanupBatching: () => {
    if (window.__chatMessageBatch) {
      Object.keys(window.__chatMessageBatch).forEach((chatroomId) => {
        if (window.__chatMessageBatch[chatroomId].timer) {
          clearTimeout(window.__chatMessageBatch[chatroomId].timer);
        }
        // Flush remaining messages
        const batch = window.__chatMessageBatch[chatroomId].queue;
        if (batch?.length > 0) {
          batch.forEach((msg) => get().addMessage(chatroomId, msg));
        }
      });
      window.__chatMessageBatch = {};
    }
  },

  // Get connection manager status for debugging
  getConnectionStatus: () => {
    if (connectionManager) {
      return connectionManager.getConnectionStatus();
    }
    return {
      manager: "not initialized",
      individual_connections: Object.keys(get().connections).length,
    };
  },

  // Debug function to toggle livestream status for testing
  debugToggleStreamStatus: (chatroomId, isLive) => {
    console.log(`[DEBUG] Toggling stream status for chatroom ${chatroomId}: ${isLive ? "LIVE" : "OFFLINE"}`);
    const mockEvent = {
      livestream: {
        id: Math.random().toString(),
        is_live: isLive,
        session_title: "Mock Stream Title",
        created_at: new Date().toISOString(),
      },
    };
    get().handleStreamStatus(chatroomId, mockEvent, isLive);
  },

  // Handles Sending Presence Updates to 7TV for a chatroom
  sendPresenceUpdate: (stvId, userId) => {
    if (!stvId) {
      console.log("[7tv Presence]: No STV ID provided, skipping presence update");
      return;
    }

    const authTokens = window.app.auth.getToken();
    if (!authTokens?.token || !authTokens?.session) {
      console.log("[7tv Presence]: No auth tokens available, skipping presence update");
      return;
    }

    const currentTime = Date.now();

    if (stvPresenceUpdates.has(userId)) {
      const lastUpdateTime = stvPresenceUpdates.get(userId);
      console.log("[7tv Presence]: Last update time for chatroom:", userId, lastUpdateTime, stvPresenceUpdates);
      if (currentTime - lastUpdateTime < PRESENCE_UPDATE_INTERVAL) {
        return;
      }
    }

    stvPresenceUpdates.set(userId, currentTime);
    sendUserPresence(stvId, userId);

    // Clean up old entries to prevent memory leak
    if (stvPresenceUpdates.size > 100) {
      const cutoffTime = currentTime - PRESENCE_UPDATE_INTERVAL * 2;
      for (const [id, timestamp] of stvPresenceUpdates.entries()) {
        if (timestamp < cutoffTime) {
          stvPresenceUpdates.delete(id);
        }
      }
    }
  },

  // Cache current user info for optimistic messages
  cacheCurrentUser: async () => {
    try {
      const currentUser = await window.app.kick.getSelfInfo();
      set((state) => ({ ...state, currentUser }));
      return currentUser;
    } catch (error) {
      console.error("[Chat Store]: Failed to cache user info:", error);
      return null;
    }
  },

  // Cache current user info for optimistic messages
  cacheCurrentUser: async () => {
    try {
      const currentUser = await window.app.kick.getSelfInfo();
      set((state) => ({ ...state, currentUser }));
      return currentUser;
    } catch (error) {
      console.error("[Chat Store]: Failed to cache user info:", error);
      return null;
    }
  },

  sendMessage: async (chatroomId, content) => {
    try {
      const message = content.trim();
      console.info("Sending message to chatroom:", chatroomId);

      // Use cached user info for instant optimistic message, fallback to API call
      let currentUser = get().currentUser;
      if (!currentUser) {
        currentUser = await get().cacheCurrentUser();
      }
      
      if (!currentUser) {
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "You must login to chat.",
          timestamp: new Date().toISOString(),
        });
        return false;
      }

      // Create and immediately add optimistic message (should be instant now!)
      const optimisticMessage = createOptimisticMessage(chatroomId, message, currentUser);
      get().addMessage(chatroomId, optimisticMessage);

      // Set timeout to mark message as failed if not confirmed within 30 seconds
      const timeoutId = setTimeout(() => {
        const messages = get().messages[chatroomId] || [];
        const stillOptimistic = messages.find(msg => 
          msg.tempId === optimisticMessage.tempId && 
          msg.state === MESSAGE_STATES.OPTIMISTIC
        );
        if (stillOptimistic) {
          console.warn('[Optimistic]: Message timeout, marking as failed:', optimisticMessage.tempId);
          get().updateMessageState(chatroomId, optimisticMessage.tempId, MESSAGE_STATES.FAILED);
        }
      }, 30000);

      // Send message to server
      const response = await window.app.kick.sendMessage(chatroomId, message);

      // Clear timeout if request completes (success or known failure)
      clearTimeout(timeoutId);

      if (response?.data?.status?.code === 401) {
        // Mark optimistic message as failed and show error
        get().updateMessageState(chatroomId, optimisticMessage.tempId, MESSAGE_STATES.FAILED);
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "You must login to chat.",
          timestamp: new Date().toISOString(),
        });
        return false;
      }

      // Message sent successfully - it will be confirmed when we receive it back via WebSocket
      return true;
    } catch (error) {
      console.error('[Send Message]: Error sending message:', error);

      // Find and mark the optimistic message as failed
      const messages = get().messages[chatroomId] || [];
      const optimisticMsg = messages.find(msg => msg.isOptimistic && msg.content === content.trim());
      if (optimisticMsg) {
        get().updateMessageState(chatroomId, optimisticMsg.tempId, MESSAGE_STATES.FAILED);
      }

      // No system message needed - failed state and retry button provide clear feedback

      return false;
    }
  },

  sendReply: async (chatroomId, content, metadata = {}) => {
    try {
      const message = content.trim();
      console.info("Sending reply to chatroom:", chatroomId);

      // Use cached user info for instant optimistic reply, fallback to API call
      let currentUser = get().currentUser;
      if (!currentUser) {
        currentUser = await get().cacheCurrentUser();
      }
      if (!currentUser) {
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "You must login to chat.",
          timestamp: new Date().toISOString(),
        });
        return false;
      }

      // Create and immediately add optimistic reply (should be instant now!)
      const optimisticReply = createOptimisticReply(chatroomId, message, currentUser, metadata);
      get().addMessage(chatroomId, optimisticReply);

      // Set timeout to mark reply as failed if not confirmed within 30 seconds
      const timeoutId = setTimeout(() => {
        const messages = get().messages[chatroomId] || [];
        const stillOptimistic = messages.find(msg => 
          msg.tempId === optimisticReply.tempId && 
          msg.state === MESSAGE_STATES.OPTIMISTIC
        );
        if (stillOptimistic) {
          console.warn('[Optimistic]: Reply timeout, marking as failed:', optimisticReply.tempId);
          get().updateMessageState(chatroomId, optimisticReply.tempId, MESSAGE_STATES.FAILED);
        }
      }, 30000);

      // Send reply to server
      const response = await window.app.kick.sendReply(chatroomId, message, metadata);

      // Clear timeout if request completes (success or known failure)
      clearTimeout(timeoutId);

      if (response?.data?.status?.code === 401) {
        // Mark optimistic reply as failed and show error
        get().updateMessageState(chatroomId, optimisticReply.tempId, MESSAGE_STATES.FAILED);
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: "You must login to chat.",
          timestamp: new Date().toISOString(),
        });
        return false;
      }

      // Reply sent successfully - it will be confirmed when we receive it back via WebSocket
      return true;
    } catch (error) {
      console.error('[Send Reply]: Error sending reply:', error);

      // Find and mark the optimistic reply as failed
      const messages = get().messages[chatroomId] || [];
      const optimisticMsg = messages.find(msg => msg.isOptimistic && msg.content === content.trim() && msg.type === "reply");
      if (optimisticMsg) {
        get().updateMessageState(chatroomId, optimisticMsg.tempId, MESSAGE_STATES.FAILED);
      }

      // No system message needed - failed state and retry button provide clear feedback

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
      const SevenTVEvent = event.detail;
      const { type, body } = SevenTVEvent;

      switch (type) {
        case "connection_established":
          break;
        case "emote_set.update":
          get().handleEmoteSetUpdate(chatroom.id, body);
          break;
        case "cosmetic.create":
          useCosmeticsStore?.getState()?.addCosmetics(body);
          break;
        case "entitlement.create":
          const username = body?.object?.user?.connections?.find((c) => c.platform === "KICK")?.username;
          const transformedUsername = username?.replaceAll("-", "_").toLowerCase();

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
          console.log("[7tv Presence]: No STV ID or auth tokens available for WebSocket presence update");
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
        case "App\\Events\\PollUpdateEvent":
          console.log("Poll update event:", parsedEvent);
          get().handlePollUpdate(chatroom.id, parsedEvent?.poll);
          break;
        case "App\\Events\\PollDeleteEvent":
          get().handlePollDelete(chatroom.id);
          break;
      }
    });

    // Message Events
    pusher.addEventListener("message", async (event) => {
      const parsedEvent = JSON.parse(event.detail.data);

      switch (event.detail.event) {
        case "App\\Events\\ChatMessageEvent":
          // Add user to chatters list if they're not already in there
          get().addChatter(chatroom.id, parsedEvent?.sender);

          // Get batching settings
          const settings = await window.app.store.get("chatrooms");
          const batchingSettings = {
            enabled: settings?.batching ?? false,
            interval: settings?.batchingInterval ?? 0,
          };

          if (!batchingSettings.enabled || batchingSettings.interval === 0) {
            // No batching - add message immediately
            const messageWithTimestamp = {
              ...parsedEvent,
              timestamp: new Date().toISOString(),
            };
            get().addMessage(chatroom.id, messageWithTimestamp);

            if (parsedEvent?.type === "reply") {
              window.app.replyLogs.add({
                chatroomId: chatroom.id,
                userId: parsedEvent.sender.id,
                message: messageWithTimestamp,
              });
            } else {
              window.app.logs.add({
                chatroomId: chatroom.id,
                userId: parsedEvent.sender.id,
                message: messageWithTimestamp,
              });
            }
          } else {
            // Use batching system
            if (!window.__chatMessageBatch) {
              window.__chatMessageBatch = {};
            }

            if (!window.__chatMessageBatch[chatroom.id]) {
              window.__chatMessageBatch[chatroom.id] = {
                queue: [],
                timer: null,
              };
            }

            // queue batch
            window.__chatMessageBatch[chatroom.id].queue.push({
              ...parsedEvent,
              timestamp: new Date().toISOString(),
            });

            // flusher
            const flushBatch = () => {
              try {
                const batch = window.__chatMessageBatch[chatroom.id]?.queue;
                if (batch && batch.length > 0) {
                  batch.forEach((msg) => {
                    get().addMessage(chatroom.id, msg);

                    if (msg?.type === "reply") {
                      window.app.replyLogs.add({
                        chatroomId: chatroom.id,
                        userId: msg.sender.id,
                        message: msg,
                      });
                    } else {
                      window.app.logs.add({
                        chatroomId: chatroom.id,
                        userId: msg.sender.id,
                        message: msg,
                      });
                    }
                  });
                  window.__chatMessageBatch[chatroom.id].queue = [];
                }
              } catch (error) {
                console.error("[Batching] Error flushing batch:", error);
              }
            };

            if (!window.__chatMessageBatch[chatroom.id].timer) {
              window.__chatMessageBatch[chatroom.id].timer = setTimeout(() => {
                flushBatch();
                window.__chatMessageBatch[chatroom.id].timer = null;
              }, batchingSettings.interval);
            }
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

    // Pre-cache current user info for instant optimistic messaging
    if (!get().currentUser) {
      get().cacheCurrentUser().catch(console.error);
    }

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

      if (Array.isArray(data)) {
        data.forEach((set) => {
          set.emotes = set.emotes.filter((emote) => {
            if (sevenTVEmoteNames.has(emote.name)) {
              removedEmotes.push({ id: emote.id, name: emote.name, owner: emote.owner });
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
      } else {
        get().handlePinnedMessageDeleted(chatroom.id);
      }

      // Add initial messages to the chatroom
      if (data?.messages) {
        get().addInitialChatroomMessages(chatroom.id, data.messages.reverse());
      }
    };

    fetchInitialMessages();

    const fetchInitialPollInfo = async () => {
      const response = await window.app.kick.getInitialPollInfo(chatroom?.streamerData?.slug);

      if (!response) {
        console.log("[Initial Poll Info]: No response received, skipping update");
        return;
      }

      if (response.data?.status?.code === 404) {
        get().handlePollDelete(chatroom.id);
      }

      if (response.data?.status?.code === 200) {
        get().handlePollUpdate(chatroom.id, response.data?.data?.poll);
      }
    };

    fetchInitialPollInfo();

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

  // Fetch and cache donators list from API
  fetchDonators: async () => {
    try {
      const donators = await getKickTalkDonators();
      set({ donators: donators || [] });

      return donators;
    } catch (error) {
      console.error("[Chat Provider]: Error fetching donators:", error);
      set({ donators: [] });
      return [];
    }
  },

  initializeConnections: async () => {
    // Prevent multiple simultaneous initializations
    if (initializationInProgress) {
      console.log("[ChatProvider] Initialization already in progress, skipping...");
      return;
    }

    initializationInProgress = true;
    console.log("[ChatProvider] Starting OPTIMIZED connection initialization...");

    try {
      // Fetch donators list once on initialization
      get().fetchDonators();

      const chatrooms = get().chatrooms;
      if (!chatrooms?.length) {
        console.log("[ChatProvider] No chatrooms to initialize");
        return;
      }

      // Cleanup existing connection manager if it exists
      if (connectionManager) {
        connectionManager.cleanup();
      }

      // Create new connection manager
      connectionManager = new ConnectionManager();

      // Set up event handlers for the shared connections
      const eventHandlers = {
        // KickPusher event handlers
        onKickMessage: (event) => {
          try {
            const { chatroomId } = event.detail;
            // console.log(`[ChatProvider] Received kick message for chatroom ${chatroomId}:`, event.detail);
            if (chatroomId) {
              get().handleKickMessage(chatroomId, event.detail);
            }
          } catch (error) {
            console.error("[ChatProvider] Error handling kick message:", error);
          }
        },
        onKickChannel: (event) => {
          try {
            const { chatroomId } = event.detail;
            if (chatroomId) {
              get().handleKickChannel(chatroomId, event.detail);
            }
          } catch (error) {
            console.error("[ChatProvider] Error handling kick channel event:", error);
          }
        },
        onKickConnection: (event) => {
          try {
            get().handleKickConnection(event.detail);
          } catch (error) {
            console.error("[ChatProvider] Error handling kick connection:", error);
          }
        },
        onKickSubscriptionSuccess: (event) => {
          try {
            const { chatroomId } = event.detail;
            if (chatroomId) {
              console.log(`[ChatProvider] Subscription successful for chatroom: ${chatroomId}`);
              // Use setTimeout to prevent immediate state update loops
              setTimeout(() => {
                get().addMessage(chatroomId, {
                  id: crypto.randomUUID(),
                  type: "system",
                  content: "connection-success",
                  chatroomNumber: chatroomId,
                  timestamp: new Date().toISOString(),
                });
              }, 0);
            }
          } catch (error) {
            console.error("[ChatProvider] Error handling kick subscription success:", error);
          }
        },
        // 7TV event handlers
        onStvMessage: (event) => {
          try {
            const { chatroomId } = event.detail;
            if (chatroomId) {
              get().handleStvMessage(chatroomId, event.detail);
            } else {
              // Broadcast to all chatrooms if no specific chatroom
              chatrooms.forEach((chatroom) => {
                get().handleStvMessage(chatroom.id, event.detail);
              });
            }
          } catch (error) {
            console.error("[ChatProvider] Error handling 7TV message:", error);
          }
        },
        onStvOpen: (event) => {
          try {
            const { chatroomId } = event.detail;
            if (chatroomId) {
              console.log(`[ChatProvider] 7TV WebSocket connected for chatroom: ${chatroomId}`);
            } else {
              console.log("[ChatProvider] 7TV WebSocket connected for all chatrooms");
            }
          } catch (error) {
            console.error("[ChatProvider] Error handling 7TV open:", error);
          }
        },
        onStvConnection: () => {
          try {
            console.log("[ChatProvider] 7TV shared connection established");
          } catch (error) {
            console.error("[ChatProvider] Error handling 7TV connection:", error);
          }
        },
      };

      try {
        console.log(`[ChatProvider] Initializing ${chatrooms.length} chatrooms with optimized connections...`);

        // Prepare store callbacks to avoid circular imports
        const storeCallbacks = {
          handlePinnedMessageCreated: get().handlePinnedMessageCreated,
          handlePinnedMessageDeleted: get().handlePinnedMessageDeleted,
          addInitialChatroomMessages: get().addInitialChatroomMessages,
          handleStreamStatus: get().handleStreamStatus,
        };

        // Initialize connections with the new manager
        await connectionManager.initializeConnections(chatrooms, eventHandlers, storeCallbacks);

        console.log("[ChatProvider] ✅ Optimized connection initialization completed!");
        console.log("[ChatProvider] 📊 Connection status:", connectionManager.getConnectionStatus());

        // Show performance comparison in console
        console.log("[ChatProvider] 🚀 Performance improvement:");
        console.log(
          `  - WebSocket connections: ${chatrooms.length * 2} → 2 (${(((chatrooms.length * 2 - 2) / (chatrooms.length * 2)) * 100).toFixed(1)}% reduction)`,
        );
        console.log(`  - Expected startup time improvement: ~75% faster`);
      } catch (error) {
        console.error("[ChatProvider] ❌ Error during optimized initialization:", error);
        // Fallback to individual connections if shared connections fail
        console.log("[ChatProvider] 🔄 Falling back to individual connections...");
        get().initializeIndividualConnections();
      }
    } finally {
      initializationInProgress = false;
    }
  },

  // Fallback method for individual connections (existing behavior)
  initializeIndividualConnections: () => {
    console.log("[ChatProvider] Initializing individual connections (fallback)...");

    get()?.chatrooms?.forEach((chatroom) => {
      if (!get().connections[chatroom.id]) {
        // Connect to chatroom
        get().connectToChatroom(chatroom);

        // Connect to 7TV WebSocket
        get().connectToStvWebSocket(chatroom);
      }
    });
  },

  // Shared connection event handlers
  handleKickMessage: async (chatroomId, eventDetail) => {
    // console.log(`[ChatProvider] Processing kick message for chatroom ${chatroomId}:`, eventDetail);
    const parsedEvent = JSON.parse(eventDetail.data);

    switch (eventDetail.event) {
      case "App\\Events\\ChatMessageEvent":
        // Add user to chatters list if they're not already in there
        get().addChatter(chatroomId, parsedEvent?.sender);

        // Get batching settings
        const settings = await window.app.store.get("chatrooms");
        const batchingSettings = {
          enabled: settings?.batching ?? false,
          interval: settings?.batchingInterval ?? 0,
        };

        if (!batchingSettings.enabled || batchingSettings.interval === 0) {
          // No batching - add message immediately
          const messageWithTimestamp = {
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          };
          // console.log(`[ChatProvider] Adding message to chatroom ${chatroomId}:`, messageWithTimestamp);
          get().addMessage(chatroomId, messageWithTimestamp);

          // Verify the message was added
          const currentMessages = get().messages[chatroomId] || [];
          // console.log(`[ChatProvider] Chatroom ${chatroomId} now has ${currentMessages.length} messages`);

          if (parsedEvent?.type === "reply") {
            window.app.replyLogs.add({
              chatroomId: chatroomId,
              userId: parsedEvent.sender.id,
              message: messageWithTimestamp,
            });
          } else {
            window.app.logs.add({
              chatroomId: chatroomId,
              userId: parsedEvent.sender.id,
              message: messageWithTimestamp,
            });
          }
        } else {
          // Use batching system (existing logic)
          if (!window.__chatMessageBatch) {
            window.__chatMessageBatch = {};
          }

          if (!window.__chatMessageBatch[chatroomId]) {
            window.__chatMessageBatch[chatroomId] = {
              queue: [],
              timer: null,
            };
          }

          window.__chatMessageBatch[chatroomId].queue.push({
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          });

          const flushBatch = () => {
            try {
              const batch = window.__chatMessageBatch[chatroomId]?.queue;
              if (batch && batch.length > 0) {
                batch.forEach((msg) => {
                  get().addMessage(chatroomId, msg);

                  if (msg?.type === "reply") {
                    window.app.replyLogs.add({
                      chatroomId: chatroomId,
                      userId: msg.sender.id,
                      message: msg,
                    });
                  } else {
                    window.app.logs.add({
                      chatroomId: chatroomId,
                      userId: msg.sender.id,
                      message: msg,
                    });
                  }
                });
                window.__chatMessageBatch[chatroomId].queue = [];
              }
            } catch (error) {
              console.error("[Batching] Error flushing batch:", error);
            }
          };

          if (!window.__chatMessageBatch[chatroomId].timer) {
            window.__chatMessageBatch[chatroomId].timer = setTimeout(() => {
              flushBatch();
              window.__chatMessageBatch[chatroomId].timer = null;
            }, batchingSettings.interval);
          }
        }
        break;

      case "App\\Events\\MessageDeletedEvent":
        get().handleMessageDelete(chatroomId, parsedEvent.message.id);
        break;

      case "App\\Events\\UserBannedEvent":
        get().handleUserBanned(chatroomId, parsedEvent.user, parsedEvent.banned_by, parsedEvent.permanent);
        break;

      case "App\\Events\\UserUnbannedEvent":
        get().handleUserUnbanned(chatroomId, parsedEvent.user, parsedEvent.unbanned_by);
        break;
    }
  },

  handleKickChannel: (chatroomId, eventDetail) => {
    const parsedEvent = JSON.parse(eventDetail.data);

    switch (eventDetail.event) {
      case "App\\Events\\LivestreamUpdated":
        get().handleStreamStatus(chatroomId, parsedEvent, true);
        break;
      case "App\\Events\\ChatroomUpdatedEvent":
        get().handleChatroomUpdated(chatroomId, parsedEvent);
        break;
      case "App\\Events\\StreamerIsLive":
        console.log("Streamer is live", parsedEvent);
        get().handleStreamStatus(chatroomId, parsedEvent, true);
        break;
      case "App\\Events\\StopStreamBroadcast":
        console.log("Streamer is offline", parsedEvent);
        get().handleStreamStatus(chatroomId, parsedEvent, false);
        break;
      case "App\\Events\\PinnedMessageCreatedEvent":
        get().handlePinnedMessageCreated(chatroomId, parsedEvent);
        break;
      case "App\\Events\\PinnedMessageDeletedEvent":
        get().handlePinnedMessageDeleted(chatroomId);
        break;
      case "App\\Events\\PollUpdateEvent":
        console.log("Poll update event:", parsedEvent);
        get().handlePollUpdate(chatroomId, parsedEvent?.poll);
        break;
      case "App\\Events\\PollDeleteEvent":
        get().handlePollDelete(chatroomId);
        break;
    }
  },

  handleKickConnection: (eventDetail) => {
    const { chatrooms } = eventDetail;
    if (chatrooms) {
      chatrooms.forEach((chatroomId) => {
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "system",
          content: eventDetail.content,
          chatroomNumber: chatroomId,
          timestamp: new Date().toISOString(),
        });
      });
    }
  },

  handleStvMessage: (chatroomId, eventDetail) => {
    const { type, body } = eventDetail;

    switch (type) {
      case "connection_established":
        break;
      case "emote_set.update":
        get().handleEmoteSetUpdate(chatroomId, body);
        break;
      case "cosmetic.create":
        useCosmeticsStore?.getState()?.addCosmetics(body);
        break;
      case "entitlement.create":
        const username = body?.object?.user?.connections?.find((c) => c.platform === "KICK")?.username;
        const transformedUsername = username?.replaceAll("-", "_").toLowerCase();
        useCosmeticsStore?.getState()?.addUserStyle(transformedUsername, body);
        break;
      default:
        break;
    }
  },

  // [Notification Sounds & Mentions]
  handleNotification: async (chatroomId, message) => {
    try {
      if (message.is_old && message.type !== "message") return;
      if (message.soundPlayed) return;

      const notificationSettings = await window.app.store.get("notifications");
      if (!notificationSettings?.enabled || !notificationSettings?.sound || !notificationSettings?.phrases?.length) return;

      const userId = localStorage.getItem("kickId");

      // Skip own messages
      if (message?.sender?.id == userId) return;

      // Only play sound for recent messages (within last 5 seconds)
      const messageTime = new Date(message.created_at || message.timestamp).getTime();
      if (Date.now() - messageTime > 5000) return;

      // Check if it's a reply to user's message first
      if (message?.metadata?.original_sender?.id == userId && message?.sender?.id != userId) {
        get().playNotificationSound(chatroomId, message, notificationSettings);
        get().addMention(chatroomId, message, "reply");
        return;
      }

      // Otherwise check for highlight phrases
      const hasHighlightPhrase = notificationSettings.phrases.some((phrase) =>
        message.content?.toLowerCase().includes(phrase.toLowerCase()),
      );

      if (hasHighlightPhrase) {
        get().playNotificationSound(chatroomId, message, notificationSettings);
        get().addMention(chatroomId, message, "highlight");
      }
    } catch (error) {
      console.error("[Notifications]: Error handling notification:", error);
    }
  },

  // Helper function to play notification sound
  playNotificationSound: async (chatroomId, message, settings) => {
    try {
      console.log("[Notifications]: Playing notification sound");

      const soundUrl = await window.app.notificationSounds.getSoundUrl(settings?.soundFile);
      const audio = new Audio(soundUrl);
      audio.volume = settings?.volume || 0.1;
      await audio.play();
      get().getUpdateSoundPlayed(chatroomId, message.id);
    } catch (error) {
      console.error("[Notifications]: Error playing notification sound:", error);
    }
  },

  addMessage: (chatroomId, message) => {
    set((state) => {
      const messages = state.messages[chatroomId] || [];

      const currentChatroomId = get().currentChatroomId;
      const isRead = message?.is_old || chatroomId === currentChatroomId;

      const newMessage = {
        ...message,
        chatroom_id: chatroomId,
        deleted: false,
        isRead: isRead,
      };

      // Check if this is a confirmation of an optimistic message (regular or reply)
      if (!newMessage.isOptimistic && (newMessage.type === "message" || newMessage.type === "reply")) {
        const optimisticIndex = messages.findIndex(msg => 
          msg.isOptimistic && 
          msg.content === newMessage.content &&
          msg.sender?.id === newMessage.sender?.id &&
          msg.type === newMessage.type &&
          msg.state === MESSAGE_STATES.OPTIMISTIC
        );

        if (optimisticIndex !== -1) {
          // Replace optimistic message with confirmed message
          const updatedMessages = [...messages];
          updatedMessages[optimisticIndex] = {
            ...newMessage,
            state: MESSAGE_STATES.CONFIRMED,
            isOptimistic: false
          };

          return {
            ...state,
            messages: {
              ...state.messages,
              [chatroomId]: updatedMessages,
            },
          };
        }
      }

      if (messages.some((msg) => msg.id === newMessage.id)) {
        console.log(`[addMessage] Duplicate message ${newMessage.id}, skipping`);
        return state;
      }

      let updatedMessages = message?.is_old ? [newMessage, ...messages] : [...messages, newMessage];

      // Sort messages by timestamp to handle edge cases where messages arrive out of order
      // Only sort if we have a mix of optimistic and confirmed messages to avoid unnecessary work
      const hasOptimistic = updatedMessages.some(msg => msg.isOptimistic);
      const hasConfirmed = updatedMessages.some(msg => !msg.isOptimistic);
      
      if (hasOptimistic && hasConfirmed) {
        updatedMessages.sort((a, b) => {
          const timeA = new Date(a.created_at || a.timestamp).getTime();
          const timeB = new Date(b.created_at || b.timestamp).getTime();
          return timeA - timeB;
        });
      }

      // Keep a fixed window of messages based on pause state
      if (state.isChatroomPaused?.[chatroomId] && updatedMessages.length > 600) {
        updatedMessages = updatedMessages.slice(-300);
      } else if (!state.isChatroomPaused?.[chatroomId] && updatedMessages.length > 200) {
        updatedMessages = updatedMessages.slice(-200);
      }

      return {
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages,
        },
      };
    });

    // Handle Playing Notification Sounds
    get().handleNotification(chatroomId, message);
  },

  addChatter: (chatroomId, chatter) => {
    set((state) => {
      const chatters = state.chatters[chatroomId] || [];

      // Check if chatter already exists
      const existingChatterIndex = chatters.findIndex((c) => c.id === chatter.id);
      if (existingChatterIndex !== -1) {
        // Update existing chatter's timestamp to mark as recently active
        const updatedChatters = [...chatters];
        updatedChatters[existingChatterIndex] = {
          ...updatedChatters[existingChatterIndex],
          lastSeen: Date.now(),
        };
        return {
          chatters: {
            ...state.chatters,
            [chatroomId]: updatedChatters,
          },
        };
      }

      // Add timestamp to new chatter
      const chatterWithTimestamp = {
        ...chatter,
        lastSeen: Date.now(),
      };

      let updatedChatters = [...chatters, chatterWithTimestamp]?.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

      return {
        chatters: {
          ...state.chatters,
          [chatroomId]: updatedChatters,
        },
      };
    });
  },

  addChatroom: async (username) => {
    try {
      const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];

      // Check for duplicate chatroom
      const isDuplicate = savedChatrooms.some(
        (chatroom) =>
          chatroom.username.toLowerCase() === username.toLowerCase() ||
          chatroom.username.toLowerCase() === username.replaceAll("-", "_"),
      );

      if (isDuplicate) {
        return { error: "DUPLICATE", message: `Chatroom "${username}" is already added` };
      }

      if (savedChatrooms.length >= 5) {
        return { error: "LIMIT_REACHED", message: "Maximum of 5 chatrooms allowed" };
      }

      const response = await queueChannelFetch(username);
      if (!response?.user) return response;

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

  // Update message state (optimistic -> confirmed/failed)
  updateMessageState: (chatroomId, tempId, newState) => {
    set((state) => {
      const messages = state.messages[chatroomId] || [];
      const updatedMessages = messages.map(msg => 
        msg.tempId === tempId 
          ? { ...msg, state: newState }
          : msg
      );

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages
        }
      };
    });
  },

  // Remove optimistic message and replace with confirmed message
  confirmMessage: (chatroomId, tempId, confirmedMessage) => {
    set((state) => {
      const messages = state.messages[chatroomId] || [];
      const updatedMessages = messages.map(msg => 
        msg.tempId === tempId 
          ? { ...confirmedMessage, state: MESSAGE_STATES.CONFIRMED, isOptimistic: false }
          : msg
      );

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages
        }
      };
    });
  },

  // Remove failed optimistic messages
  removeOptimisticMessage: (chatroomId, tempId) => {
    set((state) => {
      const messages = state.messages[chatroomId] || [];
      const updatedMessages = messages.filter(msg => msg.tempId !== tempId);

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatroomId]: updatedMessages
        }
      };
    });
  },

  // Retry failed optimistic message
  retryFailedMessage: async (chatroomId, tempId) => {
    const messages = get().messages[chatroomId] || [];
    const failedMessage = messages.find(msg => msg.tempId === tempId && msg.state === MESSAGE_STATES.FAILED);
    
    if (!failedMessage) return false;

    // Remove the failed message
    get().removeOptimisticMessage(chatroomId, tempId);

    // Resend based on message type
    if (failedMessage.type === "reply") {
      return await get().sendReply(chatroomId, failedMessage.content, failedMessage.metadata);
    } else {
      return await get().sendMessage(chatroomId, failedMessage.content);
    }
  },

  removeChatroom: (chatroomId) => {
    console.log(`[ChatProvider]: Removing chatroom ${chatroomId}`);

    // Use connection manager for shared connections
    if (connectionManager) {
      connectionManager.removeChatroom(chatroomId);
    }

    // Clean up any individual connections in state (works for both pooled and individual modes)
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

    // Clean up batching system
    if (window.__chatMessageBatch?.[chatroomId]) {
      if (window.__chatMessageBatch[chatroomId].timer) {
        clearTimeout(window.__chatMessageBatch[chatroomId].timer);
      }
      // Flush any remaining messages
      const batch = window.__chatMessageBatch[chatroomId].queue;
      if (batch?.length > 0) {
        batch.forEach((msg) => get().addMessage(chatroomId, msg));
      }
      // Remove from global state
      delete window.__chatMessageBatch[chatroomId];
    }

    set((state) => {
      const { [chatroomId]: _, ...messages } = state.messages;
      const { [chatroomId]: __, ...connections } = state.connections;
      const { [chatroomId]: ___, ...mentions } = state.mentions;

      return {
        chatrooms: state.chatrooms.filter((room) => room.id !== chatroomId),
        messages,
        connections,
        mentions,
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
      if (messageData?.type === "dialog") return false;

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

  handlePollUpdate: (chatroomId, poll) => {
    if (!poll?.title) return null;

    set((state) => {
      const currentPoll = state.chatrooms.find((room) => room.id === chatroomId)?.pollDetails;

      return {
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroomId) {
            return { ...room, pollDetails: currentPoll ? { ...currentPoll, ...poll } : poll };
          }
          return room;
        }),
      };
    });
  },

  handlePinnedMessageDeleted: (chatroomId) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, pinDetails: null };
        }
        return room;
      }),
    }));

    // Update local storage
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
    const updatedChatrooms = savedChatrooms.map((room) => (room.id === chatroomId ? { ...room, pinDetails: null } : room));
    localStorage.setItem("chatrooms", JSON.stringify(updatedChatrooms));
  },

  handlePollDelete: (chatroomId) => {
    set((state) => ({
      chatrooms: state.chatrooms.map((room) => {
        if (room.id === chatroomId) {
          return { ...room, pollDetails: null };
        }
        return room;
      }),
    }));
  },

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

    const personalEmoteSets = get().personalEmoteSets;
    if (!channelEmoteSet?.emotes || !personalEmoteSets?.length) return;

    let emotes = channelEmoteSet.emotes || [];
    const isPersonalSetUpdated = personalEmoteSets.some((set) => body.id === set.setInfo?.id);

    // Get the specific personal emote set being updated
    const personalSetBeingUpdated = personalEmoteSets.find((set) => body.id === set.setInfo?.id);
    let personalEmotes = isPersonalSetUpdated ? [...(personalSetBeingUpdated?.emotes || [])] : [];

    // Track changes for update messages in chat
    const addedEmotes = [];
    const removedEmotes = [];
    const updatedEmotes = [];

    if (pulled.length > 0) {
      pulled.forEach((pulledItem) => {
        let emoteId = null;
        let emoteName = null;
        let emoteOwner = null;
        if (typeof pulledItem === "string") {
          emoteId = pulledItem;
        } else if (pulledItem && typeof pulledItem === "object" && pulledItem.old_value && pulledItem.old_value.id) {
          emoteId = pulledItem.old_value.id;
          emoteName = pulledItem.old_value.name || pulledItem.old_value.data?.name;
          emoteOwner = pulledItem.old_value.data?.owner;
        }

        if (emoteId) {
          if (!emoteName) {
            if (isPersonalSetUpdated) {
              const emote = personalEmotes.find((emote) => emote.id === emoteId);
              emoteName = emote?.name;
              emoteOwner = emote?.owner;
            } else {
              const emote = emotes.find((emote) => emote.id === emoteId);
              emoteName = emote?.name;
              emoteOwner = emote?.owner;
            }
          }

          if (emoteName && !isPersonalSetUpdated) {
            removedEmotes.push({ id: emoteId, name: emoteName, owner: emoteOwner });
          }

          if (isPersonalSetUpdated) {
            personalEmotes = personalEmotes.filter((emote) => emote.id !== emoteId);
          } else {
            emotes = emotes.filter((emote) => emote.id !== emoteId);
          }
        }
      });
    }

    if (pushed.length > 0) {
      pushed.forEach((pushedItem) => {
        const { value } = pushedItem;
        const emoteName = value.name ? value.name : value.data?.name;

        if (emoteName && !isPersonalSetUpdated) {
          addedEmotes.push({ id: value.id, name: emoteName, owner: value.data?.owner });
        }

        if (isPersonalSetUpdated) {
          const transformedEmote = {
            id: value.id,
            actor_id: value.actor_id,
            flags: value.data?.flags || 0,
            name: emoteName,
            alias: value.data?.name !== value.name ? value?.data?.name : null,
            owner: value.data?.owner,
            file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
            added_timestamp: value.timestamp || Date.now(),
            platform: "7tv",
            type: "personal",
          };

          // Remove any existing emote with the same ID first
          personalEmotes = personalEmotes.filter((emote) => emote.id !== value.id);
          // Then add the new/updated emote
          personalEmotes.push(transformedEmote);
        } else {
          // Remove any existing emote with the same ID first
          emotes = emotes.filter((emote) => emote.id !== value.id);
          // Then add the new emote
          emotes.push({
            id: value.id,
            actor_id: value.actor_id,
            flags: value.data?.flags || 0,
            name: emoteName,
            alias: value.data?.name !== value.name ? value?.data?.name : null,
            owner: value.data?.owner,
            file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
            added_timestamp: value.timestamp || Date.now(),
            platform: "7tv",
          });
        }
      });
    }

    if (updated.length > 0) {
      updated.forEach((emote) => {
        const { old_value, value } = emote;
        if (!old_value?.id || !value?.id) return;

        const oldName = old_value.name || old_value.data?.name;
        const newName = value.name ? value.name : value.data?.name;

        if (oldName && newName && oldName !== newName && !isPersonalSetUpdated) {
          updatedEmotes.push({
            id: old_value.id,
            oldName,
            newName,
            oldOwner: old_value.data?.owner,
            newOwner: value.data?.owner,
          });
        }

        if (isPersonalSetUpdated) {
          personalEmotes = personalEmotes.filter((e) => e.id !== old_value.id);

          const transformedEmote = {
            id: value.id,
            actor_id: value.actor_id,
            flags: value.data?.flags || 0,
            name: newName,
            alias: value.data?.name !== value.name ? value?.data?.name : null,
            owner: value.data?.owner,
            file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
            added_timestamp: value.timestamp || Date.now(),
            platform: "7tv",
            type: "personal",
          };

          personalEmotes.push(transformedEmote);
        } else {
          emotes = emotes.filter((e) => e.id !== old_value.id);

          emotes.push({
            id: value.id,
            actor_id: value.actor_id,
            flags: value.data?.flags || 0,
            name: newName,
            alias: value.data?.name !== value.name ? value?.data?.name : null,
            owner: value.data?.owner,
            file: value.data?.host.files?.[0] || value.data?.host.files?.[1],
            platform: "7tv",
          });
        }
      });
    }

    personalEmotes.sort((a, b) => a.name.localeCompare(b.name));
    emotes.sort((a, b) => a.name.localeCompare(b.name));

    // Send emote update data to frontend for custom handling
    if (addedEmotes.length > 0 || removedEmotes.length > 0 || updatedEmotes.length > 0) {
      const setInfo = isPersonalSetUpdated ? personalSetBeingUpdated?.setInfo : channelEmoteSet?.setInfo;

      if (body?.actor) {
        get().addMessage(chatroomId, {
          id: crypto.randomUUID(),
          type: "stvEmoteSetUpdate",
          timestamp: new Date().toISOString(),
          data: {
            setType: isPersonalSetUpdated ? "personal" : "channel",
            setName: setInfo?.name || (isPersonalSetUpdated ? "Personal" : "Channel"),
            typeOfUpdate: addedEmotes.length > 0 ? "added" : removedEmotes.length > 0 ? "removed" : "updated",
            setId: body.id,
            authoredBy: body?.actor || null,
            added: addedEmotes,
            removed: removedEmotes,
            updated: updatedEmotes,
          },
        });
      }
    }

    // Update personal emote sets if this was a personal set update
    if (isPersonalSetUpdated) {
      const updatedPersonalSets = personalEmoteSets.map((set) => {
        if (body.id === set.setInfo?.id) {
          return {
            ...set,
            emotes: personalEmotes,
          };
        }
        return set;
      });

      set({ personalEmoteSets: [...updatedPersonalSets] });
      localStorage.setItem("stvPersonalEmoteSets", JSON.stringify([...updatedPersonalSets]));
      return; // Don't update channel emotes if this was a personal set update
    }

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

  // Add function to get highlighted messages for a chatroom
  getHighlightedMessages: (chatroomId) => {
    return get().highlightedMessages[chatroomId] || [];
  },

  // Add function to clear highlighted messages for a chatroom
  clearHighlightedMessages: (chatroomId) => {
    set((state) => ({
      highlightedMessages: {
        ...state.highlightedMessages,
        [chatroomId]: [],
      },
    }));
  },

  // Add a mention to the mentions
  addMention: (chatroomId, message, type) => {
    const mention = {
      id: crypto.randomUUID(),
      messageId: message.id,
      chatroomId,
      message: {
        id: message.id,
        content: message.content,
        sender: message.sender,
        created_at: message.created_at || message.timestamp,
        metadata: message.metadata,
      },
      chatroomInfo: (() => {
        const chatroom = get().chatrooms.find((room) => room.id === chatroomId);
        return {
          slug: chatroom?.slug,
          displayName: chatroom?.displayName || chatroom?.username,
          streamerUsername: chatroom?.streamerData?.user?.username,
        };
      })(),
      type, // reply highlight or regular message highlight
      timestamp: new Date().toISOString(),
      isRead: false,
    };

    set((state) => {
      let updatedMentions = [...(state.mentions[chatroomId] || []), mention];

      // Limit mentions to prevent memory leak (keep most recent 200)
      if (updatedMentions.length > 200) {
        updatedMentions = updatedMentions.slice(-200);
      }

      return {
        mentions: {
          ...state.mentions,
          [chatroomId]: updatedMentions,
        },
      };
    });

    console.log(`[Mentions]: Added ${type} mention for chatroom ${chatroomId}:`, mention);
  },

  // Get all mentions across all chatrooms
  getAllMentions: () => {
    const mentions = get().mentions;
    const allMentions = [];

    Object.keys(mentions).forEach((chatroomId) => {
      allMentions.push(...mentions[chatroomId]);
    });

    // Sort by timestamp, newest first
    return allMentions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  // Get mentions for a specific chatroom
  getChatroomMentions: (chatroomId) => {
    return get().mentions[chatroomId] || [];
  },

  // Get unread mention count
  getUnreadMentionCount: () => {
    const allMentions = get().getAllMentions();
    return allMentions.filter((mention) => !mention.isRead).length;
  },

  // Get unread mention count for specific chatroom
  getChatroomUnreadMentionCount: (chatroomId) => {
    const mentions = get().getChatroomMentions(chatroomId);
    return mentions.filter((mention) => !mention.isRead).length;
  },

  // Mark mention as read
  markMentionAsRead: (mentionId) => {
    set((state) => {
      const newMentions = { ...state.mentions };

      Object.keys(newMentions).forEach((chatroomId) => {
        newMentions[chatroomId] = newMentions[chatroomId].map((mention) =>
          mention.id === mentionId ? { ...mention, isRead: true } : mention,
        );
      });

      return { mentions: newMentions };
    });
  },

  // Mark all mentions as read
  markAllMentionsAsRead: () => {
    set((state) => {
      const newMentions = { ...state.mentions };

      Object.keys(newMentions).forEach((chatroomId) => {
        newMentions[chatroomId] = newMentions[chatroomId].map((mention) => ({ ...mention, isRead: true }));
      });

      return { mentions: newMentions };
    });
  },

  // Mark all mentions in a chatroom as read
  markChatroomMentionsAsRead: (chatroomId) => {
    set((state) => ({
      mentions: {
        ...state.mentions,
        [chatroomId]: (state.mentions[chatroomId] || []).map((mention) => ({ ...mention, isRead: true })),
      },
    }));
  },

  // Clear all mentions
  clearAllMentions: () => {
    set({ mentions: {} });
  },

  // Clear mentions for a specific chatroom
  clearChatroomMentions: (chatroomId) => {
    set((state) => {
      const { [chatroomId]: _, ...remainingMentions } = state.mentions;
      return { mentions: remainingMentions };
    });
  },

  // Delete a specific mention
  deleteMention: (mentionId) => {
    set((state) => {
      const newMentions = { ...state.mentions };

      Object.keys(newMentions).forEach((chatroomId) => {
        newMentions[chatroomId] = newMentions[chatroomId].filter((mention) => mention.id !== mentionId);
      });

      return { mentions: newMentions };
    });
  },

  // Mark all messages in a chatroom as read
  markChatroomMessagesAsRead: (chatroomId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatroomId]: (state.messages[chatroomId] || []).map((message) => ({
          ...message,
          isRead: true,
        })),
      },
    }));
  },

  // Get unread message count for a chatroom
  getUnreadMessageCount: (chatroomId) => {
    const messages = get().messages[chatroomId] || [];
    return messages.filter((message) => !message.isRead && message.type !== "system").length;
  },

  // Set the current active chatroom
  setCurrentChatroom: (chatroomId) => {
    set({ currentChatroomId: chatroomId });
  },

  // Mentions Tab Management
  addMentionsTab: () => {
    if (get().hasMentionsTab) return;
    set({ hasMentionsTab: true });
    localStorage.setItem("hasMentionsTab", "true");
  },

  removeMentionsTab: () => {
    set({ hasMentionsTab: false });
    localStorage.setItem("hasMentionsTab", "false");
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
      console.log("[7tv Presence]: No 7TV ID found, skipping presence update checks");
      setTimeout(() => {
        storeStvId = localStorage.getItem("stvId");
        const authTokens = window.app.auth.getToken();

        if (storeStvId && authTokens?.token && authTokens?.session) {
          initializePresenceUpdates();
        } else {
          console.log("[7tv Presence]: No STV ID or auth tokens found after delay");
        }
      }, 8 * 1000); // 8 seconds delay

      return;
    }

    // Check for auth tokens before starting presence updates
    const authTokens = window.app.auth.getToken();
    if (!authTokens?.token || !authTokens?.session) {
      console.log("[7tv Presence]: No auth tokens available, skipping presence update initialization");
      return;
    }

    // Send presence updates every 2 minutes
    console.log("[7tv Presence]: Initializing presence update checks");
    presenceUpdatesInterval = setInterval(
      () => {
        const chatrooms = useChatStore.getState()?.chatrooms;
        if (chatrooms?.length === 0) return;

        chatrooms.forEach((chatroom) => {
          console.log("[7tv Presence]: Sending presence check for chatroom:", chatroom.streamerData.user_id);
          useChatStore.getState().sendPresenceUpdate(storeStvId, chatroom.streamerData.user_id);
        });
      },
      1 * 60 * 1000,
    );

    return () => {
      if (presenceUpdatesInterval) {
        console.log("[7tv Presence]: Clearing presence update checks");
        clearInterval(presenceUpdatesInterval);
      }
    };
  };

  initializePresenceUpdates();

  let donationBadgesInterval = null;

  // Initialize donation badge fetch every 30 minutes
  const initializeDonationBadges = () => {
    if (donationBadgesInterval) {
      clearInterval(donationBadgesInterval);
    }

    donationBadgesInterval = setInterval(useChatStore.getState().fetchDonators, 15 * 60 * 1000);
  };

  initializeDonationBadges();

  // Initialize periodic cleanup interval for memory management
  if (!memoryCleanupInterval) {
    memoryCleanupInterval = setInterval(
      () => {
        useChatStore.getState().performPeriodicCleanup();
      },
      10 * 60 * 1000,
    ); // Run cleanup every 10 minutes
    console.log("[ChatProvider] Initialized periodic memory cleanup");
  }

  // Cleanup when window is about to unload
  window.addEventListener("beforeunload", () => {
    useChatStore.getState().cleanupBatching();

    if (presenceUpdatesInterval) {
      clearInterval(presenceUpdatesInterval);
    }

    if (donationBadgesInterval) {
      clearInterval(donationBadgesInterval);
    }

    if (memoryCleanupInterval) {
      clearInterval(memoryCleanupInterval);
    }
  });
}

// Expose debug functions globally in development
if (process.env.NODE_ENV === "development") {
  window.debugKickTalk = {
    toggleStreamStatus: (chatroomId, isLive) => {
      useChatStore.getState().debugToggleStreamStatus(chatroomId, isLive);
    },
    getChatrooms: () => {
      return useChatStore.getState().chatrooms.map((room) => ({
        id: room.id,
        username: room.username,
        isLive: room.isStreamerLive,
      }));
    },
    getConnectionStatus: () => {
      return useChatStore.getState().getConnectionStatus();
    },
  };
}

// Cleanup component to handle unmounting
export const ChatProviderCleanup = () => {
  useEffect(() => {
    return () => useChatStore.getState().cleanupBatching();
  }, []);

  return null;
};

export default useChatStore;
