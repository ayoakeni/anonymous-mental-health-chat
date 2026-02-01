import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate, Routes, Route, useParams,
} from "react-router-dom";
import { auth } from "../utils/firebase";
import Sidebar from "../components/sidebar";
import { useUserMoods } from "../hooks/useUserMoods";
import GroupChatSplitView from "../components/therapistDashboard/GroupChatSplitView";
import PrivateChatSplitView from "../components/therapistDashboard/PrivateChatSplitView";
import TherapistDashboardHome from "../components/therapistDashboard/therapistDashboardHome";
import TherapistDashboardProfile from "../components/therapistDashboard/therapistDashboardProfile";
import TherapistDashboardNotification from "../components/therapistDashboard/therapistDashboardNotification";
import TherapistAppointmentsDashboard from "../components/therapistDashboard/therapistAppointmentDashboard";
import TherapistAvailabilitySettings from "../components/therapistDashboard/therapistAvailabilitySettings";
import TherapistDashboardSetting from "../components/therapistDashboard/therapistDashboardSetting";
import useNotificationSound from "../hooks/useNotificationSound";
import { getTimestampMillis, formatTimestamp } from "../hooks/useTimestampUtils";
import { useTherapistProfile } from "../hooks/useTherapistProfile";
import { useGroupChats } from "../hooks/useGroupChats";
import { usePrivateChats } from "../hooks/usePrivateChats";
import { useActiveGroupChat } from "../hooks/useActiveGroupChat";
import { useActivePrivateChat } from "../hooks/useActivePrivateChat";
import { useParticipantNames } from "../hooks/useParticipantNames";
import { useUserNames } from "../hooks/useUserNames";
import { useOnlineTherapists } from "../hooks/useOnlineTherapists";
import { useNotifications } from "../hooks/useNotifications";
import { useHideSidebarMobile } from "../hooks/useHideSidebarMobile";
import { useRemovePaddingBottomMobile } from "../hooks/useRemovePaddingBottomMobile"
import "../assets/styles/therapistDashboard.css";
function TherapistDashboard() {
  const navigate = useNavigate();
  const { groupId, chatId } = useParams();
  const hideSidebarOnMobile = useHideSidebarMobile();
  const removeDashboardPadding = useRemovePaddingBottomMobile();

  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reply, setReply] = useState("");
  const [newPrivateMessage, setNewPrivateMessage] = useState("");
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [editing, setEditing] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const privateMessagesEndRef = useRef(null);
  const groupMessagesEndRef = useRef(null);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isErrorFading, setIsErrorFading] = useState(false);
  const errorTimeout = useRef(null);
  const playNotification = useNotificationSound();

  const closeError = useCallback(() => {
    setIsErrorFading(true);
    setTimeout(() => {
      setErrorMsg(null);
      setIsErrorFading(false);
      if (errorTimeout.current) {
        clearTimeout(errorTimeout.current);
      }
    }, 300);
  }, []);

  const showError = useCallback((msg, autoDismiss = true) => {
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    setErrorMsg(msg);
    setIsErrorFading(false);
    if (msg && autoDismiss) {
      errorTimeout.current = setTimeout(closeError, 5000);
    }
  }, [closeError]);

  const therapistId = auth.currentUser?.uid;

  // ────── CORE HOOKS ──────
  const {
    info: therapistInfo,
    therapistName,
    setInfo,
    saveSettings: profileSaveSettings,
    logout,
  } = useTherapistProfile(navigate, showError);
  
  const { groupChats, isLoadingGroupChats } = useGroupChats(showError);
  const { privateChats, isLoadingPrivateChats } = usePrivateChats(showError);

  const allParticipantUids = useMemo(() => {
    return [...new Set(
      groupChats.flatMap(g => g.participants || [])
    )];
  }, [groupChats]);

  const participantNames = useParticipantNames(allParticipantUids);
  const anonNames = useUserNames(privateChats, therapistId, "anonymousUsers", "Anonymous");

  const {
    messages: groupMsgs,
    events: groupEvts,
    participants,
    inChat: inGroup,
    isSendingGroup,
    join: joinGroup,
    leave: leaveGroup,
    sendMessage: sendGroupMsg,
    toggleReaction: toggleGroupReaction,
    deleteMessage: deleteGroupMsg,
    pinMessage: pinGroupMsg,
    loadMore: loadMoreGroup,
    hasMore: groupHasMore,
    isInitialLoading,
    isLoadingOlder,
    retrySend: retrySend,
    markAsRead: markGroupAsRead,
  } = useActiveGroupChat(
    activeGroupId,
    therapistId,
    therapistName,
    playNotification,
    showError
  );

  const {
    messages: privMsgs,
    events: privEvts,
    join: joinPrivate,
    leave: leavePrivate,
    sendMessage: sendPrivMsg,
    toggleReaction: togglePrivReaction,
    deleteMessage: deletePrivMsg,
    pinMessage: pinPrivateMsg,
    loadMore: loadMorePrivate,
    hasMore: privHasMore,
    loading: privLoading,
    chatError,
    validating,
    inChat,
    isSendingPrivate,
  } = useActivePrivateChat(
    activeChatId,
    therapistId,
    therapistName,
    playNotification,
    showError,
    navigate
  );

  const { onlineTherapists, isTherapistAvailable } = useOnlineTherapists(showError);

  const {
    notifications: filteredNotifications,
    markAsRead,
    markAllAsRead,
    dismiss,
    resetDismissed,
  } = useNotifications(privateChats, groupChats, anonNames, showError);

  // ────── SAVE SETTINGS WITH LOADER ──────
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await profileSaveSettings();
    } catch (e) {
      showError("Failed to save settings.");
    } finally {
      setIsSaving(false);
      showError("Settings saved successfully.");
    }
  };

  // ────── USER MOODS ──────
  const userIds = useMemo(() => {
    return privateChats
      .map((c) => c.userId)
      .filter(Boolean);
  }, [privateChats]);

  const userMoods = useUserMoods(userIds);

  // ────── URL ↔ ACTIVE CHAT SYNC ──────
  useEffect(() => {
    const path = location.pathname;

    // Group chat
    if (path.startsWith("/therapist-dashboard/group-chat/")) {
      const gid = groupId || path.split("/").pop();
      if (gid && gid !== activeGroupId) {
        setActiveGroupId(gid);
      }
    } else if (activeGroupId) {
      setActiveGroupId(null);
    }

    // Private chat
    if (path.startsWith("/therapist-dashboard/private-chat/")) {
      const cid = chatId || path.split("/").pop();
      if (cid && cid !== activeChatId) {
        setActiveChatId(cid);
      }
    } else if (activeChatId) {
      setActiveChatId(null);
    }
  }, [location.pathname, groupId, chatId, activeGroupId, activeChatId]);

  // ────── UNREAD COUNTS ──────
  const currentUserId = auth.currentUser?.uid;
  const totalGroupUnread = useMemo(() => 
    groupChats.reduce((sum, group) => {
      const personalCount = group.unreadCount?.[currentUserId] || 0;
      return sum + personalCount;
    }, 0),
    [groupChats, currentUserId]
  );
  
  const privateUnread = useMemo(
    () =>
      privateChats.reduce(
        (s, c) => s + (c.unreadCountForTherapist || 0),
        0
      ),
    [privateChats]
  );

  // ────── COMBINED CHAT DATA ──────
  const combinedGroupChat = useMemo(() => {
    return [...groupMsgs, ...groupEvts].sort(
      (a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp)
    );
  }, [groupMsgs, groupEvts]);

  const combinedPrivateChat = useMemo(() => {
    return [...privMsgs, ...privEvts].sort(
      (a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp)
    );
  }, [privMsgs, privEvts]);

  // ────── PROPS FOR CHILD VIEWS ──────
  const homeProps = {
    therapistInfo,
    therapistId,
    groupChats,
    privateChats,
    totalGroupUnread,
    privateUnreadCount: privateUnread,
    anonNames,
    formatTimestamp,
    joinGroupChat: joinGroup,
    joinPrivateChat: joinPrivate,
    isLoadingChats: isLoadingGroupChats || isLoadingPrivateChats,
    isLoadingNames: false,
  };

  const groupProps = {
    groupChats,
    activeGroupId,
    isGroupChatOpen: !!activeGroupId,
    inGroupChat: inGroup,
    therapistsOnline: onlineTherapists,
    participants,
    participantNames,
    isParticipantsOpen,
    setIsParticipantsOpen,
    combinedGroupChat,
    chatBoxRef: useRef(null),
    isInitialLoading,
    isLoadingOlder,
    retrySend: retrySend,
    hasMoreMessages: groupHasMore,
    loadMoreMessages: loadMoreGroup,
    showEmojiPicker,
    setShowEmojiPicker,
    reply,
    setReply,
    sendReply: sendGroupMsg,
    isSendingGroup,  
    joinGroupChat: joinGroup,
    leaveGroupChat: leaveGroup,
    therapistInfo,
    therapistId,
    toggleReaction: toggleGroupReaction,
    deleteMessage: deleteGroupMsg,
    pinMessage: pinGroupMsg,
    formatTimestamp,
    onEmojiClick: (e) => setReply((p) => p + e.emoji),
    showError,
    groupMessagesEndRef,
    navigate,
    markAsRead: markGroupAsRead,
  };

  const privateProps = {
    privateChats,
    activeChatId,
    isValidatingChat: validating,
    chatError,
    isTherapistAvailable,
    activeTherapists: onlineTherapists,
    selectedTherapist,
    setSelectedTherapist,
    combinedPrivateChat,
    chatBoxRef: useRef(null),
    isLoadingMessages: privLoading,
    hasMoreMessages: privHasMore,
    loadMoreMessages: loadMorePrivate,
    showEmojiPicker,
    setShowEmojiPicker,
    newPrivateMessage,
    setNewPrivateMessage,
    sendPrivateMessage: sendPrivMsg,
    isSendingPrivate,
    joinPrivateChat: joinPrivate,
    leavePrivateChat: leavePrivate,
    navigate,
    therapistInfo,
    toggleReaction: togglePrivReaction,
    deleteMessage: deletePrivMsg,
    pinMessage: pinPrivateMsg,
    isLoadingChats: isLoadingPrivateChats,
    formatTimestamp,
    onEmojiClick: (e) => setNewPrivateMessage((p) => p + e.emoji),
    anonNames,
    showError,
    inChat,
    therapistId,
    userMoods,
    privateMessagesEndRef,
  };

  return (
    <div className={`therapist-dashboard ${removeDashboardPadding ? 'no-bottom-padding' : ''}`.trim()}>
      <Sidebar
        hideOnMobileChat={hideSidebarOnMobile}
        groupUnreadCount={totalGroupUnread}
        privateUnreadCount={privateUnread}
        onLogout={() => logout(activeChatId, activeGroupId, therapistName)}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
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
          <Route path="/" element={<TherapistDashboardHome {...homeProps} />} />
          <Route path="/group-chat/*" element={<GroupChatSplitView {...groupProps} />} />
          <Route path="/private-chat/*" element={<PrivateChatSplitView {...privateProps} />} />
          <Route
            path="/appointments"
            element={
              <TherapistAppointmentsDashboard
                showError={showError}
                formatTimestamp={formatTimestamp}
              />
            }
          />
          <Route
            path="/availability"
            element={
              <TherapistAvailabilitySettings therapistId={therapistId} />
            }
          />
          <Route
            path="/notifications"
            element={
              <TherapistDashboardNotification
                notifications={filteredNotifications}
                notificationFilter={notificationFilter}
                setNotificationFilter={setNotificationFilter}
                markAllAsRead={markAllAsRead}
                resetDismissed={resetDismissed}
                onView={(notif) =>
                  notif.type === "private"
                    ? joinPrivate(notif.id)
                    : navigate(`/therapist-dashboard/group-chat/${notif.id}`)
                }
                onMarkAsRead={markAsRead}
                onDismiss={dismiss}
                formatTimestamp={formatTimestamp}
              />
            }
          />
          <Route
            path="/profile"
            element={
              <TherapistDashboardProfile
                therapistInfo={therapistInfo}
                editing={editing}
                setEditing={setEditing}
                setTherapistInfo={setInfo}
                therapistId={therapistId}
                isOnline={therapistInfo.availability?.online}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <TherapistDashboardSetting
                therapistInfo={therapistInfo}
                setTherapistInfo={setInfo}
                saveSettings={saveSettings}
                isSaving={isSaving}
                navigate={navigate}
                handleLogout={() => logout(activeChatId, activeGroupId, therapistName)}
              />
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default TherapistDashboard;