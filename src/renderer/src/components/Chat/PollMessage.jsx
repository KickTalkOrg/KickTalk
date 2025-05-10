import { clsx } from "clsx";
import { memo, useState } from "react";
import dayjs from "dayjs";
import CaretDown from "../../assets/icons/caret-down-bold.svg?asset";

const PollMessage = memo(
  ({ showChatters, showPollMessage, setShowPollMessage, pollData }) => {
    if (!pollData) return null;

    const [selectedOption, setSelectedOption] = useState(null);
    const [hasVoted, setHasVoted] = useState(pollData?.has_voted || false);
    const [poll, setPoll] = useState(pollData);
    const [isPollExpanded, setIsPollExpanded] = useState(false);

    const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);

    const handleVote = (optionId) => {
      if (hasVoted) return;

      const updatedOptions = poll.options.map((option) =>
        option.id === optionId ? { ...option, votes: option.votes + 1 } : option
      );

      setPoll({ ...poll, options: updatedOptions, has_voted: true, voted_option_id: optionId });
      setSelectedOption(optionId);
      setHasVoted(true);
    };

    return (
      <div className={clsx("pollMessage", showPollMessage && !showChatters && "open", isPollExpanded && "expanded")}>
        <div className="pollMessageHeader">
          <p>Poll: {poll.title}</p>
          <div className="pollMessageActions">
            <button onClick={() => setIsPollExpanded(!isPollExpanded)}>
              <img
                src={CaretDown}
                width={16}
                height={16}
                alt="Expand Poll"
                style={{ transform: isPollExpanded ? "rotate(180deg)" : "none" }}
              />
            </button>
            <button onClick={() => setShowPollMessage(!showPollMessage)}>
buh            </button>
          </div>
        </div>
        <div className="pollMessageContent">
          {poll.options.map((option) => {
            const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;

            return (
              <div key={option.id} className="pollOption">
                <div className="pollOptionLabel">
                  <span>{option.label}</span>
                  <span>{`${option.votes} votes (${percentage.toFixed(1)}%)`}</span>
                </div>
                <div className="pollOptionBar">
                  <div
                    className="pollOptionBarFill"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                {!hasVoted && (
                  <button
                    className="pollVoteButton"
                    onClick={() => handleVote(option.id)}
                  >
                    Vote
                  </button>
                )}
                {hasVoted && selectedOption === option.id && (
                  <span className="pollVotedLabel">You voted</span>
                )}
              </div>
            );
          })}
        </div>
        <div className={clsx("pollMessageFooter", isPollExpanded && "open")}>
          <span>
            Poll ends {poll.remaining && `${dayjs().add(poll.remaining, "second").fromNow()}`}
          </span>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.pollData === nextProps.pollData && prevProps.showPollMessage === nextProps.showPollMessage;
  },
);

export default PollMessage;
