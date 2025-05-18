import { memo } from "react";

const Predictions = memo(
  ({ showChatters, showPollMessage, setShowPollMessage, pollData }) => {},
  (prevProps, nextProps) => {
    return prevProps.pollData === nextProps.pollData && prevProps.showPollMessage === nextProps.showPollMessage;
  },
);

export default Predictions;
