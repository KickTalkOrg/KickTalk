export const scrollToBottom = (chatBodyRef, setShowScrollToBottom) => {
  if (!chatBodyRef.current) return;
  chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  setShowScrollToBottom(false);
};

export const convertMinutesToHumanReadable = (minutes) => {
  if (minutes < 60) {
    return `${minutes} ${minutes > 1 ? "minutes" : "minute"}`;
  } else if (minutes < 1440) {
    return `${Math.floor(minutes / 60)} ${Math.floor(minutes / 60) > 1 ? "hours" : "hour"}`;
  } else {
    return `${Math.floor(minutes / 1440)} ${Math.floor(minutes / 1440) > 1 ? "days" : "day"}`;
  }
};
