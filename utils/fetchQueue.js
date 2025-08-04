const fetchQueue = [];
let isFetching;

const processQueue = async () => {
  if (isFetching || fetchQueue.length === 0) return;

  isFetching = true;
  const { input, resolve, reject } = fetchQueue.shift();

  const apiStart = Date.now();
  try {
    const response = await window.app.kick.getChannelInfo(input);

    // Telemetry: API metrics (guarded by settings in main handler)
    try {
      const statusCode = response?.status || response?.data?.status?.code || 200;
      const duration = (Date.now() - apiStart) / 1000;
      await window.app?.telemetry?.recordAPIRequest?.('kick_get_channel_info', 'GET', statusCode, duration);
    } catch (_) {}

    resolve(response);
  } catch (error) {
    console.error("Error fetching data:", error);

    // Telemetry: record failed API attempt
    try {
      const duration = (Date.now() - apiStart) / 1000;
      await window.app?.telemetry?.recordAPIRequest?.('kick_get_channel_info', 'GET', 500, duration);
    } catch (_) {}

    resolve("error");
  } finally {
    isFetching = false;
    processQueue();
  }
};

const queueChannelFetch = (input) => {
  return new Promise((resolve, reject) => {
    fetchQueue.push({ input, resolve, reject });
    processQueue();
  });
};

export default queueChannelFetch;
