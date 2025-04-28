import { create } from "zustand";
import KickPusher from "../../../../utils/services/kick/kickPusher";
import { chatroomErrorHandler } from "../utils/chatErrors";
import queueChannelFetch from "../../../../utils/fetchQueue";

// Load initial state from local storage
const getInitialState = () => {
  const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
  return {
    chatrooms: savedChatrooms,
    messages: {},
    connections: {},
  };
};

const useChatStore = create((set, get) => ({
  ...getInitialState(),

  sendMessage: async (chatroomId, content) => {
    try {
      const message = content.trim();
      console.info("Sending message to chatroom:", chatroomId);

      await window.app.kick.sendMessage(chatroomId, message);
      return true;
    } catch (error) {
      const errMsg = chatroomErrorHandler(error);

      set((state) => ({
        messages: {
          ...state.messages,
          [chatroomId]: [
            ...(state.messages[chatroomId] || []),
            {
              id: crypto.randomUUID(),
              type: "system",
              content: errMsg,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }));

      return false;
    }
  },

  addMessage: (chatroomId, message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatroomId]: [...(state.messages[chatroomId] || []), { ...message, deleted: false }].slice(-300), // Keep last 300 messages
      },
    }));
  },

  connectToChatroom: (chatroom) => {
    const pusher = new KickPusher(chatroom.id);

    // Connection Events
    pusher.addEventListener("connection", (event) => {
      console.info("Connected to chatroom:", chatroom.id);

      get().addMessage(chatroom.id, {
        id: crypto.randomUUID(),
        type: "system",
        ...event?.detail,
        timestamp: new Date().toISOString(),
      });
    });

    // Channel Events
    // pusher.addEventListener("channel", (event) => {
    //   const parsedEvent = JSON.parse(event.detail.data);
    //   console.log(event);
    //   switch (event.detail.event) {
    //     case "App\\Events\\ChatroomUpdatedEvent":
    //       get().handleChatroomUpdated(chatroom.id, parsedEvent);
    //       break;
    //     case "App\\Events\\PinnedMessageCreatedEvent":
    //       get().handlePinnedMessageCreated(chatroom.id, parsedEvent);
    //       break;
    //     case "App\\Events\\PinnedMessageDeletedEvent":
    //       get().handlePinnedMessageDeleted(chatroom.id, parsedEvent);
    //       break;
    //   }
    // });

    // Message Events
    pusher.addEventListener("message", (event) => {
      const parsedEvent = JSON.parse(event.detail.data);

      switch (event.detail.event) {
        case "App\\Events\\ChatMessageEvent":
          get().addMessage(chatroom.id, {
            ...parsedEvent,
            timestamp: new Date().toISOString(),
          });

          window.app.logs.add({
            chatroomId: chatroom.id,
            userId: parsedEvent.sender.id,
            message: parsedEvent,
          });
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

    pusher.connect();

    const fetchEmotes = async () => {
      const { data } = await window.app.kick.getEmotes(chatroom.slug);
      set((state) => ({
        chatrooms: state.chatrooms.map((room) => {
          if (room.id === chatroom.id) {
            return { ...room, emotes: data };
          }
          return room;
        }),
      }));
    };

    fetchEmotes();

    set((state) => ({
      connections: {
        ...state.connections,
        [chatroom.id]: pusher,
      },
    }));
  },

  addChatroom: async (username) => {
    try {
      const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
      if (savedChatrooms.some((chatroom) => chatroom.username.toLowerCase() === username.toLowerCase())) {
        return;
      }

      const response = await queueChannelFetch(username);
      if (!response?.user) return;

      const channel7TVEmotes = await window.app.utils.fetch7TVData(response.user.id);

      const newChatroom = {
        id: response.chatroom.id,
        username: response.user.username,
        slug: username,
        streamerData: response,
        channel7TVEmotes,
      };

      set((state) => ({
        chatrooms: [...state.chatrooms, newChatroom],
      }));

      // Connect to chatroom
      get().connectToChatroom(newChatroom);

      // Save to local storage
      localStorage.setItem("chatrooms", JSON.stringify([...savedChatrooms, newChatroom]));

      return newChatroom;
    } catch (error) {
      console.error("[Chatroom Store]: Error adding chatroom:", error);
    }
  },

  removeChatroom: (chatroomId) => {
    const { connections } = get();
    const connection = connections[chatroomId];
    if (connection) connection.close();

    set((state) => {
      const { [chatroomId]: _, ...messages } = state.messages;
      const { [chatroomId]: __, ...connections } = state.connections;

      return {
        chatrooms: state.chatrooms.filter((room) => room.id !== chatroomId),
        messages,
        connections,
      };
    });

    // Remove chatroom from local storage
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
    localStorage.setItem("chatrooms", JSON.stringify(savedChatrooms.filter((room) => room.id !== chatroomId)));
  },

  initializeConnections: () => {
    get().chatrooms.forEach((chatroom) => {
      if (!get().connections[chatroom.id]) {
        get().connectToChatroom(chatroom);
      }
    });
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
  },
}));

// Initialize connections when the store is created
useChatStore.getState().initializeConnections();

export default useChatStore;
