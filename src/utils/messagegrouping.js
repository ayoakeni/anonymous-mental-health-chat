/**
 * Determines if a message should be grouped with the previous message
 * Messages are grouped when:
 * 1. They're from the same user (same userId)
 * 2. They're within 5 minutes of each other
 * 3. Neither message is a system message
 * 4. The previous message is not deleted
 * 
 * @param {Object} currentMsg - The current message object
 * @param {Object} previousMsg - The previous message object
 * @param {number} timeDiffMinutes - Max time difference in minutes to group (default: 5)
 * @returns {boolean} - Whether the message should be grouped
 */
export const shouldGroupMessage = (currentMsg, previousMsg, timeDiffMinutes = 5) => {
  // Don't group if there's no previous message
  if (!previousMsg || !currentMsg) return false;

  // Don't group system messages
  if (currentMsg.role === "system" || previousMsg.role === "system") return false;

  // Don't group if previous message is deleted
  if (previousMsg.deleted) return false;

  // Check if messages are from the same user
  const sameUser = currentMsg.userId === previousMsg.userId;
  if (!sameUser) return false;

  // Check time difference
  const currentTime = currentMsg.timestamp?.toMillis?.() || currentMsg.timestamp?.toDate?.().getTime() || Date.now();
  const previousTime = previousMsg.timestamp?.toMillis?.() || previousMsg.timestamp?.toDate?.().getTime() || Date.now();
  
  const timeDiff = Math.abs(currentTime - previousTime);
  const maxTimeDiff = timeDiffMinutes * 60 * 1000; // Convert minutes to milliseconds

  return timeDiff <= maxTimeDiff;
};