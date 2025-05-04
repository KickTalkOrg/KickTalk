// This websocket class originally made by https://github.com/Fiszh and edited by ftk789

const cosmetics = {
  paints: [],
  badges: [],
}

async function updateCosmetics(body) {
  if (!body) { return; }

  if (body.object) {
      if (body.object.kind === "BADGE") {
          const object = body.object

          if (!object.user) {
              const data = object.data

              const foundBadge = cosmetics.badges.find(badge =>
                  badge &&
                  badge.id === (data && data.id === "00000000000000000000000000" ? data.ref_id : data.id)
              );

              if (foundBadge) { return; }

              cosmetics.badges.push({
                  id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
                  title: data.tooltip,
                  url: `${data.host.url}/${data.host.files[data.host.files.length - 1].name}`
              });
          }
      }

      if (body.object.kind === "PAINT") {
          const object = body.object

          if (!object.user) {
              const data = object.data

              const foundPaint = cosmetics.paints.find(paint =>
                  paint &&
                  paint.id === (data && data.id === "00000000000000000000000000" ? data.ref_id : data.id)
              );

              if (foundPaint) { return; }

              const randomColor = "#00f742";

              let push = {};

              if (data.stops.length) {
                  const normalizedColors = data.stops.map((stop) => ({
                      at: stop.at * 100,
                      color: stop.color
                  }));

                  const gradient = normalizedColors.map(stop =>
                      `${argbToRgba(stop.color)} ${stop.at}%`
                  ).join(', ');

                  if (data.repeat) {
                      data.function = `repeating-${data.function}`;
                  }

                  data.function = data.function.toLowerCase().replace('_', '-')

                  let isDeg_or_Shape = `${data.angle}deg`

                  if (data.function !== "linear-gradient" && data.function !== "repeating-linear-gradient") {
                      isDeg_or_Shape = data.shape
                  }

                  push = {
                      id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
                      name: data.name,
                      style: data.function,
                      shape: data.shape,
                      backgroundImage: `${data.function || "linear-gradient"}(${isDeg_or_Shape}, ${gradient})` || `${data.style || "linear-gradient"}(${data.shape || ""} 0deg, ${randomColor}, ${randomColor})`,
                      shadows: null,
                      KIND: 'non-animated',
                      url: data.image_url
                  }
              } else {
                  push = {
                      id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
                      name: data.name,
                      style: data.function,
                      shape: data.shape,
                      backgroundImage: `url('${[data.image_url]}')` || `${data.style || "linear-gradient"}(${data.shape || ""} 0deg, ${randomColor}, ${randomColor})`,
                      shadows: null,
                      KIND: 'animated',
                      url: data.image_url
                  }
              }

              // SHADOWS
              let shadow = null;

              if (data.shadows.length) {
                  const shadows = data.shadows;

                  shadow = await shadows.map(shadow => {
                      let rgbaColor = argbToRgba(shadow.color);

                      rgbaColor = rgbaColor.replace(/rgba\((\d+), (\d+), (\d+), (\d+(\.\d+)?)\)/, `rgba($1, $2, $3)`);

                      return `drop-shadow(${rgbaColor} ${shadow.x_offset}px ${shadow.y_offset}px ${shadow.radius}px)`;
                  }).join(' ');

                  push["shadows"] = shadow
              }

              cosmetics.paints.push(push);
          }
      } else if (body.object?.name === "Personal Emotes" || body.object?.name === "Personal Emotes Set" || body.object?.user || body.object?.id === "00000000000000000000000000" || (body.object?.flags && (body.object.flags === 11 || body.object.flags === 4))) {
          if (body.object?.id === "00000000000000000000000000" && body.object?.ref_id) {
              body.object.id = body.object.ref_id;
          }
      
          createCosmetic7TVProfile(body);
      } else if (body?.object?.kind == "BADGE") {
          const object = body.object
          const data = object.data

          const foundBadge = cosmetics.badges.find(badge =>
              badge &&
              badge.id === (data && data.id === "00000000000000000000000000" ? data.ref_id : data.id)
          );

          if (foundBadge) { return; }

          cosmetics.badges.push({
              id: data.id === "00000000000000000000000000" ? data.ref_id || "default_id" : data.id,
              title: data.tooltip,
              url: `${data.host.url}/${data.host.files[data.host.files.length - 1].name}`
          });
      } else {
          console.log("Didn't process", body);
      }
  }
  console.log("Cosmetics", cosmetics);
}

async function createCosmetic7TVProfile(body) {
  if ((!body.object.owner || !body.object.owner.id) && !body.object.user.id) {
      return;
  }

  const owner = body.object.owner || body.object.user;

  let infoTable = {
      lastUpdate: Date.now(),
      user_id: owner.id,
      ttv_user_id: null,
      paint_id: null,
      badge_id: null,
      avatar_url: null,
      personal_emotes: [],
      personal_set_id: [],
  };

  if (owner.connections) {
      const twitchConnection = owner.connections.find(connection => connection["platform"] === "TWITCH");
      if (twitchConnection) {
          infoTable["ttv_user_id"] = twitchConnection.id;
      }
  }

  if (owner.style) {
      const styleInfo = owner.style;
      if (styleInfo["paint_id"]) {
          infoTable["paint_id"] = styleInfo["paint_id"];
      }
      if (styleInfo["badge_id"]) {
          infoTable["badge_id"] = styleInfo["badge_id"];
      }
  }
}
class StvWebSocket extends EventTarget {
  constructor(channelKickID, stvId = "0", stvEmoteSetId = "0") {
    super();
    this.reconnectDelay = 5000;
    this.chat = null;
    this.channelKickID = String(channelKickID);
    this.stvId = stvId;
    this.stvEmoteSetId = stvEmoteSetId;
    this.shouldReconnect = true;
  }
  connect() {
    console.log(`[7TV]: Connecting to WebSocket`);

    this.chat = new WebSocket("wss://events.7tv.io/v3");

    this.chat.onopen = async () => {
      let waitStartTime = Date.now();
      console.log(`[7TV]: Connection opened`);

      while (Date.now() - waitStartTime < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      waitStartTime = Date.now();

      while ((this.stvId === "0" || this.stvEmoteSetId === "0") && Date.now() - waitStartTime < 10000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(`[7TV]: Subscribed to emote.set`);

      const subscribeuserMessage = {
        op: 35,
        t: Date.now(),
        d: {
          type: "user.*",
          condition: { object_id: this.stvId },
        },
      };

      if (this.stvId !== "0") {
        this.chat.send(JSON.stringify(subscribeuserMessage));

        console.log(`[7TV]: Subscribed to user.*`);
      }

      const subscribecosmeticcreate  = {
        op: 35,
        t: Date.now(),
        d: {
          type: "cosmetic.*",
          condition: { platform: "KICK", ctx: "channel", id: this.channelKickID },
        },
      };

      if (this.stvId !== "0") {
        this.chat.send(JSON.stringify(subscribecosmeticcreate));

        console.log(`[7TV]: Subscribed to subscribecosmeticcreate`);
      }


      const subscribeAllentitlements = {
        op: 35,
        t: Date.now(),
        d: {
          type: "entitlement.*",
          condition: { platform: "KICK", ctx: "channel", id: this.channelKickID },
        },
      };

      if (this.channelKickID !== "0") {
        this.chat.send(JSON.stringify(subscribeAllentitlements));

        console.log(`[7TV]: Subscribed to entitlement.update`);
      }

      const subscribeAllEmotes = {
        op: 35,
        t: Date.now(),
        d: {
          type: "emote.*",
          condition: { platform: "KICK", ctx: "channel", id: this.channelKickID },
        },
      };

      if (this.channelKickID !== "0") {
        this.chat.send(JSON.stringify(subscribeAllEmotes));

        console.log(`[7TV]: Subscribed to emote.*`);
      }

      const subscribeAllEmoteset = {
        op: 35,
        t: Date.now(),
        d: {
          type: "emote_set.*",
          condition: { object_id: this.stvEmoteSetId },
        },
      };

      if (this.channelKickID !== "0") {
        this.chat.send(JSON.stringify(subscribeAllEmoteset));

        console.log(`[7TV]: Subscribed to emote_set.*`);
      }

      this.chat.onmessage = (event) => {
        
        try {
          const msg = JSON.parse(event.data);

          if (msg && msg.d && msg.d.body) {
            const body = msg.d.body;
            const type = msg.d.type;
            switch (type) {
            case "user.update":
              console.log(type, body);
              this.dispatchEvent(
                new CustomEvent("message", {
                  detail: { body, type: "user.update", },
                })
              );
              break;
            case "cosmetic.create":
              console.log(type, body);
              updateCosmetics(body);
              this.dispatchEvent(
                new CustomEvent("message", {
                  detail: { body: cosmetics, type: "cosmetic.create", },
                })
              );
              break;
              case "entitlement.create":
                if(body.kind === 10){
                  console.log(type, body);
                  this.dispatchEvent(
                    new CustomEvent("message", {
                      detail: { body, type: "entitlement.create", },
                    })
                  );
                }
                break;
              case "emote_set.update":
                    console.log(type, body);
                    this.dispatchEvent(
                      new CustomEvent("message", {
                        detail: { body, type: "emote_set.update", },
                      })
                    );
                  break;
            }
            }
          } catch (error) {
            console.log("Error parsing message:", error);
          }
          };

         this.chat.onerror = (event) => {
         console.log(`[7TV]: Error: ${event.message}`);
      };
    };
  }

  close() {
    console.log(`Closing connection for chatroom ${this.chatroomNumber}`);
    this.shouldReconnect = false;

    if (this.chat && this.chat.readyState === WebSocket.OPEN) {
      try {
        this.chat.close();
        this.chat = null;
        console.log("WebSocket connection closed");
      } catch (error) {
        console.error("Error during closing of connection:", error);
      }
    }
  }
}

function argbToRgba(color) {
  if (color < 0) {
    color = color >>> 0;
  }

  const red = (color >> 24) & 0xff;
  const green = (color >> 16) & 0xff;
  const blue = (color >> 8) & 0xff;
  return `rgba(${red}, ${green}, ${blue}, 1)`;
}

export default StvWebSocket;
