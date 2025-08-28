class KickPusher extends EventTarget {
  constructor(chatroomNumber, streamerId, streamerName = null) {
    super();
    this.reconnectDelay = 5000;
    this.maxReconnectDelay = 60000; // 1 minute max
    this.reconnectMultiplier = 1.5;
    this.maxReconnectAttempts = 10;
    this.reconnectAttempts = 0;
    this.chat = null;
    this.chatroomNumber = chatroomNumber;
    this.streamerId = streamerId;
    this.streamerName = streamerName;
    this.shouldReconnect = true;
    this.socketId = null;
    this.connectionStartTime = null;
    this.lastErrorTime = null;
    this.consecutiveErrors = 0;
    // Circuit breaker will be managed by error monitoring system
    this.circuitBreakerName = `kick_websocket_${chatroomNumber}`;
  }

  async connect() {
    if (!this.shouldReconnect) {
      console.log("Not connecting to chatroom. Disabled reconnect.");
      return;
    }
    
    this.connectionStartTime = Date.now();
    console.log(`Connecting to chatroom: ${this.chatroomNumber} and streamerId: ${this.streamerId} (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    try {
      // Use error monitoring system for WebSocket connection with circuit breaker
      await this.executeWithErrorMonitoring(async () => {
        this.chat = new WebSocket(
          "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false",
        );
        this.setupWebSocketHandlers();
      }, 'websocket_connect');
      
    } catch (error) {
      console.error(`Failed to connect to chatroom ${this.chatroomNumber}:`, error);
      this.handleConnectionFailure(error);
    }
  }

  async executeWithErrorMonitoring(operation, operationType) {
    try {
      // Record error monitoring context
      const context = {
        operation: operationType,
        component: 'kick_websocket',
        chatroom_id: this.chatroomNumber,
        streamer_id: this.streamerId,
        streamer_name: this.streamerName,
        reconnect_attempt: this.reconnectAttempts
      };

      // Use main process error monitoring if available
      if (window.app?.telemetry?.executeWebSocketWithRetry) {
        return await window.app.telemetry.executeWebSocketWithRetry(operation, {
          operationName: operationType,
          circuitBreakerName: this.circuitBreakerName,
          chatroomId: this.chatroomNumber,
          context
        });
      } else {
        // Fallback to direct execution
        return await operation();
      }
    } catch (error) {
      // Record error in monitoring system
      if (window.app?.telemetry?.recordError) {
        window.app.telemetry.recordError(error, {
          operation: operationType,
          component: 'kick_websocket',
          chatroom_id: this.chatroomNumber,
          streamer_id: this.streamerId,
          reconnect_attempt: this.reconnectAttempts
        });
      }
      throw error;
    }
  }

  setupWebSocketHandlers() {

    this.dispatchEvent(
      new CustomEvent("connection", {
        detail: {
          type: "system",
          content: "connection-pending",
          chatroomNumber: this.chatroomNumber,
        },
      }),
    );

    this.chat.addEventListener("open", async () => {
      const connectionDuration = Date.now() - this.connectionStartTime;
      console.log(`Connected to Kick.com Streamer Chat: ${this.chatroomNumber} (${connectionDuration}ms)`);
      
      // Reset error tracking on successful connection
      this.reconnectAttempts = 0;
      this.consecutiveErrors = 0;
      this.reconnectDelay = 5000; // Reset to initial delay
      
      // Record successful WebSocket connection with duration
      try {
        const streamerName = this.streamerName || `chatroom_${this.chatroomNumber}`;
        console.log(`[Telemetry] WebSocket connected - chatroomId: ${this.chatroomNumber}, streamerId: ${this.streamerId}, streamerName: ${streamerName}`);
        
        // Record connection success and duration
        await window.app?.telemetry?.recordWebSocketConnection?.(this.chatroomNumber, this.streamerId, true, streamerName);
        await window.app?.telemetry?.recordWebSocketConnectionDuration?.(connectionDuration, this.chatroomNumber, true, {
          streamer_name: streamerName,
          reconnect_attempt: this.reconnectAttempts
        });
      } catch (error) {
        console.warn('[Telemetry]: Failed to record WebSocket connection:', error);
      }

      setTimeout(() => {
        if (this.chat && this.chat.readyState === WebSocket.OPEN) {
          const channelsToSubscribe = [
            `channel_${this.streamerId}`,
            `channel.${this.streamerId}`,
            `chatrooms.${this.chatroomNumber}`,
            `chatrooms.${this.chatroomNumber}.v2`,
            `chatroom_${this.chatroomNumber}`,
          ];

          channelsToSubscribe.forEach((channel) => {
            this.chat.send(
              JSON.stringify({
                event: "pusher:subscribe",
                data: { auth: "", channel },
              }),
            );
          });

          console.log(`Subscribed to Channel: chatrooms.${this.chatroomNumber}.v2 and chatrooms.${this.chatroomNumber}`);
        }
      }, 1000);
    });

    this.chat.addEventListener("error", (error) => {
      this.consecutiveErrors++;
      this.lastErrorTime = Date.now();
      
      console.error(`WebSocket error for chatroom ${this.chatroomNumber} (consecutive: ${this.consecutiveErrors}):`, error.message || error);
      
      // Record comprehensive error information
      try {
        const errorContext = {
          operation: 'websocket_error',
          component: 'kick_websocket',
          chatroom_id: this.chatroomNumber,
          streamer_id: this.streamerId,
          streamer_name: this.streamerName,
          consecutive_errors: this.consecutiveErrors,
          reconnect_attempts: this.reconnectAttempts,
          connection_state: this.chat?.readyState || 'unknown',
          error_type: error.type || 'websocket_error'
        };

        // Record error using enhanced error monitoring
        if (window.app?.telemetry?.recordError) {
          window.app.telemetry.recordError(error, errorContext);
        } else {
          // Fallback to basic error recording
          window.app?.telemetry?.recordConnectionError?.(this.chatroomNumber, error.message || 'unknown');
        }
      } catch (telemetryError) {
        console.warn('[Telemetry]: Failed to record connection error:', telemetryError);
      }
      
      this.dispatchEvent(new CustomEvent("error", { detail: error }));
      
      // Trigger connection failure handling if too many consecutive errors
      if (this.consecutiveErrors >= 3) {
        console.warn(`Too many consecutive errors (${this.consecutiveErrors}) for chatroom ${this.chatroomNumber}`);
        this.handleConnectionFailure(error);
      }
    });

    this.chat.addEventListener("close", async () => {
      console.log(`Connection closed for chatroom: ${this.chatroomNumber}`);
      
      // Record WebSocket disconnection
      try {
        const streamerName = this.streamerName || `chatroom_${this.chatroomNumber}`;
        window.app?.telemetry?.recordWebSocketConnection?.(this.chatroomNumber, this.streamerId, false, streamerName);
      } catch (error) {
        console.warn('[Telemetry]: Failed to record WebSocket disconnection:', error);
      }

      this.dispatchEvent(new Event("close"));

      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        
        // Calculate exponential backoff delay
        const calculatedDelay = Math.min(
          this.reconnectDelay * Math.pow(this.reconnectMultiplier, this.reconnectAttempts - 1),
          this.maxReconnectDelay
        );
        
        setTimeout(async () => {
          console.log(`Attempting to reconnect to chatroom: ${this.chatroomNumber} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}, delay: ${calculatedDelay}ms)`);
          
          // Record reconnection attempt with enhanced context and user impact
          try {
            const context = {
              chatroom_id: this.chatroomNumber,
              reconnect_attempt: this.reconnectAttempts,
              max_attempts: this.maxReconnectAttempts,
              delay_ms: calculatedDelay,
              consecutive_errors: this.consecutiveErrors
            };
            
            if (window.app?.telemetry?.recordError) {
              // Record as reconnection context for error correlation
              window.app.telemetry.recordError(new Error('WebSocket reconnection attempt'), {
                operation: 'websocket_reconnect',
                component: 'kick_websocket',
                ...context
              });
            } else {
              window.app?.telemetry?.recordReconnection?.(this.chatroomNumber, 'websocket_close');
            }
            
            // Record connection quality impact on user experience (Phase 4)
            if (window.userAnalytics) {
              const qualityScore = this.reconnectAttempts > 3 ? 2 : this.reconnectAttempts > 1 ? 4 : 6;
              await window.userAnalytics.recordConnectionQuality(qualityScore, 'websocket_reconnect');
            }
          } catch (error) {
            console.warn('[Telemetry]: Failed to record reconnection:', error);
          }
          
          await this.connect();
        }, calculatedDelay);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached for chatroom ${this.chatroomNumber}`);
        
        // Record critical connection failure impact (Phase 4)
        if (window.userAnalytics) {
          try {
            await window.userAnalytics.recordConnectionQuality(1, 'websocket_failure_exhausted');
          } catch (error) {
            console.warn('[User Analytics]: Failed to record connection failure:', error);
          }
        }
        
        this.dispatchEvent(new CustomEvent("max_reconnects_reached", { 
          detail: { 
            chatroomNumber: this.chatroomNumber,
            attempts: this.reconnectAttempts 
          }
        }));
      } else {
        console.log("Not reconnecting - connection was closed intentionally");
      }
    });

    this.chat.addEventListener("message", async (event) => {
      try {
        const dataString = event.data;
        const jsonData = JSON.parse(dataString);

        if (
          jsonData.channel === `chatrooms.${this.chatroomNumber}.v2` &&
          jsonData.event === "pusher_internal:subscription_succeeded"
        ) {
          console.log(`Subscription successful for chatroom: ${this.chatroomNumber}`);
          this.dispatchEvent(
            new CustomEvent("connection", {
              detail: {
                type: "system",
                content: "connection-success",
                chatroomNumber: this.chatroomNumber,
              },
            }),
          );
        }

        if (jsonData.event === "pusher:connection_established") {
          console.log(`Connection established: socket ID - ${JSON.parse(jsonData.data).socket_id}`);
          this.socketId = JSON.parse(jsonData.data).socket_id;

          const user_id = localStorage.getItem("kickId");

          if (!user_id) {
            console.log("[KickPusher] No user ID found, skipping private event subscriptions");
            this.reconnectDelay = 5000;
            return;
          }

          const chatrooms = JSON.parse(localStorage.getItem("chatrooms"));
          const chatroom = chatrooms?.find((chatroom) => chatroom.id === this.chatroomNumber);

          if (!chatroom) {
            console.log(`[KickPusher] Could not find chatroom data for ${this.chatroomNumber}`);
            this.reconnectDelay = 5000;
            return;
          }

          // Subscribe to user-specific events (only once per user, regardless of chatroom)
          const userEvents = [`private-userfeed.${user_id}`, `private-channelpoints-${user_id}`];

          console.log("[KickPusher] Subscribing to user events:", userEvents);

          userEvents.forEach(async (event) => {
            try {
              console.log("[KickPusher] Subscribing to private event:", event);
              const AuthToken = await window.app.kick.getKickAuthForEvents(event, this.socketId);

              if (AuthToken.auth) {
                this.chat.send(
                  JSON.stringify({
                    event: "pusher:subscribe",
                    data: { auth: AuthToken.auth, channel: event },
                  }),
                );
                console.log("[KickPusher] Subscribed to event:", event);
              }
            } catch (error) {
              console.error("[KickPusher] Error subscribing to event:", error);
            }
          });

          // Subscribe to livestream event if streamer is live
          if (chatroom.streamerData.livestream !== null) {
            const livestreamId = chatroom.streamerData.livestream.id;
            const liveEventToSubscribe = `private-livestream.${livestreamId}`;

            try {
              console.log(
                `[KickPusher] Subscribing to livestream event for chatroom ${this.chatroomNumber}:`,
                liveEventToSubscribe,
              );

              const AuthToken = await window.app.kick.getKickAuthForEvents(liveEventToSubscribe, this.socketId);

              if (AuthToken.auth) {
                this.chat.send(
                  JSON.stringify({
                    event: "pusher:subscribe",
                    data: { auth: AuthToken.auth, channel: liveEventToSubscribe },
                  }),
                );
                console.log("[KickPusher] Subscribed to livestream event:", liveEventToSubscribe);
              }
            } catch (error) {
              console.error("[KickPusher] Error subscribing to livestream event:", error);
            }
          } else {
            console.log(`[KickPusher] Chatroom ${this.chatroomNumber} is not live, skipping livestream subscription`);
          }

          this.reconnectDelay = 5000;
        }

        if (
          jsonData.event === `App\\Events\\ChatMessageEvent` ||
          jsonData.event === `App\\Events\\MessageDeletedEvent` ||
          jsonData.event === `App\\Events\\UserBannedEvent` ||
          jsonData.event === `App\\Events\\UserUnbannedEvent`
        ) {
          // Record received message for ChatMessageEvent
          if (jsonData.event === `App\\Events\\ChatMessageEvent`) {
            try {
              const messageData = JSON.parse(jsonData.data);
              const messageType = messageData.type || 'regular';
              const senderId = messageData.sender?.id;
              const streamerName = this.streamerName || `chatroom_${this.chatroomNumber}`;
              await window.app?.telemetry?.recordMessageReceived?.(this.chatroomNumber, messageType, senderId, streamerName);
            } catch (error) {
              console.warn('[Telemetry]: Failed to record received message:', error);
            }
          }
          
          this.dispatchEvent(new CustomEvent("message", { detail: jsonData }));
        }

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
          if (jsonData.event === `App\\Events\\PinnedMessageCreatedEvent`) {
            console.log("[KickPusher] Pin created event received before dispatching");
          } else if (jsonData.event === `App\\Events\\PinnedMessageDeletedEvent`) {
            console.log("[KickPusher] Pin deleted event received before dispatching");
          }
          this.dispatchEvent(new CustomEvent("channel", { detail: jsonData }));
        }
      } catch (error) {
        console.log(`Error in message processing: ${error.message}`);
        this.dispatchEvent(new CustomEvent("error", { detail: error }));
      }
    });
  }

  handleConnectionFailure(error) {
    console.error(`Connection failure for chatroom ${this.chatroomNumber}:`, error.message || error);
    
    // Record comprehensive failure context
    try {
      const context = {
        operation: 'websocket_connection_failure',
        component: 'kick_websocket',
        chatroom_id: this.chatroomNumber,
        streamer_id: this.streamerId,
        streamer_name: this.streamerName,
        consecutive_errors: this.consecutiveErrors,
        reconnect_attempts: this.reconnectAttempts,
        max_attempts: this.maxReconnectAttempts,
        failure_reason: error.message || 'unknown'
      };

      if (window.app?.telemetry?.recordError) {
        window.app.telemetry.recordError(error, context);
      }
    } catch (telemetryError) {
      console.warn('[Telemetry]: Failed to record connection failure:', telemetryError);
    }

    // Dispatch failure event for UI handling
    this.dispatchEvent(new CustomEvent("connection_failure", {
      detail: {
        error,
        chatroomNumber: this.chatroomNumber,
        consecutiveErrors: this.consecutiveErrors,
        reconnectAttempts: this.reconnectAttempts
      }
    }));

    // If we're at max attempts, stop trying
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Stopping reconnection attempts for chatroom ${this.chatroomNumber}`);
      this.shouldReconnect = false;
    }
  }

  // Method to reset connection state (useful for recovery)
  resetConnectionState() {
    this.reconnectAttempts = 0;
    this.consecutiveErrors = 0;
    this.reconnectDelay = 5000;
    this.shouldReconnect = true;
    console.log(`Connection state reset for chatroom ${this.chatroomNumber}`);
  }

  // Method to get connection health status
  getConnectionHealth() {
    return {
      isConnected: this.chat?.readyState === WebSocket.OPEN,
      reconnectAttempts: this.reconnectAttempts,
      consecutiveErrors: this.consecutiveErrors,
      shouldReconnect: this.shouldReconnect,
      chatroomNumber: this.chatroomNumber,
      lastErrorTime: this.lastErrorTime,
      connectionStartTime: this.connectionStartTime
    };
  }

  close() {
    console.log(`Closing connection for chatroom ${this.chatroomNumber}`);
    this.shouldReconnect = false;

    if (this.chat && this.chat.readyState === WebSocket.OPEN) {
      try {
        const channelsToUnsubscribe = [
          `channel_${this.streamerId}`,
          `channel.${this.streamerId}`,
          `chatrooms.${this.chatroomNumber}`,
          `chatrooms.${this.chatroomNumber}.v2`,
          `chatroom_${this.chatroomNumber}`,
        ];

        channelsToUnsubscribe.forEach((channel) => {
          this.chat.send(
            JSON.stringify({
              event: "pusher:unsubscribe",
              data: { channel },
            }),
          );
        });

        console.log(`Unsubscribed from channel: chatrooms.${this.chatroomNumber}.v2 and chatrooms.${this.chatroomNumber}`);

        this.chat.close();
        this.chat = null;

        console.log("WebSocket connection closed");
      } catch (error) {
        console.error("Error during closing of connection:", error);
      }
    }
  }
}

export default KickPusher;
