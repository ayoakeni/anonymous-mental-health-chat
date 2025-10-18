import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useLocation, Routes, Route, useParams } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  arrayUnion,
  arrayRemove,
  getDoc,
  runTransaction,
  where,
  limit,
} from "firebase/firestore";
import { loginAnonymously, getAnonName } from "../login/anonymous_login";
import { useTypingStatus } from "../components/useTypingStatus";
import useNotificationSound from "../components/useNotificationSound";
import { formatTimestamp, getTimestampMillis } from "../components/timestampUtils";
import Sidebar from "../components/sidebar";
import GroupChatSplitView from "../components/AnonymousDashboard/anonymousGroupChatSplitView";
import PrivateChatSplitView from "../components/AnonymousDashboard/anonymousPrivateChatSplitView";
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
  const playNotification = useNotificationSound();
  const errorTimeoutRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
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
  const closeError = () => {
    setIsErrorFading(true);
    setTimeout(() => {
      setErrorMsg(null);
      setIsErrorFading(false);
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    }, 300);
  };

  const showError = (msg, autoDismiss = true) => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setErrorMsg(msg);
    setIsErrorFading(false);
    if (msg && autoDismiss) {
      errorTimeoutRef.current = setTimeout(closeError, 5000);
    }
  };

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
          navigate("/chat-room");
        }
      } catch (err) {
        console.error("Error during anonymous login:", err);
        showError("Failed to authenticate. Please try again.");
        navigate("/chat-room");
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
        isAnonymous={true} // Pass prop to customize Sidebar for anonymous users
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
        <Routes>
          <Route
            path="/"
            element={
              <div className="dashboard">
                <div className="welcome-header">
                  <h2>
                    Welcome, <span className="highlight">{displayName}</span>!
                  </h2>
                </div>
              </div>
            }
          />
          <Route
            path="/group-chat/*"
            element={
              <GroupChatSplitView
                groupChats={groupChats}
                activeGroupId={activeGroupId}
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
              <PrivateChatSplitView
                privateChats={privateChats}
                activeChatId={activeChatId}
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