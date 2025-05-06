import { memo, useState, useCallback, useEffect } from "react";
import LinkTooltip from "./LinkTooltip";
import { getLinkThumbnail } from "../../../../../utils/services/kick/kickAPI";

const LinkPreview = memo(({ url }) => {
  const [showLinkInfo, setShowLinkInfo] = useState(true);
  const [mousePos, setMousePos] = useState({ x: null, y: null });
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPreviewData = async () => {
      try {
        const data = await getLinkThumbnail(url);
        setPreviewData(data);
      } catch (error) {
        console.error("Error fetching link preview:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPreviewData();
  }, [url]);

  const handleMouseEnter = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    setShowLinkInfo(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowLinkInfo(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (showLinkInfo) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    },
    [showLinkInfo],
  );

  return (
    <span className="chatroomLinkPreviewWrapper">
      {loading && !previewData ? (
        <div className="chatroomLinkPreview">
          <div className="chatroomLinkPreviewSkeleton" />
        </div>
      ) : (
        <LinkTooltip showLinkInfo={showLinkInfo} mousePos={mousePos} linkInfo={previewData} />
      )}
      <div
        className="chatroomLinkPreview"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}>
        <a className="linkPreview" href={url} style={{ color: "#c3d6c9" }} target="_blank" rel="noreferrer">
          {url}
        </a>
      </div>
    </span>
  );
});

export default LinkPreview;
