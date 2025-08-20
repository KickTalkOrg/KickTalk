import { CHAT_ERROR_CODES } from "@utils/constants";

export const chatroomErrorHandler = (error) => {
  const errorCode = error?.response?.data?.status?.message || error?.code;
  return CHAT_ERROR_CODES[errorCode] || "An error occurred while sending your message.";
};
