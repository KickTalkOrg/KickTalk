// This websocket class originally made by https://github.com/Fiszh and edited by ftk789 and Drkness

const cosmetics = {
  paints: [],
  badges: [],
};

const updateCosmetics = async (body) => {
  if (!body?.object) {
    return;
  }

  const { object } = body;

  if (object?.kind === "BADGE") {
    if (!object?.user) {
      const data = object.data;

      const foundBadge = cosmetics.badges.find(
        (badge) => badge && badge.id === (data && data.id === "00000000000000000000000000" ? data.ref_id : data.id),
      );

      if (foundBadge) {
        return;
      }

      cosmetics.badges.push({
        id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
        title: data.tooltip,
        url: `https:${data.host.url}/${data.host.files[data.host.files.length - 1].name}`,
      });
    }
  }

  if (object?.kind === "PAINT") {
    if (!object.user) {
      const data = object.data;

      const foundPaint = cosmetics.paints.find(
        (paint) => paint && paint.id === (data && data.id === "00000000000000000000000000" ? data.ref_id : data.id),
      );

      if (foundPaint) {
        return;
      }

      const randomColor = "#00f742";

      let push = {};

      if (data.stops.length) {
        const normalizedColors = data.stops.map((stop) => ({
          at: stop.at * 100,
          color: stop.color,
        }));

        const gradient = normalizedColors.map((stop) => `${argbToRgba(stop.color)} ${stop.at}%`).join(", ");

        if (data.repeat) {
          data.function = `repeating-${data.function}`;
        }

        data.function = data.function.toLowerCase().replace("_", "-");

        let isDeg_or_Shape = `${data.angle}deg`;

        if (data.function !== "linear-gradient" && data.function !== "repeating-linear-gradient") {
          isDeg_or_Shape = data.shape;
        }

        push = {
          id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
          name: data.name,
          style: data.function,
          shape: data.shape,
          backgroundImage:
            `${data.function || "linear-gradient"}(${isDeg_or_Shape}, ${gradient})` ||
            `${data.style || "linear-gradient"}(${data.shape || ""} 0deg, ${randomColor}, ${randomColor})`,
          shadows: null,
          KIND: "non-animated",
          url: data.image_url,
        };
      } else {
        push = {
          id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
          name: data.name,
          style: data.function,
          shape: data.shape,
          backgroundImage:
            `url('${[data.image_url]}')` ||
            `${data.style || "linear-gradient"}(${data.shape || ""} 0deg, ${randomColor}, ${randomColor})`,
          shadows: null,
          KIND: "animated",
          url: data.image_url,
        };
      }

      // SHADOWS
      let shadow = null;

      if (data.shadows.length) {
        const shadows = data.shadows;

        shadow = await shadows
          .map((shadow) => {
            let rgbaColor = argbToRgba(shadow.color);

            rgbaColor = rgbaColor.replace(/rgba\((\d+), (\d+), (\d+), (\d+(\.\d+)?)\)/, `rgba($1, $2, $3)`);

            return `drop-shadow(${rgbaColor} ${shadow.x_offset}px ${shadow.y_offset}px ${shadow.radius}px)`;
          })
          .join(" ");

        push["shadows"] = shadow;
      }

      cosmetics.paints.push(push);
    }
  } else if (
    object?.name === "Personal Emotes" ||
    object?.name === "Personal Emotes Set" ||
    object?.user ||
    object?.id === "00000000000000000000000000" ||
    (object?.flags && (object.flags === 11 || object.flags === 4))
  ) {
    if (object?.id === "00000000000000000000000000" && object?.ref_id) {
      object.id = object.ref_id;
    }
  } else if (object?.kind == "BADGE") {
    const data = object.data;

    const foundBadge = cosmetics.badges.find(
      (badge) => badge && badge.id === (data && data.id === "00000000000000000000000000" ? data.ref_id : data.id),
    );

    if (foundBadge) {
      return;
    }

    cosmetics.badges.push({
      id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
      title: data.tooltip,
      url: `https:${data.host.url}/${data.host.files[data.host.files.length - 1].name}`,
    });
  } else {
    console.log("[7TV] Didn't process cosmetics:", body);
  }
};

class StvWebSocket extends EventTarget {
  constructor(channelKickID, stvId = "0", stvEmoteSetId = "0") {
    super();
    this.startDelay = 1000;
    this.maxRetrySteps = 5;
    this.reconnectAttempts = 0;
    this.chat = null;
    this.channelKickID = String(channelKickID);
    this.stvId = stvId;
    this.stvEmoteSetId = stvEmoteSetId;
    this.shouldReconnect = true;
  }

  connect() {
    if (!this.shouldReconnect) {
      console.log(`[7TV]: Not connecting to WebSocket - reconnect disabled`);
      return;
    }

    console.log(`[7TV]: Connecting to WebSocket (attempt ${this.reconnectAttempts + 1})`);

    this.chat = new WebSocket("wss://events.7tv.io/v3?app=kicktalk&version=420.69");

    this.chat.onerror = (event) => {
      console.log(`[7TV]: WebSocket error:`, event);
      this.handleConnectionError();
    };

    this.chat.onclose = (event) => {
      console.log(`[7TV]: WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
      this.handleReconnection();
    };

    this.chat.onopen = async () => {
      console.log(`[7TV]: Connection opened successfully`);

      this.reconnectAttempts = 0;

      await this.delay(1000);

      const waitStartTime = Date.now();
      while ((this.stvId === "0" || this.stvEmoteSetId === "0") && Date.now() - waitStartTime < 1000) {
        await this.delay(100);
      }

      // Subscribe to user & cosmetic events
      if (this.stvId !== "0") {
        this.subscribeToUserEvents();
        this.subscribeToCosmeticEvents();
      }

      // Subscribe to entitlement events
      if (this.channelKickID !== "0") {
        this.subscribeToEntitlementEvents();
        this.subscribeToEmoteSetEvents();
      }

      // Setup message handler
      this.setupMessageHandler();
    };
  }

  handleConnectionError() {
    this.reconnectAttempts++;
    console.log(`[7TV]: Connection error. Attempt ${this.reconnectAttempts}`);
  }

  handleReconnection() {
    if (!this.shouldReconnect) {
      console.log(`[7TV]: Reconnection disabled for chatroom ${this.channelKickID}`);
      return;
    }

    // exponential backoff: start * 2^(step-1)
    // cap at maxRetrySteps, so after step 5 it stays at start * 2^(maxRetrySteps-1)
    const step = Math.min(this.reconnectAttempts, this.maxRetrySteps);
    const delay = this.startDelay * Math.pow(2, step - 1);

    console.log(`[7TV]: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Subscribe to user events
   */
  subscribeToUserEvents() {
    const subscribeUserMessage = {
      op: 35,
      t: Date.now(),
      d: {
        type: "user.*",
        condition: { object_id: this.stvId },
      },
    };

    this.chat.send(JSON.stringify(subscribeUserMessage));
    console.log(`[7TV]: Subscribed to user.* events`);
  }

  /**
   * Subscribe to all cosmetic events
   */
  subscribeToCosmeticEvents() {
    const subscribeAllCosmetics = {
      op: 35,
      t: Date.now(),
      d: {
        type: "cosmetic.*",
        condition: { platform: "KICK", ctx: "channel", id: this.channelKickID },
      },
    };

    this.chat.send(JSON.stringify(subscribeAllCosmetics));
    console.log(`[7TV]: Subscribed to cosmetic.* events`);
  }

  /**
   * Subscribe to all entitlement events
   */
  subscribeToEntitlementEvents() {
    const subscribeAllEntitlements = {
      op: 35,
      t: Date.now(),
      d: {
        type: "entitlement.*",
        condition: { platform: "KICK", ctx: "channel", id: this.channelKickID },
      },
    };

    this.chat.send(JSON.stringify(subscribeAllEntitlements));
    console.log(`[7TV]: Subscribed to entitlement.* events`);

    this.dispatchEvent(new CustomEvent("open", { detail: { body: "SUBSCRIBED", type: "entitlement.*" } }));
  }

  /**
   * Subscribe to all emote set events
   */
  subscribeToEmoteSetEvents() {
    const subscribeAllEmoteSets = {
      op: 35,
      t: Date.now(),
      d: {
        type: "emote_set.*",
        condition: { object_id: this.stvEmoteSetId },
      },
    };

    this.chat.send(JSON.stringify(subscribeAllEmoteSets));
    console.log(`[7TV]: Subscribed to emote_set.* events`);
  }

  setupMessageHandler() {
    this.chat.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (!msg?.d?.body) return;

        const { body, type } = msg.d;

        switch (type) {
          case "user.update":
            this.dispatchEvent(
              new CustomEvent("message", {
                detail: { body, type: "user.update" },
              }),
            );
            break;

          case "emote_set.update":
            this.dispatchEvent(
              new CustomEvent("message", {
                detail: { body, type: "emote_set.update" },
              }),
            );
            break;

          case "cosmetic.create":
            updateCosmetics(body);

            this.dispatchEvent(
              new CustomEvent("message", {
                detail: { body: cosmetics, type: "cosmetic.create" },
              }),
            );
            break;

          case "entitlement.create":
            if (body.kind === 10) {
              this.dispatchEvent(
                new CustomEvent("message", {
                  detail: { body, type: "entitlement.create" },
                }),
              );
            }
            break;
        }
      } catch (error) {
        console.log("Error parsing message:", error);
      }
    };
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  close() {
    console.log(`[7TV]: Closing connection for chatroom ${this.channelKickID}`);
    this.shouldReconnect = false;

    if (this.chat) {
      try {
        if (this.chat.readyState === WebSocket.OPEN || this.chat.readyState === WebSocket.CONNECTING) {
          console.log(`[7TV]: WebSocket state: ${this.chat.readyState}, closing...`);
          this.chat.close();
        }
        this.chat = null;
        console.log(`[7TV]: Connection closed for chatroom ${this.channelKickID}`);
      } catch (error) {
        console.error(`[7TV]: Error during closing of connection for chatroom ${this.channelKickID}:`, error);
      }
    } else {
      console.log(`[7TV]: No active connection to close for chatroom ${this.channelKickID}`);
    }
  }
}

const argbToRgba = (color) => {
  if (color < 0) {
    color = color >>> 0;
  }

  const red = (color >> 24) & 0xff;
  const green = (color >> 16) & 0xff;
  const blue = (color >> 8) & 0xff;
  return `rgba(${red}, ${green}, ${blue}, 1)`;
};

export default StvWebSocket;
