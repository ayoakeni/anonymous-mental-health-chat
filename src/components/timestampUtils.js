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
 * Format time as HH:MM (e.g., 03:45 PM)
 */
export const formatMessageTime = (timestamp) => {
  const date = getMessageDate(timestamp);
  return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
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
 */
export const formatTimestamp = (fbTimestamp) => {
  if (!fbTimestamp) return { dateStr: "", timeStr: "" };
  const date = getMessageDate(fbTimestamp);
  if (!date) return { dateStr: "", timeStr: "" };
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let dateStr = "";
  if (diffDays === 0) dateStr = "Today";
  else if (diffDays === 1) dateStr = "Yesterday";
  else if (diffDays < 7) dateStr = date.toLocaleDateString([], { weekday: "short" });
  else dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return { dateStr, timeStr };
};