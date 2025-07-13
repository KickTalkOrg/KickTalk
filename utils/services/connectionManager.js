import SharedKickPusher from "./kick/sharedKickPusher.js";
import SharedStvWebSocket from "./seventv/sharedStvWebSocket.js";

class ConnectionManager {
  constructor() {
    this.kickPusher = new SharedKickPusher();
    this.stvWebSocket = new SharedStvWebSocket();
    this.initializationInProgress = false;
    this.emoteCache = new Map(); // Cache for global/common emotes
    this.globalStvEmotesCache = null; // Cache for global 7TV emotes

    // Callbacks to avoid circular imports
    this.storeCallbacks = null;

    // Connection configuration
    this.config = {
      staggerDelay: 200, // ms between batches
      batchSize: 3, // chatrooms per batch
      maxConcurrentEmoteFetches: 5,
    };
  }

  async initializeConnections(chatrooms, eventHandlers = {}, storeCallbacks = {}) {
    if (this.initializationInProgress) {
      console.log("[ConnectionManager] Initialization already in progress");
      return;
    }

    this.initializationInProgress = true;
    this.storeCallbacks = storeCallbacks;
    console.log(`[ConnectionManager] Starting optimized initialization for ${chatrooms.length} chatrooms`);

    try {
      // Set up event handlers
      this.setupEventHandlers(eventHandlers);

      // Start shared connections
      await this.startSharedConnections();

      // Initialize chatrooms in staggered batches
      await this.initializeChatroomsInBatches(chatrooms);

      // Batch fetch emotes
      await this.batchFetchEmotes(chatrooms);

      console.log("[ConnectionManager] Initialization completed successfully");
    } catch (error) {
      console.error("[ConnectionManager] Error during initialization:", error);
      throw error;
    } finally {
      this.initializationInProgress = false;
    }
  }

  setupEventHandlers(handlers) {
    // Set up KickPusher event handlers
    if (handlers.onKickMessage) {
      this.kickPusher.addEventListener("message", handlers.onKickMessage);
    }
    if (handlers.onKickChannel) {
      this.kickPusher.addEventListener("channel", handlers.onKickChannel);
    }
    if (handlers.onKickConnection) {
      this.kickPusher.addEventListener("connection", handlers.onKickConnection);
    }
    if (handlers.onKickSubscriptionSuccess) {
      this.kickPusher.addEventListener("subscription_success", handlers.onKickSubscriptionSuccess);
    }

    // Set up 7TV event handlers
    if (handlers.onStvMessage) {
      this.stvWebSocket.addEventListener("message", handlers.onStvMessage);
    }
    if (handlers.onStvOpen) {
      this.stvWebSocket.addEventListener("open", handlers.onStvOpen);
    }
    if (handlers.onStvConnection) {
      this.stvWebSocket.addEventListener("connection", handlers.onStvConnection);
    }
  }

  async startSharedConnections() {
    console.log("[ConnectionManager] Starting shared connections...");

    // Start both connections in parallel
    const kickPromise = new Promise((resolve) => {
      const onConnection = (event) => {
        if (event.detail.content === "connection-success") {
          this.kickPusher.removeEventListener("connection", onConnection);
          resolve();
        }
      };
      this.kickPusher.addEventListener("connection", onConnection);
      this.kickPusher.connect();
    });

    const stvPromise = new Promise((resolve) => {
      const onConnection = (event) => {
        if (event.detail.content === "connection-success") {
          this.stvWebSocket.removeEventListener("connection", onConnection);
          resolve();
        }
      };
      this.stvWebSocket.addEventListener("connection", onConnection);
      this.stvWebSocket.connect();
    });

    // Wait for both connections with timeout
    await Promise.race([
      Promise.all([kickPromise, stvPromise]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 10000)
      )
    ]);

    console.log("[ConnectionManager] Shared connections established");
  }

  async initializeChatroomsInBatches(chatrooms) {
    console.log(`[ConnectionManager] Initializing ${chatrooms.length} chatrooms in batches of ${this.config.batchSize}`);

    // Sort chatrooms by priority (you can customize this logic)
    const prioritizedChatrooms = this.prioritizeChatrooms(chatrooms);

    // Split into batches
    const batches = this.chunkArray(prioritizedChatrooms, this.config.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[ConnectionManager] Processing batch ${i + 1}/${batches.length} (${batch.length} chatrooms)`);

      // Process batch in parallel
      const batchPromises = batch.map(chatroom => this.addChatroom(chatroom));
      await Promise.allSettled(batchPromises);

      // Add delay between batches (except for the last one)
      if (i < batches.length - 1) {
        await this.delay(this.config.staggerDelay);
      }
    }

    console.log("[ConnectionManager] All chatrooms initialized");
  }

  async addChatroom(chatroom) {
    try {
      // Add to KickPusher
      this.kickPusher.addChatroom(
        chatroom.id,
        chatroom.streamerData.id,
        chatroom
      );

      // Add to 7TV WebSocket
      const stvId = chatroom.streamerData?.user_id || "0";
      const stvEmoteSetId = chatroom.channel7TVEmotes?.[0]?.id || "0";

      this.stvWebSocket.addChatroom(
        chatroom.id,
        stvId,
        stvId,
        stvEmoteSetId
      );

      // Fetch initial messages for this chatroom
      await this.fetchInitialMessages(chatroom);

      // Fetch initial chatroom info (including livestream status)
      await this.fetchInitialChatroomInfo(chatroom);

      console.log(`[ConnectionManager] Added chatroom ${chatroom.id} (${chatroom.streamerData?.user?.username})`);
    } catch (error) {
      console.error(`[ConnectionManager] Error adding chatroom ${chatroom.id}:`, error);
    }
  }

  async removeChatroom(chatroomId) {
    this.kickPusher.removeChatroom(chatroomId);
    this.stvWebSocket.removeChatroom(chatroomId);
    console.log(`[ConnectionManager] Removed chatroom ${chatroomId}`);
  }

  async batchFetchEmotes(chatrooms) {
    console.log("[ConnectionManager] Starting batch emote fetching...");

    // Fetch global 7TV emotes first (cached)
    await this.fetchGlobalStvEmotes();

    // Batch fetch channel-specific emotes
    const emoteFetchPromises = chatrooms.map(chatroom =>
      this.fetchChatroomEmotes(chatroom)
    );

    // Process in batches to avoid overwhelming the APIs
    const emoteBatches = this.chunkArray(emoteFetchPromises, this.config.maxConcurrentEmoteFetches);

    for (const batch of emoteBatches) {
      await Promise.allSettled(batch);
      await this.delay(100); // Small delay between batches
    }

    console.log("[ConnectionManager] Batch emote fetching completed");
  }

  async fetchGlobalStvEmotes() {
    if (this.globalStvEmotesCache) {
      console.log("[ConnectionManager] Using cached global 7TV emotes");
      return this.globalStvEmotesCache;
    }

    try {
      // Fetch global 7TV emotes (implementation would depend on your existing API)
      // This is a placeholder - you'd implement the actual API call
      console.log("[ConnectionManager] Fetching global 7TV emotes...");
      // const globalEmotes = await window.app.seventv.getGlobalEmotes();
      // this.globalStvEmotesCache = globalEmotes;
      console.log("[ConnectionManager] Global 7TV emotes cached");
    } catch (error) {
      console.error("[ConnectionManager] Error fetching global 7TV emotes:", error);
    }
  }

  async fetchChatroomEmotes(chatroom) {
    const cacheKey = `${chatroom.streamerData?.slug}`;

    if (this.emoteCache.has(cacheKey)) {
      console.log(`[ConnectionManager] Using cached emotes for ${chatroom.streamerData?.user?.username}`);
      return this.emoteCache.get(cacheKey);
    }

    try {
      console.log(`[ConnectionManager] Fetching emotes for ${chatroom.streamerData?.user?.username}`);

      // Fetch Kick emotes
      const kickEmotes = await window.app.kick.getEmotes(chatroom.streamerData?.slug);

      // Cache the result
      this.emoteCache.set(cacheKey, kickEmotes);

      return kickEmotes;
    } catch (error) {
      console.error(`[ConnectionManager] Error fetching emotes for ${chatroom.streamerData?.user?.username}:`, error);
      return null;
    }
  }

  prioritizeChatrooms(chatrooms) {
    // Sort chatrooms by priority - you can customize this logic
    return chatrooms.sort((a, b) => {
      // Prioritize live streamers
      if (a.isStreamerLive && !b.isStreamerLive) return -1;
      if (!a.isStreamerLive && b.isStreamerLive) return 1;

      // Then by last activity or other criteria
      return 0;
    });
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Status methods
  getConnectionStatus() {
    return {
      kick: {
        state: this.kickPusher.getConnectionState(),
        chatrooms: this.kickPusher.getChatroomCount(),
        channels: this.kickPusher.getSubscribedChannelCount(),
      },
      stv: {
        state: this.stvWebSocket.getConnectionState(),
        chatrooms: this.stvWebSocket.getChatroomCount(),
        events: this.stvWebSocket.getSubscribedEventCount(),
      },
      emoteCache: {
        size: this.emoteCache.size,
        globalCached: !!this.globalStvEmotesCache,
      },
    };
  }

  // Fetch initial messages for a chatroom
  async fetchInitialMessages(chatroom) {
    try {
      const response = await window.app.kick.getInitialChatroomMessages(chatroom.streamerData.id);

      if (!response?.data?.data) {
        console.log(`[ConnectionManager] No initial messages data for chatroom ${chatroom.id}`);
        return;
      }

      const data = response.data.data;

      // Use callbacks to avoid circular imports
      if (this.storeCallbacks) {
        // Handle initial pinned message
        if (data?.pinned_message) {
          this.storeCallbacks.handlePinnedMessageCreated?.(chatroom.id, data.pinned_message);
        } else {
          this.storeCallbacks.handlePinnedMessageDeleted?.(chatroom.id);
        }

        // Add initial messages to the chatroom
        if (data?.messages) {
          this.storeCallbacks.addInitialChatroomMessages?.(chatroom.id, data.messages.reverse());
          console.log(`[ConnectionManager] Loaded ${data.messages.length} initial messages for chatroom ${chatroom.id}`);
        }
      }
    } catch (error) {
      console.error(`[ConnectionManager] Error fetching initial messages for chatroom ${chatroom.id}:`, error);
    }
  }

  // Fetch initial chatroom info (including livestream status)
  async fetchInitialChatroomInfo(chatroom) {
    try {
      const response = await window.app.kick.getChannelChatroomInfo(chatroom.streamerData.slug);

      if (!response?.data) {
        return;
      }

      // Use callbacks to avoid circular imports
      if (this.storeCallbacks) {
        const isLive = response.data?.livestream?.is_live || false;
        this.storeCallbacks.handleStreamStatus?.(chatroom.id, response.data, isLive);
      }
    } catch (error) {
      console.error(`[ConnectionManager] Error fetching initial chatroom info for chatroom ${chatroom.id}:`, error);
    }
  }

  // Cleanup method
  cleanup() {
    console.log("[ConnectionManager] Cleaning up connections...");
    this.kickPusher.close();
    this.stvWebSocket.close();
    this.emoteCache.clear();
    this.globalStvEmotesCache = null;
    this.initializationInProgress = false;
  }
}

export default ConnectionManager;