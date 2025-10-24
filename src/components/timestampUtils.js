/**
 * timestampUtils.js
 * Utility functions for handling and formatting timestamps with Luxon for timezone support.
 */
import { DateTime } from 'luxon';

/**
 * Safely convert any timestamp format to a Date object.
 * Handles: Firestore Timestamp, Date, millis number, {seconds, nanoseconds} object, or null.
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
    return new Date(timestamp); // Millis
  }
  if (timestamp.seconds != null) {
    // Firestore literal object
    return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000));
  }
  return null;
};

/**
 * Format time as HH:MM (e.g., 11:19)
 */
export const formatMessageTime = (timestamp) => {
  const date = getMessageDate(timestamp);
  if (!date) return '';
  const dt = DateTime.fromJSDate(date).setZone('Africa/Lagos');
  return dt.toFormat('HH:mm'); // e.g., "11:19"
};

/**
 * Get millis for sorting/comparison
 */
export const getTimestampMillis = (timestamp) => {
  const date = getMessageDate(timestamp);
  return date ? date.getTime() : 0;
};

/**
 * Format full timestamp for lists (date + time)
 * Returns { dateStr, timeStr, isoDate } where:
 * - dateStr: "Today", "Yesterday", short weekday, or "MMM D"
 * - timeStr: "HH:MM"
 * - isoDate: "YYYY-MM-DD" for comparisons
 */
export const formatTimestamp = (fbTimestamp) => {
  if (!fbTimestamp) return { dateStr: "", timeStr: "", isoDate: "" };
  const date = getMessageDate(fbTimestamp);
  if (!date) return { dateStr: "", timeStr: "", isoDate: "" };

  const dt = DateTime.fromJSDate(date).setZone('Africa/Lagos');
  const now = DateTime.now().setZone('Africa/Lagos');
  const diffDays = now.startOf('day').diff(dt.startOf('day'), 'days').days;

  let dateStr = "";
  if (diffDays === 0) {
    dateStr = "Today";
  } else if (diffDays === 1) {
    dateStr = "Yesterday";
  } else if (diffDays < 7) {
    dateStr = dt.toFormat('ccc'); // Short weekday, e.g., "Mon"
  } else {
    dateStr = dt.toFormat('MMM d'); // Short month and day, e.g., "Oct 24"
  }

  const timeStr = dt.toFormat('HH:mm'); // e.g., "11:19"
  const isoDate = dt.toISODate(); // e.g., "2025-10-24"

  return { dateStr, timeStr, isoDate };
};