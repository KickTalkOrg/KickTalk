// OpenTelemetry instrumentation
let tracer;
try {
  const { trace } = require('@opentelemetry/api');
  tracer = trace.getTracer('kicktalk-shared-kick-pusher', '1.0.0');
} catch (e) {
  // Fallback if OpenTelemetry not available
  tracer = {
    startSpan: (name, options) => ({ 
      end: () => {}, 
      setStatus: () => {}, 
      recordException: () => {},
      addEvent: () => {},
      setAttribute: () => {},
      setAttributes: () => {}
    })
  };
}

class SharedKickPusher extends EventTarget {
  constructor() {
    super();
    this.reconnectDelay = 5000;
    this.chat = null;
    this.shouldReconnect = true;
    this.socketId = null;
    this.chatrooms = new Map(); // Map of chatroomId -> chatroom info
    this.subscribedChannels = new Set(); // Track subscribed channels
    this.userEventsSubscribed = false; // Track if user events are subscribed
    this.connectionState = 'disconnected'; // disconnected, connecting, connected
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.connectionSpan = null; // Track current connection span
  }

  addChatroom(chatroomId, streamerId, chatroomData) {
    this.chatrooms.set(chatroomId, {
      chatroomId,
      streamerId,
      chatroomData,
      channels: [
        `channel_${streamerId}`,
        `channel.${streamerId}`,
        `chatrooms.${chatroomId}`,
        `chatrooms.${chatroomId}.v2`,
        `chatroom_${chatroomId}`,
      ],
    });

    // If we're already connected, subscribe to this chatroom's channels
    if (this.connectionState === 'connected') {
      this.subscribeToChatroomChannels(chatroomId);
    }
  }

  removeChatroom(chatroomId) {
    const chatroom = this.chatrooms.get(chatroomId);
    if (chatroom && this.connectionState === 'connected') {
      this.unsubscribeFromChatroomChannels(chatroomId);
    }
    this.chatrooms.delete(chatroomId);

    // If no more chatrooms, close the connection
    if (this.chatrooms.size === 0) {
      this.close();
    }
  }

  connect() {
    if (!this.shouldReconnect) {
      console.log("[SharedKickPusher] Not connecting. Disabled reconnect.");
      return;
    }

    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      console.log("[SharedKickPusher] Already connecting/connected");
      return;
    }

    // Start OpenTelemetry span for WebSocket connection
    this.connectionSpan = tracer.startSpan('kick_websocket_connection', {
      attributes: {
        'websocket.url': 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679',
        'websocket.protocol': 'pusher',
        'websocket.type': 'pooled_shared',
        'connection.chatroom_count': this.chatrooms.size,
        'connection.attempt': this.reconnectAttempts + 1,
        'connection.max_attempts': this.maxReconnectAttempts,
        'kick.pusher.app_key': '32cbd69e4b950bf97679'
      }
    });

    this.connectionState = 'connecting';
    console.log(`[SharedKickPusher] Connecting to Kick WebSocket for ${this.chatrooms.size} chatrooms`);
    
    this.connectionSpan.addEvent('websocket_connection_started', {
      chatroom_count: this.chatrooms.size,
      connection_state: 'connecting'
    });

    this.chat = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false",
    );

    this.dispatchEvent(
      new CustomEvent("connection", {
        detail: {
          type: "system",
          content: "connection-pending",
          chatrooms: Array.from(this.chatrooms.keys()),
        },
      }),
    );

    this.chat.addEventListener("open", async () => {
      console.log("[SharedKickPusher] Connected to Kick WebSocket");
      this.reconnectAttempts = 0;

      // Complete the connection span successfully
      if (this.connectionSpan) {
        this.connectionSpan.addEvent('websocket_connection_opened', {
          connection_state: 'connected',
          chatroom_count: this.chatrooms.size
        });
        this.connectionSpan.setAttributes({
          'connection.success': true,
          'connection.state': 'connected'
        });
        this.connectionSpan.setStatus({ code: 1 }); // SUCCESS
        this.connectionSpan.end();
        this.connectionSpan = null;
      }

      // Telemetry: mark each chatroom as connected
      try {
        for (const [chatroomId, info] of this.chatrooms) {
          const streamerId = info?.streamerId ?? null;
          const streamerName = info?.chatroomData?.streamerData?.user?.username || `chatroom_${chatroomId}`;
          await window.app?.telemetry?.recordWebSocketConnection?.(chatroomId, streamerId, true, streamerName);
        }
      } catch (_) {}
      
      // Wait for connection_established event before subscribing
    });

    this.chat.addEventListener("error", (error) => {
      console.log(`[SharedKickPusher] Error occurred: ${error.message}`);
      this.connectionState = 'disconnected';
      this.dispatchEvent(new CustomEvent("error", { detail: error }));

      // Complete the connection span with error
      if (this.connectionSpan) {
        this.connectionSpan.addEvent('websocket_connection_error', {
          error_message: error.message || 'Unknown WebSocket error',
          connection_state: 'disconnected'
        });
        this.connectionSpan.setAttributes({
          'connection.success': false,
          'connection.error': error.message || 'Unknown error',
          'connection.state': 'disconnected'
        });
        this.connectionSpan.recordException(error);
        this.connectionSpan.setStatus({ code: 2, message: error.message }); // ERROR
        this.connectionSpan.end();
        this.connectionSpan = null;
      }

      // Telemetry: record connection error and reconnection attempts
      try {
        for (const [chatroomId] of this.chatrooms) {
          window.app?.telemetry?.recordConnectionError?.(chatroomId, 'kick_ws_error');
          window.app?.telemetry?.recordReconnection?.(chatroomId, 'kick_ws_error');
        }
      } catch (_) {}
    });

    this.chat.addEventListener("close", (ev) => {
      console.log("[SharedKickPusher] Connection closed");
      this.connectionState = 'disconnected';
      this.socketId = null;
      this.userEventsSubscribed = false;
      this.subscribedChannels.clear();

      // Complete the connection span if still active
      if (this.connectionSpan) {
        this.connectionSpan.addEvent('websocket_connection_closed', {
          close_code: ev.code,
          close_reason: ev.reason || 'Unknown',
          was_clean: ev.wasClean,
          connection_state: 'disconnected'
        });
        this.connectionSpan.setAttributes({
          'connection.success': false,
          'connection.close_code': ev.code,
          'connection.close_reason': ev.reason || 'Connection closed',
          'connection.was_clean': ev.wasClean,
          'connection.state': 'disconnected'
        });
        this.connectionSpan.setStatus({ code: 2, message: `Connection closed: ${ev.reason || 'Unknown'}` }); // ERROR
        this.connectionSpan.end();
        this.connectionSpan = null;
      }

      // Telemetry: mark each chatroom as disconnected and note reconnection intent
      try {
        for (const [chatroomId, info] of this.chatrooms) {
          const streamerId = info?.streamerId ?? null;
          const streamerName = info?.chatroomData?.streamerData?.user?.username || `chatroom_${chatroomId}`;
          window.app?.telemetry?.recordWebSocketConnection?.(chatroomId, streamerId, false, streamerName);
          if (this.shouldReconnect) {
            window.app?.telemetry?.recordReconnection?.(chatroomId, 'kick_ws_close');
          }
        }
      } catch (_) {}

      this.dispatchEvent(new Event("close"));

      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => {
          console.log(`[SharedKickPusher] Attempting to reconnect (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          this.connect();
        }, this.reconnectDelay * this.reconnectAttempts);
      } else {
        console.log("[SharedKickPusher] Not reconnecting - connection was closed intentionally or max attempts reached");
      }
    });

    this.chat.addEventListener("message", async (event) => {
      try {
        const dataString = event.data;
        const jsonData = JSON.parse(dataString);

        // Handle connection established
        if (jsonData.event === "pusher:connection_established") {
          this.connectionState = 'connected';
          this.socketId = JSON.parse(jsonData.data).socket_id;
          console.log(`[SharedKickPusher] Connection established: socket ID - ${this.socketId}`);

          // Subscribe to all chatroom channels
          await this.subscribeToAllChannels();

          // Telemetry: after full establishment ensure connected state per chatroom
          try {
            for (const [chatroomId, info] of this.chatrooms) {
              const streamerId = info?.streamerId ?? null;
              const streamerName = info?.chatroomData?.streamerData?.user?.username || `chatroom_${chatroomId}`;
              window.app?.telemetry?.recordWebSocketConnection?.(chatroomId, streamerId, true, streamerName);
            }
          } catch (_) {}

          this.dispatchEvent(
            new CustomEvent("connection", {
              detail: {
                type: "system",
                content: "connection-success",
                chatrooms: Array.from(this.chatrooms.keys()),
              },
            }),
          );
        }

        // Handle subscription success
        if (jsonData.event === "pusher_internal:subscription_succeeded") {
          const chatroomId = this.extractChatroomIdFromChannel(jsonData.channel);
          if (chatroomId) {
            console.log(`[SharedKickPusher] Subscription successful for chatroom: ${chatroomId}`);
            this.dispatchEvent(
              new CustomEvent("subscription_success", {
                detail: {
                  chatroomId,
                  channel: jsonData.channel,
                },
              }),
            );
          }
        }

        // Handle chat messages and events
        if (
          jsonData.event === `App\\Events\\ChatMessageEvent` ||
          jsonData.event === `App\\Events\\MessageDeletedEvent` ||
          jsonData.event === `App\\Events\\UserBannedEvent` ||
          jsonData.event === `App\\Events\\UserUnbannedEvent`
        ) {
          const chatroomId = this.extractChatroomIdFromChannel(jsonData.channel);
          if (chatroomId) {
            this.dispatchEvent(
              new CustomEvent("message", {
                detail: {
                  chatroomId,
                  event: jsonData.event,
                  data: jsonData.data,
                  channel: jsonData.channel,
                },
              }),
            );
          }
        }

        // Handle channel events
        if (
          jsonData.event === `App\\Events\\LivestreamUpdated` ||
          jsonData.event === `App\\Events\\StreamerIsLive` ||
          jsonData.event === `App\\Events\\StopStreamBroadcast` ||
          jsonData.event === `App\\Events\\PinnedMessageCreatedEvent` ||
          jsonData.event === `App\\Events\\PinnedMessageDeletedEvent` ||
          jsonData.event === `App\\Events\\ChatroomUpdatedEvent` ||
          jsonData.event === `App\\Events\\PollUpdateEvent` ||
          jsonData.event === `App\\Events\\PollDeleteEvent`
        ) {
          const chatroomId = this.extractChatroomIdFromChannel(jsonData.channel);
          if (chatroomId) {
            this.dispatchEvent(
              new CustomEvent("channel", {
                detail: {
                  chatroomId,
                  event: jsonData.event,
                  data: jsonData.data,
                  channel: jsonData.channel,
                },
              }),
            );
          }
        }
      } catch (error) {
        console.log(`[SharedKickPusher] Error in message processing: ${error.message}`);
        this.dispatchEvent(new CustomEvent("error", { detail: error }));
      }
    });
  }

  async subscribeToAllChannels() {
    if (!this.chat || this.chat.readyState !== WebSocket.OPEN) {
      console.log("[SharedKickPusher] Cannot subscribe - WebSocket not open");
      return;
    }

    // Subscribe to user events (only once)
    await this.subscribeToUserEvents();

    // Subscribe to all chatroom channels
    for (const [chatroomId] of this.chatrooms) {
      await this.subscribeToChatroomChannels(chatroomId);
    }
  }

  async subscribeToUserEvents() {
    if (this.userEventsSubscribed) return;

    const user_id = localStorage.getItem("kickId");
    if (!user_id) {
      console.log("[SharedKickPusher] No user ID found, skipping private event subscriptions");
      return;
    }

    const userEvents = [`private-userfeed.${user_id}`, `private-channelpoints-${user_id}`];
    console.log("[SharedKickPusher] Subscribing to user events:", userEvents);

    for (const event of userEvents) {
      try {
        console.log("[SharedKickPusher] Subscribing to private event:", event);
        const AuthToken = await window.app.kick.getKickAuthForEvents(event, this.socketId);

        if (AuthToken.auth) {
          this.chat.send(
            JSON.stringify({
              event: "pusher:subscribe",
              data: { auth: AuthToken.auth, channel: event },
            }),
          );
          this.subscribedChannels.add(event);
          console.log("[SharedKickPusher] Subscribed to event:", event);
        }
      } catch (error) {
        console.error("[SharedKickPusher] Error subscribing to event:", error);
      }
    }

    this.userEventsSubscribed = true;
  }

  async subscribeToChatroomChannels(chatroomId) {
    const chatroom = this.chatrooms.get(chatroomId);
    if (!chatroom) {
      console.log(`[SharedKickPusher] Chatroom ${chatroomId} not found`);
      return;
    }

    // Subscribe to basic chatroom channels
    for (const channel of chatroom.channels) {
      if (!this.subscribedChannels.has(channel)) {
        this.chat.send(
          JSON.stringify({
            event: "pusher:subscribe",
            data: { auth: "", channel },
          }),
        );
        this.subscribedChannels.add(channel);
      }
    }

    console.log(`[SharedKickPusher] Subscribed to channels for chatroom: ${chatroomId}`);

    // Subscribe to livestream event if streamer is live
    if (chatroom.chatroomData?.streamerData?.livestream !== null) {
      const livestreamId = chatroom.chatroomData.streamerData.livestream.id;
      const liveEventToSubscribe = `private-livestream.${livestreamId}`;

      try {
        console.log(`[SharedKickPusher] Subscribing to livestream event for chatroom ${chatroomId}:`, liveEventToSubscribe);

        const AuthToken = await window.app.kick.getKickAuthForEvents(liveEventToSubscribe, this.socketId);

        if (AuthToken.auth && !this.subscribedChannels.has(liveEventToSubscribe)) {
          this.chat.send(
            JSON.stringify({
              event: "pusher:subscribe",
              data: { auth: AuthToken.auth, channel: liveEventToSubscribe },
            }),
          );
          this.subscribedChannels.add(liveEventToSubscribe);
          console.log("[SharedKickPusher] Subscribed to livestream event:", liveEventToSubscribe);
        }
      } catch (error) {
        console.error("[SharedKickPusher] Error subscribing to livestream event:", error);
      }
    } else {
      console.log(`[SharedKickPusher] Chatroom ${chatroomId} is not live, skipping livestream subscription`);
    }
  }

  unsubscribeFromChatroomChannels(chatroomId) {
    const chatroom = this.chatrooms.get(chatroomId);
    if (!chatroom) return;

    for (const channel of chatroom.channels) {
      if (this.subscribedChannels.has(channel)) {
        this.chat.send(
          JSON.stringify({
            event: "pusher:unsubscribe",
            data: { channel },
          }),
        );
        this.subscribedChannels.delete(channel);
      }
    }

    console.log(`[SharedKickPusher] Unsubscribed from channels for chatroom: ${chatroomId}`);
  }

  extractChatroomIdFromChannel(channel) {
    // Extract chatroom ID from channel names like "chatrooms.12345.v2"
    const match = channel.match(/chatrooms\.(\d+)(?:\.v2)?$/);
    return match ? match[1] : null;
  }

  close() {
    console.log("[SharedKickPusher] Closing shared connection");
    this.shouldReconnect = false;
    this.connectionState = 'disconnected';

    if (this.chat && this.chat.readyState === WebSocket.OPEN) {
      try {
        // Unsubscribe from all channels
        for (const channel of this.subscribedChannels) {
          this.chat.send(
            JSON.stringify({
              event: "pusher:unsubscribe",
              data: { channel },
            }),
          );
        }

        this.subscribedChannels.clear();
        this.chat.close();
        this.chat = null;
        this.socketId = null;
        this.userEventsSubscribed = false;

        console.log("[SharedKickPusher] WebSocket connection closed");
      } catch (error) {
        console.error("[SharedKickPusher] Error during closing of connection:", error);
      }
    }
  }

  // Get connection status
  getConnectionState() {
    return this.connectionState;
  }

  // Get number of subscribed channels
  getSubscribedChannelCount() {
    return this.subscribedChannels.size;
  }

  // Get number of chatrooms
  getChatroomCount() {
    return this.chatrooms.size;
  }
}

export default SharedKickPusher;