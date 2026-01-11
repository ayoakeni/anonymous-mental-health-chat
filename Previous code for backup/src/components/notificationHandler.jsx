import { useEffect } from "react";
import { requestForToken } from "../utils/requestForToken";

const NotificationHandler = () => {
  useEffect(() => {
    const setup = async () => {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        await requestForToken();

        // Auto-refresh every 12 hours
        const interval = setInterval(requestForToken, 12 * 60 * 60 * 1000);
        return () => clearInterval(interval);
      }
    };
    setup();
  }, []);

  return null; // invisible component
};

export default NotificationHandler;