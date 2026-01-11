import { DateTime } from 'luxon';

/**
 * Safely convert any timestamp format to a Date object.
 */
export const getMessageDate = (timestamp) => {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate(); // Firestore Timestamp
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  if (timestamp.seconds != null) {
    return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000));
  }
  return null;
};

/**
 * Format time as "11:19 AM" or "03:45 PM"
 */
export const formatMessageTime = (timestamp) => {
  const date = getMessageDate(timestamp);
  if (!date) return '';
  const dt = DateTime.fromJSDate(date).setZone('Africa/Lagos');
  return dt.toFormat('h:mm a').toLowerCase(); // → "11:19 am", "3:45 pm"
};

/**
 * Get millis for sorting/comparison
 */
export const getTimestampMillis = (timestamp) => {
  const date = getMessageDate(timestamp);
  return date ? date.getTime() : 0;
};

/**
 * Format full timestamp for chat lists
 * Returns { dateStr, timeStr, isoDate }
 * timeStr now includes AM/PM
 */
export const formatTimestamp = (fbTimestamp) => {
  if (!fbTimestamp) return { dateStr: "", timeStr: "", isoDate: "" };
  const date = getMessageDate(fbTimestamp);
  if (!date) return { dateStr: "", timeStr: "", isoDate: "" };

  const dt = DateTime.fromJSDate(date).setZone('Africa/Lagos');
  const now = DateTime.now().setZone('Africa/Lagos');
  const diffDays = Math.floor(now.startOf('day').diff(dt.startOf('day'), 'days').days);

  let dateStr = "";
  if (diffDays === 0) {
    dateStr = "Today";
  } else if (diffDays === 1) {
    dateStr = "Yesterday";
  } else if (diffDays < 7) {
    dateStr = dt.toFormat('ccc'); // Mon, Tue, etc.
  } else {
    dateStr = dt.toFormat('MMM d'); // Oct 24
  }

  // This is the line you wanted changed
  const timeStr = dt.toFormat('h:mm a').toLowerCase(); // "11:19 am"

  const isoDate = dt.toISODate(); // "2025-10-24"

  return { dateStr, timeStr, isoDate };
};