import "@assets/styles/pages/ChatPage.scss";
import { useState, useEffect } from "react";
import { useSettings } from "../providers/SettingsProvider";
import useChatStore from "../providers/ChatProvider";
import Chat from "../components/Chat";
import Navbar from "../components/Navbar";
import TitleBar from "../components/TitleBar";
import Mentions from "../components/Dialogs/Mentions";

// Telemetry monitoring hook
const useTelemetryMonitoring = () => {
  useEffect(() => {
    const collectMetrics = () => {
      try {
        // Collect DOM node count
        const domNodeCount = document.querySelectorAll('*').length;
        window.app?.telemetry?.recordDomNodeCount(domNodeCount);

        // Collect renderer memory usage
        if (performance.memory) {
          const memoryData = {
            jsHeapUsedSize: performance.memory.usedJSHeapSize,
            jsHeapTotalSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          };
          window.app?.telemetry?.recordRendererMemory(memoryData);
        }
      } catch (error) {
        console.warn('Telemetry collection failed:', error);
      }
    };

    // Collect metrics initially
    collectMetrics();

    // Set up periodic collection every 10 seconds for testing
    const interval = setInterval(collectMetrics, 10000);

    return () => clearInterval(interval);
  }, []);
};

// Telemetry helpers
const getRendererTracer = () =>
  (typeof window !== 'undefined' && (window.__KT_TRACER__ || window.__KT_TRACE_API__?.trace?.getTracer?.('kicktalk-renderer-chatpage'))) || null;

const startSpan = (name, attributes = {}) => {
  try {
    const tracer = getRendererTracer();
    if (!tracer || typeof tracer.startSpan !== 'function') return null;
    const span = tracer.startSpan(name);
    try {
      if (span && attributes && typeof attributes === 'object') {
        Object.entries(attributes).forEach(([k, v]) => {
          try { span.setAttribute(k, v); } catch {}
        });
      }
    } catch {}
    return span;
  } catch {
    return null;
  }
};

const endSpanOk = (span) => {
  try { span?.setStatus?.({ code: 0 }); } catch {}
  try { span?.end?.(); } catch {}
};

const endSpanError = (span, err) => {
  try { span?.setStatus?.({ code: 2, message: (err && (err.message || String(err))) || '' }); } catch {}
  try { span?.end?.(); } catch {}
};

const ChatPage = () => {
  const { settings, updateSettings } = useSettings();
  const setCurrentChatroom = useChatStore((state) => state.setCurrentChatroom);

  const [activeChatroomId, setActiveChatroomId] = useState(null);
  const kickUsername = localStorage.getItem("kickUsername");
  const kickId = localStorage.getItem("kickId");
  
  // Instrumented chatroom switching with telemetry
  const handleChatroomSwitch = (newChatroomId) => {
    const switchSpan = startSpan('chatroom.switch', {
      'chatroom.from': activeChatroomId || 'none',
      'chatroom.to': newChatroomId || 'none',
      'switch.type': newChatroomId === 'mentions' ? 'mentions' : 'chatroom'
    });
    
    const startTime = performance.now();
    
    try {
      // Calculate unread messages for current chatroom before switching
      if (activeChatroomId) {
        try {
          const currentChatroomMessages = document.querySelectorAll(`[data-chatroom-id="${activeChatroomId}"] .message:not(.read)`);
          switchSpan?.setAttribute?.('previous.unread_count', currentChatroomMessages?.length || 0);
        } catch {}
      }
      
      setActiveChatroomId(newChatroomId);
      
      const switchDuration = performance.now() - startTime;
      switchSpan?.setAttributes?.({
        'switch.duration_ms': switchDuration,
        'switch.success': true
      });
      
      // Record metrics via IPC
      window.app?.telemetry?.recordChatroomSwitch?.(
        activeChatroomId,
        newChatroomId,
        switchDuration
      );
      
      switchSpan?.addEvent?.('chatroom_switch_completed');
      endSpanOk(switchSpan);
      
    } catch (error) {
      console.error('Error switching chatrooms:', error);
      switchSpan?.addEvent?.('chatroom_switch_error', { error: error.message });
      endSpanError(switchSpan, error);
      
      // Fallback to original setter
      setActiveChatroomId(newChatroomId);
    }
  };

  // Enable telemetry monitoring
  useTelemetryMonitoring();

  useEffect(() => {
    setCurrentChatroom(activeChatroomId);
  }, [activeChatroomId, setCurrentChatroom]);

  return (
    <div className="chatPageContainer">
      <TitleBar />
      <div className="chatWrapper">
        <div className="chatNavigation">
          <Navbar currentChatroomId={activeChatroomId} kickId={kickId} onSelectChatroom={handleChatroomSwitch} />
        </div>

        <div className="chatContent">
          {activeChatroomId && activeChatroomId !== "mentions" ? (
            <Chat
              chatroomId={activeChatroomId}
              kickUsername={kickUsername}
              kickId={kickId}
              settings={settings}
              updateSettings={updateSettings}
            />
          ) : activeChatroomId === "mentions" ? (
            <Mentions setActiveChatroom={setActiveChatroomId} chatroomId={activeChatroomId} />
          ) : (
            <div className="chatroomsEmptyState">
              <h1>No Chatrooms</h1>
              <p>Add a chatroom by using "CTRL"+"t" or clicking Add button</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
