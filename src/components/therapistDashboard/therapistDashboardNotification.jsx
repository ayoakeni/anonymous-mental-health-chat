import { formatTimestamp } from "../../components/timestampUtils";
import "../../styles/therapistDashboardNotification.css";

function TherapistDashboardNotification({
  notifications,
  notificationFilter,
  setNotificationFilter,
  markAllAsRead,
  resetDismissed,
  onView,
  onMarkAsRead,
  onDismiss,
  formatTimestamp: formatFn,
}) {
  const filtered = notifications.filter((n) => {
    if (notificationFilter === "unread") return n.unreadCount > 0 && !n.isDismissed;
    if (notificationFilter === "dismissed") return n.isDismissed;
    return true;
  });

  // Count unread private chats
  const hasUnreadPrivate = notifications.some(
    (n) => n.type === "private" && n.unreadCount > 0 && !n.isDismissed
  );

  const hasDismissed = notifications.some((n) => n.isDismissed);

  return (
    <div className="notifications">
      <div className="notifications-header">
        <h3>Notifications</h3>
        <div className="notification-controls">
          <select
            value={notificationFilter}
            onChange={(e) => setNotificationFilter(e.target.value)}
            className="notification-filter"
            aria-label="Filter notifications"
          >
            <option value="all">All Notifications</option>
            <option value="unread">Unread Only</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <button
            onClick={markAllAsRead}
            disabled={!hasUnreadPrivate}
            className="mark-all-read"
          >
            Mark All as Read
          </button>
          <button
            onClick={resetDismissed}
            disabled={!hasDismissed}
            className="reset-dismissed"
          >
            Reset Dismissed
          </button>
        </div>
      </div>

      <ul className="notification-list">
        {filtered.length === 0 ? (
          <li className="no-notifications">No notifications to display</li>
        ) : (
          filtered.map((notif) => {
            const { dateStr, timeStr } = formatFn(notif.timestamp);
            return (
              <li
                key={notif.id}
                className={`notification-item ${
                  notif.unreadCount > 0 ? "unread" : ""
                } ${notif.isDismissed ? "dismissed" : ""}`}
              >
                <div className="notification-content">
                  <span className="notification-message">{notif.message}</span>
                  <span className="notification-timestamp">
                    {dateStr} at {timeStr}
                  </span>
                </div>
                <div className="notification-actions">
                  {notif.type === "private" && notif.unreadCount > 0 && !notif.isDismissed && (
                    <button
                      className="mark-read-btn"
                      onClick={() => onMarkAsRead(notif.id)}
                    >
                      Mark as Read
                    </button>
                  )}
                  {!notif.isDismissed && (
                    <button
                      className="dismiss-btn"
                      onClick={() => onDismiss(notif.id)}
                    >
                      Dismiss
                    </button>
                  )}
                  <button
                    className="view-btn"
                    onClick={() => onView(notif)}
                  >
                    View
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export default TherapistDashboardNotification;