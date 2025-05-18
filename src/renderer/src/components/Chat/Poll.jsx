import { clsx } from "clsx";
import { memo, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import CaretDown from "../../assets/icons/caret-down-bold.svg?asset";
import CloseIcon from "../../assets/icons/x-bold.svg?asset";
import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

const Poll = memo(
  ({ showChatters, showPollMessage, setShowPollMessage, pollDetails, handlePollDelete, chatroomId }) => {
    if (!pollDetails) return null;

    const [percentRemaining, setPercentRemaining] = useState(0);

    const [selectedOption, setSelectedOption] = useState(null);
    const [hasVoted, setHasVoted] = useState(pollDetails?.has_voted || false);
    const [poll, setPoll] = useState(pollDetails);
    const [isPollExpanded, setIsPollExpanded] = useState(false);

    const intervalTimerRef = useRef(null);

    const totalVotes = pollDetails?.options.reduce((sum, option) => sum + option.votes, 0);

    const handleVote = (optionId) => {
      if (hasVoted) return;

      const updatedOptions = pollDetails?.options.map((option) =>
        option.id === optionId ? { ...option, votes: option.votes + 1 } : option,
      );

      setPoll({ ...pollDetails, options: updatedOptions, has_voted: true, voted_option_id: optionId });
      setSelectedOption(optionId);
      setHasVoted(true);
    };

    const deletePoll = () => {
      handlePollDelete(chatroomId);
      setShowPollMessage(false);
    };

    useEffect(() => {
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      if (!pollDetails?.duration) return;

      if (pollDetails.remaining === 0) {
        setPercentRemaining(0);
        setTimeout(deletePoll, pollDetails?.result_display_duration * 1000 || 15000);
        return;
      }

      const startTime = dayjs(pollDetails?.created_at);
      const endTime = dayjs(startTime).add(pollDetails.duration, "seconds");

      intervalTimerRef.current = setInterval(() => {
        const now = dayjs();
        const secondsRemaining = endTime.diff(now, "seconds");

        if (secondsRemaining <= 0) {
          clearInterval(intervalTimerRef.current);
          setPercentRemaining(0);

          console.log(startTime, endTime, now, secondsRemaining, pollDetails?.result_display_duration, pollDetails);

          setTimeout(deletePoll, pollDetails?.result_display_duration * 1000 || 15000);

          return;
        }

        setPercentRemaining((secondsRemaining / pollDetails.duration) * 100);
      }, 1000);

      return () => {
        if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      };
    }, [pollDetails]);

    return (
      <div className={clsx("poll", showPollMessage && !showChatters && "open", isPollExpanded && "expanded")}>
        <div className="pollHeader">
          <div className="pollHeaderInfo">
            <h4>Current Poll:</h4>
            <span>{poll.title}</span>
          </div>
          <div className="pollActions">
            <button onClick={() => setIsPollExpanded(!isPollExpanded)}>
              <img
                src={CaretDown}
                width={24}
                height={24}
                alt="Expand Poll"
                style={{ transform: isPollExpanded ? "rotate(180deg)" : "none" }}
              />
            </button>
            <button onClick={() => setShowPollMessage(!showPollMessage)}>
              <img src={CloseIcon} width={20} height={20} alt="Close Poll" />
            </button>
          </div>
        </div>
        <div className="pollOptions">
          {poll.options.map((option) => {
            const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;

            return (
              <div key={option.id} className="pollOption">
                <button
                  className={clsx("pollOptionBtn", hasVoted && selectedOption === option.id && "voted")}
                  onClick={() => setSelectedOption(option.id)}></button>
                <div className="pollOptionLabel">
                  <p>{option.label}</p>
                  <span>{`${option.votes} votes (${percentage.toFixed(1)}%)`}</span>
                </div>
                <div className="pollOptionBar">
                  <div className="pollOptionBarFill" style={{ width: `${percentage}%` }}></div>
                </div>
                {/* {!hasVoted && (
                  <button className="pollVoteButton" onClick={() => handleVote(option.id)}>
                    Vote
                  </button>
                )} */}
                {hasVoted && selectedOption === option.id && <span className="pollVotedLabel">You voted</span>}
              </div>
            );
          })}
        </div>
        <div className={"pollFooter"}>
          <div className="pollTimer">
            <span style={{ width: `${percentRemaining}%` }} />
          </div>

          {/* <div className="pollMessageFooterContent">
            <span>Poll ends {pollDetails?.remaining && `${dayjs().add(pollDetails?.remaining, "second").fromNow()}`}</span>
          </div> */}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.pollDetails === nextProps.pollDetails && prevProps.showPollMessage === nextProps.showPollMessage;
  },
);

export default Poll;
