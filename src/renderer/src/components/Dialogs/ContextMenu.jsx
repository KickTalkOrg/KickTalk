import { useEffect, useState } from "react";
import "../../assets/styles/dialogs/UserDialog.scss";
import ArrowUpRightIcon from "../../assets/icons/arrow-up-right-bold.svg";

const ContextMenu = (data) => {
  const [dialogData, setDialogData] = useState(null);

  useEffect(() => {
    const handleContextMenuData = (data) => {
      setDialogData(data);
    };

    const contextMenuDataCleanup = window.app.contextMenu.onData(handleContextMenuData);
    return () => contextMenuDataCleanup();
  }, []);

  return (
    <>
      {dialogData?.type === "message" && (
        <div className="contextMenuWrapper">
          <div className="contextMenuItem">
            <p>asdasd</p>
          </div>
        </div>
      )}

      {dialogData?.type === "streamer" && (
        <div className="contextMenuWrapper">
          <button className="contextMenuItem" onClick={() => window.app.utils.openExternal(dialogData?.data?.url)}>
            <span>Open Stream in Browser</span>
            <img src={ArrowUpRightIcon} width={16} height={16} />
          </button>
        </div>
      )}
    </>
  );
};

export default ContextMenu;
