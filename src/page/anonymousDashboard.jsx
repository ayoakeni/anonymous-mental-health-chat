import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate, Routes, Route, useParams } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import {
  collection,
  query,
  onSnapshot,
  serverTimestamp,
  doc,
  arrayRemove,
  runTransaction,
  where,
  limit,
} from "firebase/firestore";
import { loginAnonymously, getAnonName } from "../login/anonymous_login";
import { useTypingStatus } from "../components/useTypingStatus";
import useNotificationSound from "../components/useNotificationSound";
import { formatTimestamp, getTimestampMillis } from "../components/timestampUtils";
import Sidebar from "../components/sidebar";
import AnonymousDashboardHome from "../components/AnonymousDashboard/anonymousDashboardHome";
import AnonymousGroupChatSplitView from "../components/AnonymousDashboard/anonymousGroupChatSplitView";
import AnonymousPrivateChatSplitView from "../components/AnonymousDashboard/anonymousPrivateChatSplitView";
import MoodTracker from "../components/moodTracker";
import { DateTime } from 'luxon';
import "../styles/anonymousDashboard.css";

function AnonymousDashboard() {
  const [groupChats, setGroupChats] = useState([]);
  const [privateChats, setPrivateChats] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isErrorFading, setIsErrorFading] = useState(false);
  const [anonNames, setAnonNames] = useState({});
  const [moodHistory, setMoodHistory] = useState([]);
  const [moodHistoryLoading, setMoodHistoryLoading] = useState(true);
  const [showMoodPopup, setShowMoodPopup] = useState(false);
  const playNotification = useNotificationSound();
  const errorTimeoutRef = useRef(null);
  const moodModalRef = useRef(null);
  const navigate = useNavigate();
  const { groupId, chatId } = useParams();
  const userId = auth.currentUser?.uid;
  const displayName = getAnonName();

  const { typingUsers } = useTypingStatus(displayName);

  // Calculate total unread counts
  const totalGroupUnread = useMemo(() =>
    groupChats.reduce((sum, group) => sum + (group.unreadCount || 0), 0),
    [groupChats]
  );
  const privateUnreadCount = useMemo(() =>
    privateChats.reduce((sum, chat) => sum + (chat.unreadCountForTherapist || 0), 0),
    [privateChats]
  );

  // Handle error display
  const closeError = useCallback(() => {
    setIsErrorFading(true);
    setTimeout(() => {
      setErrorMsg(null);
      setIsErrorFading(false);
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    }, 300);
  }, [setErrorMsg, setIsErrorFading, errorTimeoutRef]);

  const showError = useCallback(
    (msg, autoDismiss = true) => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      setErrorMsg(msg);
      setIsErrorFading(false);
      if (msg && autoDismiss) {
        errorTimeoutRef.current = setTimeout(closeError, 5000);
      }
    },
    [closeError, setErrorMsg, setIsErrorFading, errorTimeoutRef]
  );

  // Cleanup error timeout
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  // Authenticate anonymous user
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await loginAnonymously();
        if (!auth.currentUser) {
          navigate("/");
        }
      } catch (err) {
        console.error("Error during anonymous login:", err);
        showError("Failed to authenticate. Please try again.");
        navigate("/");
      }
    };
    initializeAuth();
  }, [navigate, showError]);

  // Fetch group chats
  useEffect(() => {
    const q = query(collection(db, "groupChats"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setGroupChats(chats);
        setIsLoadingChats(false);
      },
      (err) => {
        console.error("Error fetching group chats:", err);
        showError("Failed to load group chats. Please try again.");
        setIsLoadingChats(false);
      }
    );
    return () => unsubscribe();
  }, [showError]);

  // Fetch private chats
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, "privateChats"),
      where("participants", "array-contains", userId),
      limit(50)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPrivateChats(chats);
        setIsLoadingChats(false);
      },
      (err) => {
        console.error("Error fetching private chats:", err);
        showError("Failed to load private chats. Please try again.");
        setIsLoadingChats(false);
      }
    );
    return () => unsubscribe();
  }, [userId, showError]);

  // Fetch anonymous names for private chats
  useEffect(() => {
    if (privateChats.length === 0 || !userId) return;

    const unsubs = privateChats.map((chat) => {
      const therapistUid = chat.participants?.find((uid) => uid !== userId);
      if (!therapistUid) return () => {};

      const therapistRef = doc(db, "therapists", therapistUid);
      return onSnapshot(
        therapistRef,
        (snap) => {
          const therapistData = snap.exists() ? snap.data() : null;
          setAnonNames((prev) => ({
            ...prev,
            [chat.id]: therapistData?.name?.trim() || "Therapist",
          }));
        },
        (err) => {
          console.error("Error fetching therapist name:", err);
          setAnonNames((prev) => ({ ...prev, [chat.id]: "Therapist" }));
        }
      );
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [privateChats, userId]);

  // Fetch mood history
  useEffect(() => {
    const userId = auth.currentUser?.uid || "anonymous";
    const q = query(
      collection(db, "moods"),
      where("userId", "==", userId),
      limit(5)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const moods = snapshot.docs
          .map(doc => doc.data())
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setMoodHistory(moods);
      } else {
        setMoodHistory([]);
      }
      setMoodHistoryLoading(false);
    }, (error) => {
      console.error("Error fetching mood history:", error);
      showError("Failed to load mood history. Please try again.");
      setMoodHistoryLoading(false);
    });
    return () => unsubscribe();
  }, [showError]);

  // Check if mood popup should be shown
  const checkMoodPopup = useCallback(() => {
    const today = DateTime.now().setZone('Africa/Lagos').toISODate();
    const lastDismissed = localStorage.getItem('moodPopupDismissedDate');
    const remindLater = localStorage.getItem('moodPopupRemindLater');
    if (remindLater && Date.now() < parseInt(remindLater)) {
      return;
    }

    // Check if a mood was logged today
    const hasMoodToday = moodHistory.some(mood => {
      const moodDate = formatTimestamp(mood.timestamp)?.isoDate;
      return moodDate === today;
    });

    // Show popup if no mood logged today and not dismissed today
    if (!hasMoodToday && lastDismissed !== today) {
      setShowMoodPopup(true);
    } else {
      setShowMoodPopup(false);
    }
  }, [moodHistory, formatTimestamp]);

  // Initial check and periodic re-check for popup
  useEffect(() => {
    if (!moodHistoryLoading) {
      checkMoodPopup();
      const intervalId = setInterval(checkMoodPopup, 5000); // Check every 5 seconds
      return () => clearInterval(intervalId); // Cleanup interval
    }
  }, [moodHistoryLoading, checkMoodPopup]);

  // Handle mood popup dismissal
  const handleDismissMoodPopup = () => {
    const today = DateTime.now().setZone('Africa/Lagos').toISODate();
    localStorage.setItem('moodPopupDismissedDate', today);
    setShowMoodPopup(false);
  };

  // Handle remind me later
  const handleRemindLater = () => {
  const remindTime = Date.now() + 30 * 60 * 1000; // 30 minutes
    localStorage.setItem('moodPopupRemindLater', remindTime);
    setShowMoodPopup(false);
  };

  // Dynamic mood prompt
  const lastMood = moodHistory[0]?.mood;
  const prompt = lastMood === 'sad' ? 'Feeling down? Let’s check in today!' : 'How’s your mood today?';

  // Sync active chat IDs with URL params
  useEffect(() => {
    if (groupId && groupId !== activeGroupId) {
      setActiveGroupId(groupId);
    }
    if (chatId && chatId !== activeChatId) {
      setActiveChatId(chatId);
    }
  }, [groupId, chatId, activeGroupId, activeChatId]);

  // Handle sidebar toggle
  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Auto-leave chats on tab close
  useEffect(() => {
    if (!userId) return;
    let isReloading = false;
    const debouncedLeave = async () => {
      if (isReloading) return;
      try {
        await runTransaction(db, async (transaction) => {
          if (activeChatId) {
            const privateChatRef = doc(db, "privateChats", activeChatId);
            const chatSnap = await transaction.get(privateChatRef);
            if (chatSnap.exists()) {
              transaction.update(privateChatRef, {
                participants: arrayRemove(userId),
                aiOffered: false,
                therapistJoinedOnce: false,
                needsTherapist: true,
              });
              transaction.set(doc(collection(privateChatRef, "events")), {
                type: "leave",
                user: displayName,
                text: `${displayName} has left the chat.`,
                role: "system",
                timestamp: serverTimestamp(),
              });
            }
          }
          if (activeGroupId) {
            const groupChatRef = doc(db, "groupChats", activeGroupId);
            const groupSnap = await transaction.get(groupChatRef);
            if (groupSnap.exists()) {
              transaction.update(groupChatRef, {
                participants: arrayRemove(userId),
              });
              transaction.set(doc(collection(groupChatRef, "events")), {
                type: "leave",
                user: displayName,
                text: `${displayName} has left the chat.`,
                role: "system",
                timestamp: serverTimestamp(),
              });
            }
          }
        });
      } catch (err) {
        console.error("Error auto-leaving chats:", err);
        showError("Failed to auto-leave chats. Please try again.");
      }
    };

    const handleBeforeUnload = () => {
      debouncedLeave();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        isReloading = true;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeChatId, activeGroupId, userId, displayName, showError]);

  return (
    <div className="anonymous-dashboard">
      <Sidebar
        groupUnreadCount={totalGroupUnread}
        privateUnreadCount={privateUnreadCount}
        onToggle={handleToggleSidebar}
        isAnonymous={true}
      />
      <div className={`box ${isSidebarOpen ? "open" : "closed"}`}>
        {errorMsg && (
          <div className={`error-toast ${isErrorFading ? "fade-out" : ""}`}>
            {errorMsg}
            <button className="error-close-btn" onClick={closeError} aria-label="Close error message">
              <i className="fa-solid fa-times"></i>
            </button>
          </div>
        )}
        {/* Daily Mood Popup */}
        {showMoodPopup && (
          <div className="modal-backdrop">
            <div className="mood-modal" ref={moodModalRef}>
              <h3 className="mood-modal-checkin">Daily Mood Check-In</h3>
              <p className="mood-modal-question">{prompt}</p>
              <MoodTracker
                formatTimestamp={formatTimestamp}
                onMoodLogged={() => setShowMoodPopup(false)}
              />
              <div className="button-container">
                <button
                  className="dismiss-mood-button"
                  onClick={handleDismissMoodPopup}
                >
                  Dismiss for Today
                </button>
                <button
                  className="dismiss-mood-button"
                  onClick={handleRemindLater}
                >
                  Remind Me Later
                </button>
              </div>
            </div>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <AnonymousDashboardHome
                groupChats={groupChats}
                privateChats={privateChats}
                displayName={displayName}
                anonNames={anonNames}
                formatTimestamp={formatTimestamp}
              />
            }
          />
          <Route
            path="/group-chat/*"
            element={
              <AnonymousGroupChatSplitView
                groupChats={groupChats}
                activeGroupId={activeGroupId}
                setActiveGroupId={setActiveGroupId}
                isLoadingChats={isLoadingChats}
                formatTimestamp={formatTimestamp}
                getTimestampMillis={getTimestampMillis}
                displayName={displayName}
                typingUsers={typingUsers}
                userId={userId}
                showError={showError}
                playNotification={playNotification}
              />
            }
          />
          <Route
            path="/private-chat/*"
            element={
              <AnonymousPrivateChatSplitView
                privateChats={privateChats}
                activeChatId={activeChatId}
                setActiveChatId={setActiveChatId}
                formatTimestamp={formatTimestamp}
                getTimestampMillis={getTimestampMillis}
                displayName={displayName}
                typingUsers={typingUsers}
                userId={userId}
                anonNames={anonNames}
                showError={showError}
                playNotification={playNotification}
              />
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default AnonymousDashboard;