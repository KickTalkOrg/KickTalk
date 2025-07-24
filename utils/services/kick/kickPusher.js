class KickPusher extends EventTarget {
  constructor(chatroomNumber, streamerId) {
    super();
    this.reconnectDelay = 5000;
    this.chat = null;
    this.chatroomNumber = chatroomNumber;
    this.streamerId = streamerId;
    this.shouldReconnect = true;
    this.socketId = null;
  }

  connect() {
    if (!this.shouldReconnect) {
      console.log("Not connecting to chatroom. Disabled reconnect.");
      return;
    }
    console.log(`Connecting to chatroom: ${this.chatroomNumber} and streamerId: ${this.streamerId}`);
    this.chat = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false",
    );

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
      console.log(`Connected to Kick.com Streamer Chat: ${this.chatroomNumber}`);
      
      // Record WebSocket connection
      try {
        await window.app?.telemetry?.recordWebSocketConnection?.(this.chatroomNumber, this.streamerId, true);
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
      console.log(`Error occurred: ${error.message}`);
      
      // Record connection error
      try {
        window.app?.telemetry?.recordConnectionError?.(this.chatroomNumber, error.message || 'unknown');
      } catch (telemetryError) {
        console.warn('[Telemetry]: Failed to record connection error:', telemetryError);
      }
      
      this.dispatchEvent(new CustomEvent("error", { detail: error }));
    });

    this.chat.addEventListener("close", () => {
      console.log(`Connection closed for chatroom: ${this.chatroomNumber}`);
      
      // Record WebSocket disconnection
      try {
        window.app?.telemetry?.recordWebSocketConnection?.(this.chatroomNumber, this.streamerId, false);
      } catch (error) {
        console.warn('[Telemetry]: Failed to record WebSocket disconnection:', error);
      }

      this.dispatchEvent(new Event("close"));

      if (this.shouldReconnect) {
        setTimeout(() => {
          console.log(`Attempting to reconnect to chatroom: ${this.chatroomNumber}...`);
          
          // Record reconnection attempt
          try {
            window.app?.telemetry?.recordReconnection?.(this.chatroomNumber, 'websocket_close');
          } catch (error) {
            console.warn('[Telemetry]: Failed to record reconnection:', error);
          }
          
          this.connect();
        }, this.reconnectDelay);
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
              await window.app?.telemetry?.recordMessageReceived?.(this.chatroomNumber, messageType, senderId);
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
