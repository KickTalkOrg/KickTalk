import { useEffect } from "react";
import { create } from "zustand";
import KickPusher from "@utils/services/kick/kickPusher";
import { chatroomErrorHandler } from "../utils/chatErrors";
import queueChannelFetch from "@utils/fetchQueue";
import StvWebSocket from "@utils/services/seventv/stvWebsocket";
import ConnectionManager from "@utils/services/connectionManager";
import useCosmeticsStore from "./CosmeticsProvider";
import { sendUserPresence } from "@utils/services/seventv/stvAPI";
import { getKickTalkDonators } from "@utils/services/kick/kickAPI";
import { DEFAULT_CHAT_HISTORY_LENGTH } from "@utils/constants";
import { clearChatroomEmoteCache } from "../utils/MessageParser";
import dayjs from "dayjs";

// Renderer tracing helpers (no direct imports to avoid ESM/CSP issues)
const getRendererTracer = () =>
  (typeof window !== 'undefined' && (window.__KT_TRACER__ || window.__KT_TRACE_API__?.trace?.getTracer?.('kicktalk-renderer'))) || null;

const startSpan = (name, attributes = {}) => {
  try {
    const tracer = getRendererTracer();
    if (!tracer || typeof tracer.startSpan !== 'function') return null;
    const span = tracer.startSpan(name);
    try {
      if (span && attributes && typeof attributes === 'object') {
        Object.entries(attributes).forEach(([k, v]) => {
          try { span.setAttribute(k, v); } catch {}
        });
      }
    } catch {}
    return span;
  } catch {
    return null;
  }
};

const endSpanOk = (span) => {
  try { span?.setStatus?.({ code: 0 }); } catch {}
  try { span?.end?.(); } catch {}
};

const endSpanError = (span, err) => {
  try { span?.setStatus?.({ code: 2, message: (err && (err.message || String(err))) || '' }); } catch {}
  try { span?.end?.(); } catch {}
};

// Lightweight renderer health reporter (behind telemetry.enabled)
const startRendererHealthReporting = (intervalMs = 30000) => {
  let timer = null;

  const getMemory = () => {
    try {
      // Chromium exposes performance.memory in some builds
      // Fall back to zeros if unavailable
      const mem = performance && performance.memory ? performance.memory : null;
      return {
        jsHeapUsedSize: mem?.usedJSHeapSize || 0,
        jsHeapTotalSize: mem?.totalJSHeapSize || 0
      };
    } catch {
      return { jsHeapUsedSize: 0, jsHeapTotalSize: 0 };
    }
  };

  const getDomNodeCount = () => {
    try {
      return document.querySelectorAll("*").length;
    } catch {
      return 0;
    }
  };

  const tick = async () => {
    try {
      const mem = getMemory();
      const dom = getDomNodeCount();
      // Send via preload IPC -> main (main will gate via isTelemetryEnabled)
      await window.app?.telemetry?.recordRendererMemory?.(mem);
      await window.app?.telemetry?.recordDomNodeCount?.(dom);
    } catch {
      // no-op
    }
  };

  // Start immediately then on interval
  tick();
  timer = setInterval(tick, intervalMs);

  return () => {
    if (timer) clearInterval(timer);
  };
};

// Migration constants
const STORAGE_VERSION = 2;

// Detect corrupted chatroom data
const detectCorruptedChatroomData = (chatroom) => {
  // Case 1: channel7TVEmotes is an object instead of array (Scenario 1)
  if (chatroom?.channel7TVEmotes && !Array.isArray(chatroom.channel7TVEmotes)) {
    return "object_instead_of_array";
  }
  
  // Case 2: Missing essential streamerData fields (Scenarios 3 & 4)  
  if (!chatroom?.streamerData?.id || 
      !chatroom?.streamerData?.user_id ||
      !chatroom?.streamerData?.user?.username) {
    return "missing_streamer_data";
  }
  
  // Case 3: Old structure with user at wrong level (Scenario 2)
  // Check if we have an array but the channel set is missing user data
  if (Array.isArray(chatroom.channel7TVEmotes)) {
    const channelSet = chatroom.channel7TVEmotes.find(set => set.type === "channel");
    if (channelSet && !channelSet.user) {
      return "wrong_user_nesting";
    }
  }
  
  return null; // No corruption detected
};

// Clean corrupted chatroom data
const cleanCorruptedChatroom = (chatroom, corruptionType) => {
  console.log(`[Migration] Auto-fixing corrupted data for chatroom ${chatroom.id} (${chatroom.username || 'unknown'}): ${corruptionType}`);
  
  const cleaned = { ...chatroom };
  
  // Always clear corrupted emote data to force fresh fetch
  if (cleaned.channel7TVEmotes) {
    delete cleaned.channel7TVEmotes;
    delete cleaned.last7TVSetUpdated;
  }
  
  // For missing streamer data, we can't recover - this chatroom needs to be removed
  if (corruptionType === "missing_streamer_data") {
    console.log(`[Migration] Chatroom ${chatroom.id} has unrecoverable corruption, will be removed`);
    return null; // Signal for removal
  }
  
  return cleaned;
};

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

// Helper functions for optimistic messaging
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const createOptimisticMessage = (chatroomId, content, sender) => {
  // Try to find user's identity color from existing messages
  const store = useChatStore.getState();
  const existingMessages = store.messages[chatroomId] || [];
  const userMessage = existingMessages.find(msg => 
    msg.sender?.id === sender?.id && 
    msg.sender?.identity?.color
  );

  const enhancedSender = {
    ...sender,
    identity: userMessage?.sender?.identity || sender?.identity || {
      color: null // Will use CSS default text color for theme compatibility
    }
  };

  return {
    id: generateTempId(),
    tempId: generateTempId(), // Separate temp ID for tracking
    content: content.trim(),
    type: "message",
    chatroom_id: chatroomId,
    sender: enhancedSender,
    created_at: new Date().toISOString(),
    state: MESSAGE_STATES.OPTIMISTIC,
    isOptimistic: true,
  };
};

const createOptimisticReply = (chatroomId, content, sender, metadata) => {
  // Try to find user's identity color from existing messages
  const store = useChatStore.getState();
  const existingMessages = store.messages[chatroomId] || [];
  const userMessage = existingMessages.find(msg => 
    msg.sender?.id === sender?.id && 
    msg.sender?.identity?.color
  );

  const enhancedSender = {
    ...sender,
    identity: userMessage?.sender?.identity || sender?.identity || {
      color: null // Will use CSS default text color for theme compatibility
    }
  };

  return {
    id: generateTempId(),
    tempId: generateTempId(), // Separate temp ID for tracking
    content: content.trim(),
    type: "reply",
    chatroom_id: chatroomId,
    sender: enhancedSender,
    created_at: new Date().toISOString(),
    metadata,
    state: MESSAGE_STATES.OPTIMISTIC,
    isOptimistic: true,
  };
};

// Load initial state from local storage
const getInitialState = () => {
  let savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
  const currentVersion = parseInt(localStorage.getItem("chatrooms_version") || "1");
  
  console.log(`[Migration] Current version: ${currentVersion}, Target version: ${STORAGE_VERSION}`);
  console.log(`[Migration] Loaded ${savedChatrooms.length} chatrooms from localStorage`);
  
  // Run migration if needed
  if (currentVersion < STORAGE_VERSION) {
    console.log(`[Migration] Running migration from version ${currentVersion} to ${STORAGE_VERSION}`);
    
    let migrationStats = {
      total: savedChatrooms.length,
      fixed: 0,
      removed: 0,
      corrupted: 0
    };
    
    // Process each chatroom for corruption
    const migratedChatrooms = [];
    
    for (const chatroom of savedChatrooms) {
      console.log(`[Migration] Checking chatroom ${chatroom.id} (${chatroom.username}):`, {
        hasChannel7TVEmotes: !!chatroom.channel7TVEmotes,
        isArray: Array.isArray(chatroom.channel7TVEmotes),
        type: typeof chatroom.channel7TVEmotes,
        hasStreamerData: !!chatroom.streamerData,
        hasStreamerId: !!chatroom.streamerData?.id,
        streamerDataStructure: chatroom.streamerData,
        hasUserObject: !!chatroom.streamerData?.user,
        hasUsername: !!chatroom.streamerData?.user?.username
      });
      
      const corruptionType = detectCorruptedChatroomData(chatroom);
      console.log(`[Migration] Corruption detection result for ${chatroom.id}: ${corruptionType || 'CLEAN'}`);
      
      if (corruptionType) {
        migrationStats.corrupted++;
        console.log(`[Migration] Found corruption in chatroom ${chatroom.id}: ${corruptionType}`);
        
        const cleaned = cleanCorruptedChatroom(chatroom, corruptionType);
        
        if (cleaned === null) {
          // Chatroom was too corrupted to recover
          migrationStats.removed++;
          console.log(`[Migration] Removed unrecoverable chatroom ${chatroom.id}`);
        } else {
          // Chatroom was cleaned successfully
          migrationStats.fixed++;
          migratedChatrooms.push(cleaned);
        }
      } else {
        // Chatroom is clean, keep as-is
        migratedChatrooms.push(chatroom);
      }
    }
    
    // Save migrated data
    savedChatrooms = migratedChatrooms;
    localStorage.setItem("chatrooms", JSON.stringify(savedChatrooms));
    localStorage.setItem("chatrooms_version", STORAGE_VERSION.toString());
    
    console.log(`[Migration] Migration completed:`, migrationStats);
    
    if (migrationStats.corrupted > 0) {
      console.log(`[Migration] ✅ Fixed ${migrationStats.fixed} chatrooms, removed ${migrationStats.removed} unrecoverable chatrooms`);
    }
  }
  
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
    chatHistorySettings: { // Default chat history settings
      chatHistoryLength: DEFAULT_CHAT_HISTORY_LENGTH
    },
    draftMessages: new Map(), // Store draft messages per chatroom
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

  // Clean up connection manager
  cleanupConnections: () => {
    console.log("[ChatProvider] Cleaning up connections...");

    // Reset initialization flag
    initializationInProgress = false;

    // Clean up batching
    get().cleanupBatching();

    // Clean up connection manager
    if (connectionManager) {
      connectionManager.cleanup();
      connectionManager = null;
    }

    // Clean up individual connections (fallback)
    const connections = get().connections;
    Object.keys(connections).forEach(chatroomId => {
      const connection = connections[chatroomId];
      if (connection?.kickPusher) {
        connection.kickPusher.close();
      }
      if (connection?.stvSocket) {
        connection.stvSocket.close();
      }
    });

    // Clear connections state
    set({ connections: {} });

    console.log("[ChatProvider] Connections cleaned up");
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

  // Debug function to check 7TV WebSocket status
  get7TVStatus: () => {
    const connections = get().connections;
    const chatrooms = get().chatrooms;
    
    // Check if using shared connection manager
    if (connectionManager) {
      const span = startSpan('seventv.connection_health_check', {
        'chatrooms.count': chatrooms.length,
        'connections.count': Object.keys(connections).length
      });
      
      try {
        // Record connection health metrics via IPC
        window.app?.telemetry?.recordSevenTVConnectionHealth?.(
          chatrooms.length,
          Object.keys(connections).length,
          'connected'
        );
        endSpanOk(span);
      } catch (error) {
        endSpanError(span, error);
      }
    }
    
    return { chatrooms: chatrooms.length, connections: Object.keys(connections).length };
  },

  // Debug function to toggle livestream status for testing
  debugToggleStreamStatus: (chatroomId, isLive) => {
    console.log(`[DEBUG] Toggling stream status for chatroom ${chatroomId}: ${isLive ? 'LIVE' : 'OFFLINE'}`);
    const mockEvent = {
      livestream: {
        id: Math.random().toString(),
        is_live: isLive,
        session_title: "Mock Stream Title",
        created_at: new Date().toISOString(),
      }
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
    const opSpan = startSpan('chat.send', {
      'chat.id': chatroomId,
      'message.length': (content || '').trim().length
    });
    const startTime = Date.now();
    const chatroom = get().chatrooms.find(room => room.id === chatroomId);
    const streamerName = chatroom?.streamerData?.user?.username || chatroom?.username || `chatroom_${chatroomId}`;
    try { opSpan?.setAttribute?.('streamer.name', streamerName); } catch {}
    console.log(`[Telemetry] sendMessage - chatroomId: ${chatroomId}, streamerName: ${streamerName}`);
    
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
      try {
        opSpan?.addEvent?.('optimistic.add', { 'message.temp_id': optimisticMessage.tempId });
      } catch {}

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
      const apiStartTime = Date.now();
      const url = `https://kick.com/api/v2/messages/send/${chatroomId}`;
      const apiSpan = startSpan('chat.api.sendMessage', {
        'http.request.method': 'POST',
        'server.address': 'kick.com',
        'server.port': 443,
        'url.full': url,
        'api.endpoint': 'kick_send_message'
      });
      let response;
      try {
        response = await window.app.kick.sendMessage(chatroomId, message);
        try { apiSpan?.setAttribute?.('http.response.status_code', response?.status || response?.data?.status?.code || 200); } catch {}
        endSpanOk(apiSpan);
      } catch (err) {
        endSpanError(apiSpan, err);
        throw err;
      }
      const apiDuration = (Date.now() - apiStartTime) / 1000;

      // Clear timeout if request completes (success or known failure)
      clearTimeout(timeoutId);

      // Record API request timing
      try {
        const statusCode = response?.status || response?.data?.status?.code || 200;
        await window.app?.telemetry?.recordAPIRequest?.('kick_send_message', 'POST', statusCode, apiDuration);
      } catch (telemetryError) {
        console.warn('[Telemetry]: Failed to record API request:', telemetryError);
      }

      if (response?.data?.status?.code === 401) {
        // Record auth failure
        const duration = (Date.now() - startTime) / 1000;
        window.app?.telemetry?.recordMessageSent(chatroomId, 'regular', duration, false, streamerName);
        
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

      // Record successful message send
      const duration = (Date.now() - startTime) / 1000;
      window.app?.telemetry?.recordMessageSent(chatroomId, 'regular', duration, true, streamerName);
      endSpanOk(opSpan);

      // Message sent successfully - it will be confirmed when we receive it back via WebSocket
      return true;
    } catch (error) {
      console.error('[Send Message]: Error sending message:', error);
      endSpanError(opSpan, error);

      // Record failed message send with error details
      const duration = (Date.now() - startTime) / 1000;
      window.app?.telemetry?.recordMessageSent(chatroomId, 'regular', duration, false, streamerName);
      window.app?.telemetry?.recordError(error, {
        'chatroom.id': chatroomId,
        'message.operation': 'send',
        'message.content_length': content?.length || 0
      });
      
      const errMsg = chatroomErrorHandler(error);

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
    const opSpan = startSpan('chat.reply', {
      'chat.id': chatroomId,
      'message.length': (content || '').trim().length
    });
    const startTime = Date.now();
    const chatroom = get().chatrooms.find(room => room.id === chatroomId);
    const streamerName = chatroom?.streamerData?.user?.username || chatroom?.username || `chatroom_${chatroomId}`;
    try { opSpan?.setAttribute?.('streamer.name', streamerName); } catch {}
    console.log(`[Telemetry] sendReply - chatroomId: ${chatroomId}, streamerName: ${streamerName}`);
    
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
      try { opSpan?.addEvent?.('optimistic.add', { 'message.temp_id': optimisticReply.tempId }); } catch {}

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
      const apiStartTime = Date.now();
      const url = `https://kick.com/api/v2/messages/send/${chatroomId}`;
      const apiSpan = startSpan('chat.api.sendReply', {
        'http.request.method': 'POST',
        'server.address': 'kick.com',
        'server.port': 443,
        'url.full': url,
        'api.endpoint': 'kick_send_reply'
      });
      let response;
      try {
        response = await window.app.kick.sendReply(chatroomId, message, metadata);
        try { apiSpan?.setAttribute?.('http.response.status_code', response?.status || response?.data?.status?.code || 200); } catch {}
        endSpanOk(apiSpan);
      } catch (err) {
        endSpanError(apiSpan, err);
        throw err;
      }
      const apiDuration = (Date.now() - apiStartTime) / 1000;

      // Clear timeout if request completes (success or known failure)
      clearTimeout(timeoutId);

      // Record API request timing
      try {
        const statusCode = response?.status || response?.data?.status?.code || 200;
        await window.app?.telemetry?.recordAPIRequest?.('kick_send_reply', 'POST', statusCode, apiDuration);
      } catch (telemetryError) {
        console.warn('[Telemetry]: Failed to record API request:', telemetryError);
      }

      if (response?.data?.status?.code === 401) {
        // Record auth failure for reply
        const duration = (Date.now() - startTime) / 1000;
        window.app?.telemetry?.recordMessageSent(chatroomId, 'reply', duration, false, streamerName);
        
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

      // Record successful reply send
      const duration = (Date.now() - startTime) / 1000;
      window.app?.telemetry?.recordMessageSent(chatroomId, 'reply', duration, true, streamerName);
      endSpanOk(opSpan);

      // Reply sent successfully - it will be confirmed when we receive it back via WebSocket
      return true;
    } catch (error) {
      console.error('[Send Reply]: Error sending reply:', error);
      endSpanError(opSpan, error);

      // Record failed reply send with error details
      const duration = (Date.now() - startTime) / 1000;
      window.app?.telemetry?.recordMessageSent(chatroomId, 'reply', duration, false, streamerName);
      window.app?.telemetry?.recordError(error, {
        'chatroom.id': chatroomId,
        'message.operation': 'reply',
        'message.content_length': content?.length || 0,
        'reply.original_message_id': metadata.original_message?.id
      });
      
      const errMsg = chatroomErrorHandler(error);

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
    const channelSet = chatroom?.channel7TVEmotes?.find((set) => set.type === "channel");
    const stvId = channelSet?.user?.id;
    const stvEmoteSets = channelSet?.setInfo?.id;

    const setupSpan = startSpan('seventv.websocket_setup', {
      'chatroom.id': chatroom.id,
      'streamer.name': chatroom.streamerData?.username || '',
      'seventv.user_id': stvId || '',
      'seventv.emote_set_id': stvEmoteSets || ''
    });

    try {
      // Record WebSocket connection creation
      window.app?.telemetry?.recordSevenTVWebSocketCreated?.(chatroom.id, stvId, stvEmoteSets);
    } catch (error) {
      console.warn('[Telemetry] Failed to record 7TV WebSocket setup:', error);
    }

    const existingConnection = get().connections[chatroom.id]?.stvSocket;
    if (existingConnection) {
      existingConnection.close();
    }

    try {
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

      const storeStvId = localStorage.getItem("stvId");

      stvSocket.addEventListener("open", () => {
        const s = startSpan('7tv.ws.connect', { 'chat.id': chatroom.id });
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
        endSpanOk(s);
      });

      stvSocket.addEventListener("close", () => {
        const s = startSpan('7tv.ws.close', { 'chat.id': chatroom.id });
        console.log("7TV WebSocket disconnected for chatroom:", chatroom.id);
        stvPresenceUpdates.delete(chatroom.streamerData.user_id);
        endSpanOk(s);
      });

      endSpanOk(setupSpan);
    } catch (error) {
      console.error("Failed to setup 7TV WebSocket:", error);
      endSpanError(setupSpan, error);
      throw error;
    }
  },

  connectToChatroom: async (chatroom) => {
    if (!chatroom?.id) return;
    const pusher = new KickPusher(chatroom.id, chatroom.streamerData.id, chatroom.streamerData?.user?.username);

    // Connection Events
    pusher.addEventListener("connection", (event) => {
      const s = startSpan('kick.ws.connect', { 'chat.id': chatroom.id });
      console.info("Connected to chatroom:", chatroom.id);
      get().addMessage(chatroom.id, {
        id: crypto.randomUUID(),
        type: "system",
        ...event?.detail,
        timestamp: new Date().toISOString(),
      });
      endSpanOk(s);
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
            chatrooms.forEach(chatroom => {
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
        console.log(`  - WebSocket connections: ${chatrooms.length * 2} → 2 (${((chatrooms.length * 2 - 2) / (chatrooms.length * 2) * 100).toFixed(1)}% reduction)`);
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
          get().addMessage(chatroomId, messageWithTimestamp);

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
      chatrooms.forEach(chatroomId => {
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

      // Get chat history settings with fallbacks
      const chatHistoryLength = state.chatHistorySettings?.chatHistoryLength || DEFAULT_CHAT_HISTORY_LENGTH;
      
      // Calculate limits: normal = base, paused = 2x, trim = 1.5x
      const normalLimit = chatHistoryLength;
      const pausedLimit = chatHistoryLength * 2;
      const pausedTrimTo = Math.floor(chatHistoryLength * 1.5);

      // Keep a configurable window of messages based on pause state
      if (state.isChatroomPaused?.[chatroomId] && updatedMessages.length > pausedLimit) {
        updatedMessages = updatedMessages.slice(-pausedTrimTo);
      } else if (!state.isChatroomPaused?.[chatroomId] && updatedMessages.length > normalLimit) {
        updatedMessages = updatedMessages.slice(-normalLimit);
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
      if (chatters?.some((c) => c.id === chatter.id)) {
        return state;
      }

      return {
        chatters: {
          ...state.chatters,
          [chatroomId]: [...(state.chatters[chatroomId] || []), chatter],
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
          chatroom.username.toLowerCase() === username.replaceAll("-", "_")
      );

      if (isDuplicate) {
        return { error: "DUPLICATE", message: `Chatroom "${username}" is already added` };
      }

      if (savedChatrooms.length >= 20) {
        return { error: "LIMIT_REACHED", message: "Maximum of 20 chatrooms allowed" };
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

  updateChatHistorySettings: (settings) => {
    set((state) => ({
      chatHistorySettings: { ...state.chatHistorySettings, ...settings },
    }));
  },

  handleEmoteSetUpdate: (chatroomId, body) => {
    const updateSpan = startSpan('seventv.emote_set_update', {
      'chatroom.id': chatroomId
    });
    
    const startTime = performance.now();
    
    if (!body) {
      updateSpan?.addEvent?.('empty_body_received');
      endSpanOk(updateSpan);
      return;
    }

    const { pulled = [], pushed = [], updated = [] } = body;
    
    updateSpan?.setAttributes?.({
      'emotes.pulled.count': pulled.length,
      'emotes.pushed.count': pushed.length,
      'emotes.updated.count': updated.length
    });

    const chatroom = get().chatrooms.find((room) => room.id === chatroomId);
    if (!chatroom) {
      return;
    }

    const channelEmoteSet = Array.isArray(chatroom.channel7TVEmotes)
      ? chatroom.channel7TVEmotes.find((set) => set.type === "channel")
      : null;

    const personalEmoteSets = get().personalEmoteSets;

    // Check if we have either channel emotes OR this is a personal set update
    const isPersonalSetUpdate = personalEmoteSets?.some((set) => body.id === set.setInfo?.id);
    
    if (!channelEmoteSet?.emotes && !isPersonalSetUpdate) {
      return;
    }

    let emotes = channelEmoteSet.emotes || [];
    const isPersonalSetUpdated = isPersonalSetUpdate;

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

    personalEmotes = [...personalEmotes].sort((a, b) => a.name.localeCompare(b.name));
    emotes = [...emotes].sort((a, b) => a.name.localeCompare(b.name));


    // Send emote update data to frontend for custom handling
    if (addedEmotes.length > 0 || removedEmotes.length > 0 || updatedEmotes.length > 0) {
      try {
        // Record specific emote change metrics
        window.app?.telemetry?.recordSevenTVEmoteChanges?.(
          chatroomId,
          addedEmotes.length,
          removedEmotes.length,
          updatedEmotes.length,
          isPersonalSetUpdated ? 'personal' : 'channel'
        );
        
        updateSpan?.addEvent?.('emote_changes_detected', {
          'emotes.added': addedEmotes.length,
          'emotes.removed': removedEmotes.length,
          'emotes.updated': updatedEmotes.length,
          'set.type': isPersonalSetUpdated ? 'personal' : 'channel'
        });
      } catch (error) {
        console.warn('[Telemetry] Failed to record emote changes:', error);
      }
      
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

    // Clear emote cache to ensure new emotes are loaded from updated store
    clearChatroomEmoteCache(chatroomId);
    
    // Refresh emote data to get the updated emote set
    get().refresh7TVEmotes(chatroomId);
    
    try {
      const processingDuration = performance.now() - startTime;
      // Record emote update metrics via IPC
      window.app?.telemetry?.recordSevenTVEmoteUpdate?.(
        chatroomId,
        pulled.length,
        pushed.length, 
        updated.length,
        processingDuration
      );
      
      updateSpan?.addEvent?.('emote_update_completed');
      updateSpan?.setAttribute?.('processing.duration_ms', processingDuration);
      endSpanOk(updateSpan);
    } catch (error) {
      console.warn('[Telemetry] Failed to record 7TV emote update:', error);
      endSpanError(updateSpan, error);
    }
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

        // Clear emote cache to ensure refreshed emotes are loaded
        clearChatroomEmoteCache(chatroomId);

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

    set((state) => ({
      mentions: {
        ...state.mentions,
        [chatroomId]: [...(state.mentions[chatroomId] || []), mention],
      },
    }));

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
    return [...allMentions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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

  // Draft message management
  saveDraftMessage: (chatroomId, content) => {
    set((state) => {
      const newDraftMessages = new Map(state.draftMessages);
      if (content.trim()) {
        newDraftMessages.set(chatroomId, content);
      } else {
        newDraftMessages.delete(chatroomId);
      }
      return { draftMessages: newDraftMessages };
    });
  },

  getDraftMessage: (chatroomId) => {
    return get().draftMessages.get(chatroomId) || '';
  },

  clearDraftMessage: (chatroomId) => {
    set((state) => {
      const newDraftMessages = new Map(state.draftMessages);
      newDraftMessages.delete(chatroomId);
      return { draftMessages: newDraftMessages };
    });
  },
}));

if (window.location.pathname === "/" || window.location.pathname.endsWith("index.html")) {
  // Initialize connections when the store is created
  useChatStore.getState().initializeConnections();

  // Renderer telemetry health reporter (gated by settings.telemetry.enabled)
  (async () => {
    try {
      const settings = await window.app?.store?.get?.('settings');
      const enabled = !!settings?.telemetry?.enabled;
      if (enabled) {
        const stop = startRendererHealthReporting(30000);
        // Stop reporter on unload
        window.addEventListener('beforeunload', () => {
          try { stop && stop(); } catch {}
        });
      }
      // React to settings changes
      window.app?.store?.onUpdate?.((data) => {
        if (data && Object.prototype.hasOwnProperty.call(data, 'settings')) {
          (async () => {
            const s = await window.app?.store?.get?.('settings');
            const en = !!s?.telemetry?.enabled;
            if (!en) {
              // forcing a reload will clear intervals if previously enabled
              // or we could track stop handle in closure; keeping simple here
            }
          })();
        }
      });
    } catch {}
  })();

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

  // Poll livestream status for all chatrooms to catch missed updates
  let liveStatusInterval = null;

  const initializeLiveStatusPolling = () => {
    if (liveStatusInterval) {
      clearInterval(liveStatusInterval);
    }

    liveStatusInterval = setInterval(async () => {
      const chatrooms = useChatStore.getState()?.chatrooms;
      if (chatrooms?.length === 0) return;

      for (const room of chatrooms) {
        try {
          const response = await window.app.kick.getChannelChatroomInfo(room.streamerData?.slug);
          const isLive = !!response?.data?.livestream?.is_live;
          if (isLive !== room.isStreamerLive) {
            useChatStore.getState().handleStreamStatus(room.id, response.data, isLive);
          }
        } catch (error) {
          console.error("[Live Status Poll]:", error);
        }
      }
    }, 60 * 1000);
  };

  initializeLiveStatusPolling();

  // Cleanup when window is about to unload
  window.addEventListener("beforeunload", () => {
    useChatStore.getState().cleanupBatching();

    if (presenceUpdatesInterval) {
      clearInterval(presenceUpdatesInterval);
    }

    if (donationBadgesInterval) {
      clearInterval(donationBadgesInterval);
    }

    if (liveStatusInterval) {
      clearInterval(liveStatusInterval);
    }
  });
}

// Expose debug functions globally in development
if (process.env.NODE_ENV === 'development') {
  window.debugKickTalk = {
    toggleStreamStatus: (chatroomId, isLive) => {
      useChatStore.getState().debugToggleStreamStatus(chatroomId, isLive);
    },
    getChatrooms: () => {
      return useChatStore.getState().chatrooms.map(room => ({
        id: room.id,
        username: room.username,
        isLive: room.isStreamerLive
      }));
    },
    getConnectionStatus: () => {
      return useChatStore.getState().getConnectionStatus();
    },
    get7TVStatus: () => {
      return useChatStore.getState().get7TVStatus();
    }
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
