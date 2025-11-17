import { clsx } from "clsx";
import { memo, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import CaretDown from "../../assets/icons/caret-down-bold.svg?asset";
import CloseIcon from "../../assets/icons/x-bold.svg?asset";
import TrashIcon from "../../assets/icons/trash-fill.svg?asset";
import TrophyIcon from "../../assets/icons/trophy.svg?asset";
import duration from "dayjs/plugin/duration";
import log from "electron-log";

console.log = log.log;


dayjs.extend(duration);

const Poll = memo(
  ({ pollDetails, showChatters, showPollMessage, setShowPollMessage, canModerate, chatroomId }) => {
    // const [pollDetails, setPollDetails] = useState({
    //   title: "test",
    //   duration: 300,
    //   result_display_duration: 300,
    //   created_at: "2025-05-21T11:05:26.303172Z",
    //   options: [
    //     {
    //       id: 0,
    //       label: "13",
    //       votes: 3,
    //     },
    //     {
    //       id: 1,
    //       label: "14",
    //       votes: 2,
    //     },
    //   ],
    //   remaining: 68,
    //   has_voted: false,
    //   voted_option_id: null,
    // });

    if (!pollDetails?.title) return null;

    const [poll, setPoll] = useState(pollDetails);
    const [percentRemaining, setPercentRemaining] = useState(0);

    const [selectedOption, setSelectedOption] = useState(pollDetails?.voted_option_id || null);
    const [hasVoted, setHasVoted] = useState(pollDetails?.has_voted || false);
    const [pollWinner, setPollWinner] = useState(null);
    const [isPollExpanded, setIsPollExpanded] = useState(false);

    const isPollEnded = pollDetails?.remaining <= 0;

    const currentTime = Date.now();
    let startTime = pollDetails?.start_time || currentTime;
    let endTime = null;

    const intervalTimerRef = useRef(null);

    const totalVotes = pollDetails?.options.reduce((sum, option) => sum + option.votes, 0);
    const calculatePercentage = (votes) => (totalVotes === 0 ? 0 : (votes / totalVotes) * 100);

    // const handleVote = async (optionId) => {
    //   if (hasVoted || pollWinner) return;

    //   const response = await window.app.kick.getSubmitPollVote(chatroomName, optionId);

    //   if (response?.status?.code === 200) {
    //     const updatedOptions = pollDetails?.options.map((option) =>
    //       option.id === optionId ? { ...option, votes: option.votes + 1 } : option,
    //     );

    //     const updatedPoll = {
    //       ...pollDetails,
    //       options: updatedOptions,
    //       has_voted: true,
    //       voted_option_id: optionId,
    //     };

    //     await handlePollUpdate(chatroomId, updatedPoll);
    //     setPoll(updatedPoll);
    //     setSelectedOption(optionId);
    //     setHasVoted(true);

    //     return true;
    //   }

    //   return false;
    // };

    // const modDeletePoll = () => {
    //   if (!canModerate) return;
    //   handlePollDelete(chatroomId);
    //   setShowPollMessage(false);
    // };

    // const deletePoll = () => {
    //   handlePollDelete(chatroomId);
    //   setShowPollMessage(false);
    // };

    useEffect(() => {
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      if (!pollDetails?.duration) return;

      // if (pollDetails.remaining === 0) {
      //   setPercentRemaining(0);
      //   setTimeout(deletePoll, pollDetails?.result_display_duration * 1000 || 15000);
      //   return;
      // }

      if (pollDetails.remaining > 0) {
        endTime = currentTime + pollDetails.remaining * 1000;
        console.log(`[Kick]: (Poll Event - ${chatroomId}) Poll will end at ${new Date(endTime).toLocaleTimeString()}`);
      } else {
        endTime = dayjs(pollDetails?.end_time || null);
        console.log(`[Kick]: (Poll Event - ${chatroomId}) Poll has already ended.`);
      }

      if (isPollEnded) {
        setPercentRemaining(0);
        console.log(
          `[Kick]: (Poll Event - ${chatroomId}) Poll has ended. Displaying results for ${pollDetails?.result_display_duration} seconds.`,
        );

        try {
          // Log Votes for Each Option
          pollDetails.options.forEach((option) => {
            console.log(`[Kick]: (Poll Event - ${chatroomId}) Option ${option.id}-${option.label} has ${option.votes} votes.`);
          });

          // Find Max Number of Possible Votes
          const maxVotes = Math.max(...pollDetails.options.map((opt) => opt.votes));
          console.log(`[Kick]: (Poll Event - ${chatroomId}) Max Number of Votes: ${maxVotes}`);

          if (maxVotes > 0) {
            const optionsWithMaxVotes = pollDetails.options.filter((opt) => opt.votes === maxVotes);

            if (optionsWithMaxVotes.length > 0) {
              setPollWinner(optionsWithMaxVotes[0].id);
              console.log(
                `[Kick]: (Poll Event - ${chatroomId}) Winner Option: ${optionsWithMaxVotes[0].id}-${optionsWithMaxVotes[0].label}`,
              );
            }
          }
        } catch (error) {}

        return;
      }

      // const startTime = dayjs(pollDetails?.created_at);
      // const endTime = dayjs(startTime).add(pollDetails.duration, "seconds");

      // intervalTimerRef.current = setInterval(() => {
      //   const now = dayjs();
      //   const secondsRemaining = endTime.diff(now, "seconds");

      //   if (secondsRemaining <= 0) {
      //     clearInterval(intervalTimerRef.current);
      //     setPercentRemaining(0);
      //     setTimeout(deletePoll, pollDetails?.result_display_duration * 1000 || 15000);
      //     return;
      //   }

      //   setPercentRemaining((secondsRemaining / pollDetails.duration) * 100);
      // }, 1000);

      // return () => {
      //   if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      // };
    }, [pollDetails]);

    return (
      <div className={clsx("poll", showPollMessage && !showChatters && "open", isPollExpanded && "expanded")}>
        <div className="pollHeader">
          <div className="pollHeaderInfo">
            <h4>Current Poll:</h4>
            <span>{pollDetails?.title}</span>
          </div>
          <div className="pollActions">
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
              <img src={CloseIcon} width={14} height={14} alt="Close Poll" />
            </button>
            {canModerate && (
              <button onClick={modDeletePoll}>
                <img src={TrashIcon} width={14} height={14} alt="Delete Poll" />
              </button>
            )}
          </div>
        </div>
        <div className={clsx("pollOptions", hasVoted && "pollOptionsVoted", pollWinner && "pollOptionsWinner")}>
          {pollDetails?.options?.map((option) => {
            // Percentage of Votes for this Option
            const percentage = calculatePercentage(option.votes);

            // Has Voted For this Option
            const hasVoted = pollDetails?.voted_option_id === option.id;

            // Option has Won
            const isSelected = selectedOption === option.id;
            const isWinner = pollWinner === option.id && isPollEnded;

            return (
              <button
                key={option.id}
                onClick={() => {
                  if (pollWinner || hasVoted) return;
                  setSelectedOption(option.id);
                }}
                className={clsx("pollOption", isWinner && "pollOptionWon")}>
                <div className="pollOptionLabel">
                  <div className="pollOptionLabelContent">
                    <p>{option.label}</p>
                    <div className="pollOptionLabelStatus">
                      {hasVoted && <span id="pollOptionVotedLabel">VOTED</span>}
                      {isWinner && (
                        <span id="pollOptionWonLabel">
                          WON <img src={TrophyIcon} width={14} height={14} alt="Trophy" />
                        </span>
                      )}
                    </div>
                  </div>

                  <span>{`${option.votes > 0 ? `${option.votes === 1 ? `${option.votes} Vote` : `${option.votes} Votes`}` : "No Votes"} [${percentage.toFixed(1)}%]`}</span>
                </div>
                <div className="pollOptionBar">
                  <div
                    className="pollOptionBarFill"
                    style={{
                      width: `${percentage}%`,
                      transition: "width 0.2s ease-out",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
        <div className={"pollFooter"}>
          {!hasVoted && percentRemaining > 0 && (
            <button className="pollVoteButton" onClick={() => handleVote(selectedOption)}>
              Submit
            </button>
          )}

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
