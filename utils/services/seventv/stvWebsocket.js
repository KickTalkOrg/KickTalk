class StvWebSocket extends EventTarget {
  constructor(chatroomNumber) {
    super();
    this.reconnectDelay = 5000;
    this.chat = null;
    this.chatroomNumber = chatroomNumber;
    this.shouldReconnect = true;
  }

  connect() {
    console.log(`[7TV]: Connecting to WebSocket`);

    this.chat = new WebSocket("wss://7tv.io/v3/ws");

    this.chat.onopen = () => {
      console.log(`[7TV]: Connection opened`);
    };

    this.chat.onmessage = (event) => {
      console.log(`[7TV]: Message received: ${event.data}`);
    };

    this.chat.onerror = (event) => {
      console.log(`[7TV]: Error: ${event.message}`);
    };
  }
  // close() {
  //   console.log(`Closing connection for chatroom ${this.chatroomNumber}`);
  //   this.shouldReconnect = false;

  //   if (this.chat && this.chat.readyState === WebSocket.OPEN) {
  //     try {
  //       this.chat.send(
  //         JSON.stringify({
  //           event: "pusher:unsubscribe",
  //           data: {
  //             channel: `chatrooms.${this.chatroomNumber}.v2`,
  //           },
  //         }),
  //       );

  //       console.log(`Unsubscribed from channel: chatrooms.${this.chatroomNumber}.v2`);

  //       this.chat.close();
  //       this.chat = null;

  //       console.log("WebSocket connection closed");
  //     } catch (error) {
  //       console.error("Error during closing of connection:", error);
  //     }
  //   }
  // }
}

export default StvWebSocket;
