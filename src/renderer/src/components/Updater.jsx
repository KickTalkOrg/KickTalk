import { useEffect, useState } from "react";


const Updater = () => {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    const callbackFunction = (update) => {
      console.log("update", update);
      setUpdate(update);
    }
    const cleanup = window.app.update.onUpdate(callbackFunction);
    console.log(cleanup);
    return () => {
      cleanup();
    };
  }, []);
  return <div></div>;
};

export default Updater;
