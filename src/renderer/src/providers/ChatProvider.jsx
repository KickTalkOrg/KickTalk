import { createContext, useContext, useReducer, useEffect } from "react";
import KickPusher from "../../../../utils/kickPusher";
import queueChannelFetch from "../../../../utils/fetchQueue";
import { chatroomErrorHandler } from "../utils/chatErrors";

const ChatContext = createContext(null);

const chatReducer = (state, action) => {
  switch (action.type) {
    case "ADD_CHATROOM":
      return {
        ...state,
        chatrooms: state.chatrooms.some((room) => room.id === action.payload.id)
          ? state.chatrooms
          : [...state.chatrooms, action.payload],
      };
    case "REMOVE_CHATROOM":
      const { [action.payload]: _, ...messages } = state.messages;
      const { [action.payload]: __, ...remainingConnections } = state.connections;

      return {
        ...state,
        chatrooms: state.chatrooms.filter((room) => room.id !== action.payload),
        messages: messages, 
        connections: remainingConnections,
      };
    case "ADD_MESSAGE":
      const chatroomMessages = state.messages[action.payload.chatroomId] || [];

      if (action.payload.message.id && chatroomMessages.some((msg) => msg.id === action.payload.message.id)) {
        return state;
      }

      const newMessages = [...chatroomMessages, action.payload.message].slice(-250);

      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.chatroomId]: newMessages,
        },
      };
    case "ADD_CONNECTION":
      console.log("Adding connection for:", action.payload.chatroomId);
      return {
        ...state,
        connections: {
          ...state.connections,
          [action.payload.chatroomId]: action.payload.connection,
        },
      };
    default:
      return state;
  }
};

export const ChatProvider = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, {
    chatrooms: [],
    messages: {},
    connections: {},
  });

  // Load saved chatrooms on app initial load
  useEffect(() => {
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];

    savedChatrooms.forEach((chatroom) => {
      if (!state.chatrooms.some((currentChatroom) => currentChatroom.id === chatroom.id)) {
        dispatch({ type: "ADD_CHATROOM", payload: chatroom });
        connectToChatroom(chatroom);
      }
    });
  }, []);

  const connectToChatroom = (chatroom) => {
    const pusher = new KickPusher(chatroom.id);

    pusher.addEventListener("connection", (event) => {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          chatroomId: chatroom.id,
          message: {
            id: crypto.randomUUID(),
            ...event?.detail,
            timestamp: new Date().toISOString(),
          },
        },
      });

      if (event.detail.content === "connection-success") {
        console.log(`Connected to chatroom: ${chatroom.id}`);
        dispatch({
          type: "ADD_CONNECTION",
          payload: {
            chatroomId: chatroom.id,
            connection: pusher,
          },
        });
      }
    });

    pusher.addEventListener("message", (event) => {
      const parsedEvent = JSON.parse(event.detail.data);

      // TODO: Handle Channel Doesnt Allow Links
      if (parsedEvent.type === "message") {
        dispatch({
          type: "ADD_MESSAGE",
          payload: {
            chatroomId: chatroom.id,
            message: {
              ...parsedEvent,
              timestamp: new Date().toISOString(),
            },
          },
        });

        window.app.logs.add({ chatroomId: chatroom.id, userId: parsedEvent.sender.id, message: parsedEvent });
      }
    });

    pusher.connect();

    return pusher;
  };

  const addChatroom = async (username) => {
    try {
      const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
      if (savedChatrooms.some((chatroom) => chatroom.username.toLowerCase() === username.toLowerCase())) {
        return;
      }

      const response = await queueChannelFetch(username);
      if (!response?.user) return;

      // Fetch 7TV Emotes
      const channel7TVEmotes = await window.app.utils.fetch7TVData(response.user.id);

      const newChatroom = {
        id: response.chatroom.id,
        username: response.user.username,
        slug: username,
        streamerData: response,
        channel7TVEmotes,
      };

      dispatch({ type: "ADD_CHATROOM", payload: newChatroom });
      connectToChatroom(newChatroom);

      // Save channel to local storage
      localStorage.setItem("chatrooms", JSON.stringify([...savedChatrooms, newChatroom]));

      return newChatroom;
    } catch (error) {
      console.error("Error adding chatroom:", error);
    }
  };

  const removeChatroom = (chatroomId) => {
    const connection = state.connections[chatroomId];

    if (!connection) return console.log("No connection found for chatroom:", chatroomId);

    console.log("Closing chatroom connection:", connection);

    connection.close();
    dispatch({ type: "REMOVE_CHATROOM", payload: chatroomId });
    
    // Remove chatroom from local storage
    const savedChatrooms = JSON.parse(localStorage.getItem("chatrooms")) || [];
    localStorage.setItem("chatrooms", JSON.stringify(savedChatrooms.filter((room) => room.id !== chatroomId)));
  };

  const sendMessage = async (chatroomId, content) => {
    try {
      const message = content.trim();
      console.info("Sending message to chatroom:", chatroomId);

      await window.app.kick.sendMessage(chatroomId, message);
      return true;
    } catch (error) {
      const errMsg = chatroomErrorHandler(error);

      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          chatroomId,
          message: {
            id: crypto.randomUUID(),
            type: "system",
            content: errMsg,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return;
    }
  };

  return (
    <ChatContext.Provider
      value={{
        state,
        sendMessage,
        addChatroom,
        removeChatroom,
      }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }

  return context;
};
