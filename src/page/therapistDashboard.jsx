import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  useNavigate,
  useLocation,
  Routes,
  Route,
  useParams,
} from "react-router-dom";
import { auth } from "../utils/firebase";
import Sidebar from "../components/sidebar";
import { useUserMoods } from "../hooks/useUserMoods";
import { useTypingStatus } from "../components/useTypingStatus";
import GroupChatSplitView from "../components/therapistDashboard/GroupChatSplitView";
import PrivateChatSplitView from "../components/therapistDashboard/PrivateChatSplitView";
import TherapistDashboardHome from "../components/therapistDashboard/therapistDashboardHome";
import TherapistDashboardProfile from "../components/therapistDashboard/therapistDashboardProfile";
import TherapistDashboardNotification from "../components/therapistDashboard/therapistDashboardNotification";
import TherapistAppointmentsDashboard from "../components/therapistDashboard/therapistAppointmentDashboard";
import TherapistDashboardSetting from "../components/therapistDashboard/therapistDashboardSetting";
import useNotificationSound from "../components/useNotificationSound";
import { getTimestampMillis, formatTimestamp } from "../components/timestampUtils";

import { useTherapistProfile } from "../hooks/useTherapistProfile";
import { useGroupChats } from "../hooks/useGroupChats";
import { usePrivateChats } from "../hooks/usePrivateChats";
import { useActiveGroupChat } from "../hooks/useActiveGroupChat";
import { useActivePrivateChat } from "../hooks/useActivePrivateChat";
import { useParticipantNames } from "../hooks/useParticipantNames";
import { useAnonNames } from "../hooks/useAnonNames";
import { useAppointments } from "../hooks/useAppointments";
import { useOnlineTherapists } from "../hooks/useOnlineTherapists";
import { useNotifications } from "../hooks/useNotifications";

function TherapistDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { groupId, chatId } = useParams();

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

  const playNotification = useNotificationSound();
  const errorTimeout = useRef(null);

  const showError = useCallback((msg, auto = true) => {
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    console.error(msg);
    if (auto) errorTimeout.current = setTimeout(() => {}, 5000);
  }, []);

  const therapistId = auth.currentUser?.uid;

  // ────── CORE HOOKS ──────
  const {
    info: therapistInfo,
    therapistName,
    setInfo,
    saveProfile,
    saveSettings: profileSaveSettings,
    logout,
  } = useTherapistProfile(navigate, showError);

  const { groupChats, isLoadingGroupChats } = useGroupChats(showError);
  const { privateChats, isLoadingPrivateChats } = usePrivateChats(showError);

  const {
    messages: groupMsgs,
    events: groupEvts,
    participants,
    inChat: inGroup,
    join: joinGroup,
    leave: leaveGroup,
    sendMessage: sendGroupMsg,
    toggleReaction: toggleGroupReaction,
    deleteMessage: deleteGroupMsg,
    loadMore: loadMoreGroup,
    hasMore: groupHasMore,
    loading: groupLoading,
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
    loadMore: loadMorePrivate,
    hasMore: privHasMore,
    loading: privLoading,
    chatError,
    validating,
    inChat,
  } = useActivePrivateChat(
    activeChatId,
    therapistId,
    therapistName,
    playNotification,
    showError,
    navigate
  );

  const participantNames = useParticipantNames(
    groupChats.flatMap((g) => g.participants || [])
  );
  const anonNames = useAnonNames(privateChats, therapistId);

  // APPOINTMENTS
  const appointmentsData = useAppointments(therapistId, showError);
  const appointments = appointmentsData.appointments ?? [];
  const clients = appointmentsData.clients ?? [];

  const { onlineTherapists, isTherapistAvailable } = useOnlineTherapists(showError);

  const {
    notifications: filteredNotifications,
    markAsRead,
    markAllAsRead,
    dismiss,
    resetDismissed,
  } = useNotifications(privateChats, groupChats, anonNames, showError);

  const { typingUsers, handleTyping } = useTypingStatus(therapistName);

  // ────── SAVE SETTINGS WITH LOADER ──────
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await profileSaveSettings();
    } finally {
      setIsSaving(false);
    }
  };

  // ────── USER MOODS ──────
  const userIds = privateChats
  .map(chat => chat.userId)
  .filter(Boolean);

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
  const totalGroupUnread = useMemo(
    () => groupChats.reduce((s, g) => s + (g.unreadCount || 0), 0),
    [groupChats]
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
    typingUsers,
    chatBoxRef: useRef(null),
    isLoadingMessages: groupLoading,
    hasMoreMessages: groupHasMore,
    loadMoreMessages: loadMoreGroup,
    showEmojiPicker,
    setShowEmojiPicker,
    reply,
    setReply,
    handleTyping,
    sendReply: sendGroupMsg,
    joinGroupChat: joinGroup,
    leaveGroupChat: leaveGroup,
    therapistInfo,
    toggleReaction: toggleGroupReaction,
    deleteMessage: deleteGroupMsg,
    formatTimestamp,
    onEmojiClick: (e) => setReply((p) => p + e.emoji),
    showError,
    groupMessagesEndRef,
    navigate,
  };

  const privateProps = {
    privateChats,
    activeChatId,
    isValidatingChat: validating,
    chatError,
    isTherapistAvailable,
    activeTherapists: onlineTherapists.map((t) => t.name),
    selectedTherapist,
    setSelectedTherapist,
    combinedPrivateChat,
    typingUsers,
    chatBoxRef: useRef(null),
    isLoadingMessages: privLoading,
    hasMoreMessages: privHasMore,
    loadMoreMessages: loadMorePrivate,
    showEmojiPicker,
    setShowEmojiPicker,
    newPrivateMessage,
    setNewPrivateMessage,
    handleTyping,
    sendPrivateMessage: sendPrivMsg,
    isSendingPrivate: false,
    joinPrivateChat: joinPrivate,
    leavePrivateChat: leavePrivate,
    navigate,
    therapistInfo,
    toggleReaction: togglePrivReaction,
    deleteMessage: deletePrivMsg,
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
    <div className="therapist-dashboard">
      <Sidebar
        groupUnreadCount={totalGroupUnread}
        privateUnreadCount={privateUnread}
        onLogout={() => logout(activeChatId, activeGroupId, therapistName)}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <div className={`box ${isSidebarOpen ? "open" : "closed"}`}>
        <Routes>
          <Route path="/" element={<TherapistDashboardHome {...homeProps} />} />
          <Route path="/group-chat/*" element={<GroupChatSplitView {...groupProps} />} />
          <Route path="/private-chat/*" element={<PrivateChatSplitView {...privateProps} />} />
          <Route
            path="/appointments"
            element={
              <TherapistAppointmentsDashboard
                appointments={appointments}
                clients={clients}
                showError={showError}
                formatTimestamp={formatTimestamp}
              />
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
                saveProfile={saveProfile}
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