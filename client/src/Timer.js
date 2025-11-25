import React, {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import './App.css';

const Timer = forwardRef((props, ref) => {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);

  // Expose start/stop/reset to parent via ref
  useImperativeHandle(ref, () => ({
    start() {
      if (intervalRef.current) return; // prevent multiple intervals
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    },
    stop() {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    },
    reset() {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setSeconds(0);
    },
  }));

  // Cleanup when unmounts
  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  const formatTime = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs === 0) {
      return `${String(mins).padStart(2, "0")}:${String(secs).padStart(
        2,
        "0"
      )}`;
    }
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )}`;
  };

  return <div className="timer">{formatTime(seconds)}</div>;
});

export default Timer;
