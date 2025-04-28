const SystemMessage = ({ content }) => {
  const messageMap = {
    "connection-pending": "Connecting to Channel...",
    "connection-success": "Connected to Channel",
  };

  return <span className="systemMessage">{messageMap[content] || content}</span>;
};

export default SystemMessage;
