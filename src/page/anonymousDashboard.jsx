import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate, Routes, Route, useParams, useLocation } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import { collection, query, onSnapshot, serverTimestamp, doc, arrayRemove, runTransaction, where, limit,
} from "firebase/firestore";
import { loginAnonymously, getAnonName } from "../login/anonymous_login";
import useNotificationSound from "../hooks/useNotificationSound";
import { formatTimestamp, getTimestampMillis } from "../components/timestampUtils";
import Sidebar from "../components/sidebar";
import AnonymousDashboardHome from "../components/AnonymousDashboard/anonymousDashboardHome";
import AnonymousGroupChatSplitView from "../components/AnonymousDashboard/anonymousGroupChatSplitView";
import AnonymousPrivateChatSplitView from "../components/AnonymousDashboard/anonymousPrivateChatSplitView";
import AppointmentsList from "../components/AnonymousDashboard/anonymousAppointmentList";
import { useUserNames } from "../hooks/useUserNames";
import { useHideSidebarMobile } from "../hooks/useHideSidebarMobile";
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
  const [moodHistory, setMoodHistory] = useState([]);
  const [moodHistoryLoading, setMoodHistoryLoading] = useState(true);
  const [showMoodPopup, setShowMoodPopup] = useState(false);
  const playNotification = useNotificationSound();
  const errorTimeoutRef = useRef(null);
  const moodModalRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { groupId, chatId } = useParams();
  const userId = auth.currentUser?.uid;
  const displayName = getAnonName();
  const hideSidebarOnMobile = useHideSidebarMobile();

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

  // Auto-clear activeChatId if chat no longer exists in list
  useEffect(() => {
    if (activeChatId && !privateChats.some(chat => chat.id === activeChatId)) {
      setActiveChatId(null);
    }
  }, [privateChats, activeChatId]);

  // Authenticate anonymous user
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        await loginAnonymously();
        if (isMounted && !auth.currentUser) {
          navigate("/");
        }
      } catch (err) {
        if (isMounted) {
          console.error("Anonymous login failed:", err);
          showError("Authentication failed. Please refresh.");
          navigate("/");
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
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

  // Fetch private chats — include those you left
  useEffect(() => {
    if (!userId) return;

    // Get ALL chats involving this user OR where they left
    const q1 = query(
      collection(db, "privateChats"),
      where("participants", "array-contains", userId),
      limit(50)
    );

    const q2 = query(
      collection(db, "privateChats"),
      where(`leftBy.${userId}`, "==", true),
      limit(50)
    );

    const unsub1 = onSnapshot(q1, handleSnapshot);
    const unsub2 = onSnapshot(q2, handleSnapshot);

    function handleSnapshot(snapshot) {
      const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPrivateChats(prev => {
        const updated = [...prev];
        chats.forEach(chat => {
          const index = updated.findIndex(c => c.id === chat.id);
          if (index >= 0) {
            updated[index] = chat;
          } else {
            updated.push(chat);
          }
        });
        return updated;
      });
    }

    return () => {
      unsub1();
      unsub2();
    };
  }, [userId, showError]);

  const anonNames = useUserNames( privateChats, userId, "therapists", "Therapist");

  // Fetch mood history
  useEffect(() => {
    const userId = auth.currentUser?.uid || "anonymous";
    const q = query(collection(db, "moods"), where("userId", "==", userId), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const moods = snapshot.docs.map(d => d.data()).sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setMoodHistory(moods);
      setMoodHistoryLoading(false);
    }, () => setMoodHistoryLoading(false));
    return () => unsubscribe();
  }, []);

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
    }
  }, [moodHistory]);

  // Initial check and periodic re-check for popup
  useEffect(() => {
    if (!moodHistoryLoading) {
      checkMoodPopup();
      const id = setInterval(checkMoodPopup, 10000);
      return () => clearInterval(id);
    }
  }, [moodHistoryLoading, checkMoodPopup]);

  // Handle mood popup dismissal
  const handleDismissMoodPopup = () => {
    localStorage.setItem('moodPopupDismissedDate', DateTime.now().setZone('Africa/Lagos').toISODate());
    setShowMoodPopup(false);
  };

  // Handle remind me later
  const handleRemindLater = () => {
    localStorage.setItem('moodPopupRemindLater', Date.now() + 30 * 60 * 1000);
    setShowMoodPopup(false);
  };

  // Dynamic mood prompt
  const lastMood = moodHistory[0]?.mood;
  const prompt = lastMood === 'sad' ? 'Feeling down? Let’s check in today!' : 'How’s your mood today?';

  // Sync URL ↔ active chat
  useEffect(() => {
    if (groupId && groupId !== activeGroupId) setActiveGroupId(groupId);
    if (chatId && chatId !== activeChatId) setActiveChatId(chatId);
  }, [groupId, activeGroupId, chatId, activeChatId]);

  useEffect(() => {
    if (activeGroupId && !location.pathname.includes(activeGroupId)) {
      navigate(`/anonymous-dashboard/group-chat/${activeGroupId}`, { replace: true });
    } else if (!activeGroupId && location.pathname.includes('/group-chat/')) {
      navigate('/anonymous-dashboard/group-chat', { replace: true });
    }
  }, [activeGroupId, navigate, location]);

  useEffect(() => {
    if (activeChatId && !location.pathname.includes(activeChatId)) {
      navigate(`/anonymous-dashboard/private-chat/${activeChatId}`, { replace: true });
    } else if (!activeChatId && location.pathname.includes('/private-chat/')) {
      navigate('/anonymous-dashboard/private-chat', { replace: true });
    }
  }, [activeChatId, navigate, location]);

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
    <div className={`anonymous-dashboard ${hideSidebarOnMobile ? 'no-bottom-padding' : ''}`.trim()}>
      <Sidebar
        hideOnMobileChat={hideSidebarOnMobile}
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
                userId={userId}
                anonNames={anonNames}
                showError={showError}
                playNotification={playNotification}
              />
            }
          />
          <Route path="/appointments-list" element={<AppointmentsList />} />
        </Routes>
      </div>
    </div>
  );
}

export default AnonymousDashboard;