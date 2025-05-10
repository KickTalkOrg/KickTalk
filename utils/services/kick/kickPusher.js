class KickPusher extends EventTarget {
  constructor(chatroomNumber, streamerId) {
    super();
    this.reconnectDelay = 5000;
    this.chat = null;
    this.chatroomNumber = chatroomNumber;
    this.streamerId = streamerId;
    this.shouldReconnect = true;
  }

  connect() {
    if (!this.shouldReconnect) {
      console.log("Not connecting to chatroom. Disabled recconect.");
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
      this.dispatchEvent(new CustomEvent("error", { detail: error }));
    });

    this.chat.addEventListener("close", () => {
      console.log(`Connection closed for chatroom: ${this.chatroomNumber}`);

      this.dispatchEvent(new Event("close"));

      if (this.shouldReconnect) {
        setTimeout(() => {
          console.log(`Attempting to reconnect to chatroom: ${this.chatroomNumber}...`);
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

          this.reconnectDelay = 5000;
        }

        if (
          jsonData.event === `App\\Events\\ChatMessageEvent` ||
          jsonData.event === `App\\Events\\MessageDeletedEvent` ||
          jsonData.event === `App\\Events\\UserBannedEvent` ||
          jsonData.event === `App\\Events\\UserUnbannedEvent`
        ) {
          this.dispatchEvent(new CustomEvent("message", { detail: jsonData }));
        }

        if (
          jsonData.event === `App\\Events\\StreamerIsLive` ||
          jsonData.event === `App\\Events\\StopStreamBroadcast` ||
          jsonData.event === `App\\Events\\PinnedMessageCreatedEvent` ||
          jsonData.event === `App\\Events\\PinnedMessageDeletedEvent` ||
          jsonData.event === `App\\Events\\ChatroomUpdatedEvent` ||
          jsonData.event === `App\\Events\\PollUpdateEvent`
        ) {
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
