import { useEffect, useState, useMemo } from "react";
import { db, auth } from "../utils/firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { getTimestampMillis } from "../components/timestampUtils";

export function useNotifications(
  privateChats,
  groupChats,
  anonNames,
  showError
) {
  const [dismissed, setDismissed] = useState([]);
  const therapistId = auth.currentUser?.uid;

  // Load dismissed
  useEffect(() => {
    if (!therapistId) return;
    const ref = doc(db, "therapists", therapistId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setDismissed(snap.data().dismissedNotifications || []);
        }
      },
      () => showError("Failed to load dismissed notifications.")
    );
    return unsub;
  }, [therapistId, showError]);

  // Generate notifications
  const notifications = useMemo(() => {
    const privateNotifs = privateChats.map((c) => ({
      id: c.id,
      type: "private",
      message: `New messages in Private Chat with ${
        anonNames[c.id] || "Anonymous"
      } (${c.unreadCountForTherapist || 0})`,
      timestamp: c.lastUpdated,
      unreadCount: c.unreadCountForTherapist || 0,
      isDismissed: dismissed.includes(c.id),
    }));

    const groupNotifs = groupChats
      .filter((g) => g.unreadCount > 0)
      .map((g) => ({
        id: g.id,
        type: "group",
        message: `New messages in Group Chat "${g.name}" (${g.unreadCount})`,
        timestamp: g.lastMessage?.timestamp,
        unreadCount: g.unreadCount,
        isDismissed: dismissed.includes(g.id),
      }));

    return [...privateNotifs, ...groupNotifs]
      .filter((n) => n.timestamp)
      .sort(
        (a, b) =>
          getTimestampMillis(b.timestamp) - getTimestampMillis(a.timestamp)
      );
  }, [privateChats, groupChats, anonNames, dismissed]);

  // MARK AS READ (single)
  const markAsRead = async (chatId) => {
    try {
      await updateDoc(doc(db, "privateChats", chatId), {
        unreadCountForTherapist: 0,
      });
    } catch (err) {
      showError("Failed to mark as read.");
      console.error(err);
    }
  };

  // MARK ALL AS READ
  const markAllAsRead = async () => {
    const chatsToUpdate = privateChats.filter(
      (c) => c.unreadCountForTherapist > 0
    );

    if (chatsToUpdate.length === 0) return;

    const updates = chatsToUpdate.map((c) =>
      updateDoc(doc(db, "privateChats", c.id), {
        unreadCountForTherapist: 0,
      })
    );

    try {
      await Promise.all(updates);
      // No need to manually update state — Firestore listener will trigger re-render
    } catch (err) {
      showError("Failed to mark all as read.");
      console.error(err);
    }
  };

  // DISMISS
  const dismiss = async (id) => {
    try {
      await updateDoc(doc(db, "therapists", therapistId), {
        dismissedNotifications: arrayUnion(id),
      });
      setDismissed((prev) => [...prev, id]);
    } catch (err) {
      showError("Failed to dismiss notification.");
      console.error(err);
    }
  };

  // RESET DISMISSED
  const resetDismissed = async () => {
    try {
      await updateDoc(doc(db, "therapists", therapistId), {
        dismissedNotifications: [],
      });
      setDismissed([]);
    } catch (err) {
      showError("Failed to reset dismissed notifications.");
      console.error(err);
    }
  };

  return {
    notifications,
    markAsRead,
    markAllAsRead,
    dismiss,
    resetDismissed,
  };
}