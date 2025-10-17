import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation, Routes, Route, useParams } from "react-router-dom";
import { db, auth, Timestamp, storage, ref, uploadBytes, getDownloadURL } from "../utils/firebase";
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
  setDoc,
  where,
  limit,
  runTransaction,
  getDocs
} from "firebase/firestore";
import { debounce } from "lodash";
import { signOut } from "firebase/auth";
import Sidebar from "../components/sidebar";
import { useTypingStatus } from "../components/useTypingStatus";
import GroupChatSplitView from "../components/therapistDashboard/GroupChatSplitView";
import PrivateChatSplitView from "../components/therapistDashboard/PrivateChatSplitView";
import useNotificationSound from '../components/useNotificationSound';
import { getTimestampMillis, formatTimestamp } from "../components/timestampUtils";
import "../styles/therapistDashboard.css";

function TherapistDashboard() {
  const [messages, setMessages] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [reply, setReply] = useState("");
  const [privateChats, setPrivateChats] = useState([]);
  const [isGroupChatOpen, setIsGroupChatOpen] = useState(false);
  const playNotification = useNotificationSound();
  const prevPrivateMessagesRef = useRef([]);
  const prevGroupMessagesRef = useRef([]);
  const [inGroupChat, setInGroupChat] = useState(false);
  // Calculate total group and private unread count
  const totalGroupUnread = useMemo(() => groupChats.reduce((sum, group) => sum + (group.unreadCount || 0), 0), [groupChats]);
  const privateUnreadCount = useMemo(() => privateChats.reduce((sum, chat) => sum + (chat.unreadCountForTherapist || 0), 0), [privateChats]);
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [therapistInfo, setTherapistInfo] = useState({
    name: "",
    gender: "",
    position: "",
    profile: "",
    rating: 0,
  });
  const [privateMessages, setPrivateMessages] = useState([]);
  const [privateEvents, setPrivateEvents] = useState([]);
  const [isTherapistAvailable, setIsTherapistAvailable] = useState(false);
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [newPrivateMessage, setNewPrivateMessage] = useState("");
  const [isSendingPrivate, setIsSendingPrivate] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistName, setTherapistName] = useState("Therapist");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isValidatingChat, setIsValidatingChat] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isErrorFading, setIsErrorFading] = useState(false);
  const errorTimeoutRef = useRef(null);
  const [anonNames, setAnonNames] = useState({});
  const therapistId = auth.currentUser?.uid;
  const displayName = therapistInfo.name || "Unknown Therapist";
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  const privateMessagesEndRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { chatId } = useParams();

  // Memoized closeError - dependencies: setters and ref
  const closeError = useCallback(() => {
    setIsErrorFading(true);
    setTimeout(() => {
      setErrorMsg(null);
      setIsErrorFading(false);
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
    }, 300);  // Match CSS
  }, []);

  // Memoized showError - dependencies: setters and ref it closes over
  const showError = useCallback((msg, autoDismiss = true) => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setErrorMsg(msg);
    setIsErrorFading(false);
    if (msg && autoDismiss) {
      errorTimeoutRef.current = setTimeout(() => {
        closeError();
      }, 5000);
    }
  }, [closeError]);

  // Cleanup effect (unchanged, but add deps if needed)
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  const onEmojiClick = (emojiData) => {
    setReply(reply + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Fetch anonymous names for private chats
  useEffect(() => {
    if (privateChats.length === 0 || !therapistId) return;

    const unsubs = privateChats.map((chat) => {
      const userUid = chat.participants?.find(uid => uid && uid !== therapistId);
      if (!userUid) return () => {};

      const anonRef = doc(db, "anonymousUsers", userUid);
      return onSnapshot(anonRef, (snap) => {
        const anonData = snap.exists() ? snap.data() : null;
        setAnonNames(prev => ({ ...prev, [chat.id]: anonData?.anonymousName?.trim() || "Anonymous" }));
      }, (err) => {
        console.error("Error listening to anon name:", err);
        setAnonNames(prev => ({ ...prev, [chat.id]: "Anonymous" }));
      });
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [privateChats, therapistId]);

  // Check authentication
  useEffect(() => {
    if (!auth.currentUser) {
      console.log("No user logged in, redirecting to login");
      navigate("/therapist-login");
    }
  }, [navigate]);

  // Toggle sidebar
  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Auto scroll group chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, groupEvents]);

  // Auto scroll private chat
  useEffect(() => {
    privateMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [privateMessages, privateEvents]);

  // Watch therapists online for availability indicator
  useEffect(() => {
    const q = query(collection(db, "therapistsOnline"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const onlineTherapists = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((t) => t.online);
      setTherapistsOnline(onlineTherapists);
      setIsTherapistAvailable(onlineTherapists.length > 0);
      setActiveTherapists(onlineTherapists.map((t) => t.name || "Therapist"));
    }, (err) => {
      console.error("Error fetching therapists online:", err);
      showError("Failed to fetch therapist status. Please try again.");
    });
    return () => unsub();
  }, [showError]);

  // Fetch all group chats
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

  // Watch group chat participants and messages for active group
  useEffect(() => {
    if (!activeGroupId) return;
    const groupRef = doc(db, "groupChats", activeGroupId);
    const messagesQuery = query(collection(groupRef, "messages"), orderBy("timestamp"), limit(50));
    const eventsQuery = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));

    const unsubParticipants = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        setParticipants(snap.data().participants || []);
        const isParticipant = snap.data().participants?.includes(therapistId);
        setInGroupChat(isParticipant);
        setIsGroupChatOpen(isParticipant && isGroupChatOpen);
      }
    });

    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      const newMsgs = msgs.filter(
        (msg) => !prevGroupMessagesRef.current.some((prev) => prev.id === msg.id)
      );

      setMessages(msgs);
      prevGroupMessagesRef.current = msgs;

      if (newMsgs.length > 0) {
        playNotification();
      }
    });

    const unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
      const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setGroupEvents(evts);
    });

    return () => {
      unsubParticipants();
      unsubMessages();
      unsubEvents();
    };
  }, [activeGroupId, isGroupChatOpen, lastSeenTimestamp, therapistId, playNotification]);

  // Fetch participant names
  const [participantNames, setParticipantNames] = useState({});
  useEffect(() => {
    const fetchParticipantNames = async () => {
      const snapshots = await Promise.all(participants.map(uid => getDoc(doc(db, "therapists", uid))));
      const names = snapshots.reduce((acc, snap, i) => {
        acc[participants[i]] = snap.data()?.name || "Anonymous";
        return acc;
      }, {});
      setParticipantNames(names);
    };
    if (participants.length > 0) {
      fetchParticipantNames().catch((err) => {
        console.error("Error fetching participant names:", err);
      });
    }
  }, [participants]);

  // Toggle participant
  useEffect(() => {
    const handleClickOutside = (event) => {
      const participantList = document.querySelector(".participant-list");
      if (participantList && !participantList.contains(event.target)) {
        setIsParticipantsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Validate and sync activeChatId with URL param
  useEffect(() => {
    if (!chatId || !location.pathname.startsWith("/therapist-dashboard/private-chat/")) {
      setActiveChatId(null);
      setPrivateMessages([]);
      setPrivateEvents([]);
      setChatError(null);
      setIsValidatingChat(false);
      return;
    }

    const validateChat = async () => {
      setIsValidatingChat(true);
      setChatError(null);
      try {
        const chatRef = doc(db, "privateChats", chatId);
        let chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) {
          console.log("Chat document does not exist:", chatId);
          setChatError("This chat no longer exists.");
          setActiveChatId(null);
          navigate("/therapist-dashboard/private-chat");
          return;
        }

        let chatData = chatSnap.data();
        let isParticipant = chatData.participants?.includes(therapistId);
        let needsTherapist = chatData.needsTherapist === true;

        if (!isParticipant && !needsTherapist) {
          const eventsQuery = query(
            collection(chatRef, "events"),
            where("type", "==", "join"),
            where("user", "==", displayName),
            orderBy("timestamp", "desc"),
            limit(1)
          );
          const eventsSnap = await getDocs(eventsQuery);
          const recentJoin = eventsSnap.docs.length > 0;
          const recentJoinTime = recentJoin ? eventsSnap.docs[0].data().timestamp?.toMillis() : 0;
          const isRecentJoin = recentJoin && (Date.now() - recentJoinTime) < 10000;

          if (!isRecentJoin) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            chatSnap = await getDoc(chatRef);
            if (!chatSnap.exists()) {
              setChatError("This chat no longer exists.");
              setActiveChatId(null);
              navigate("/therapist-dashboard/private-chat");
              return;
            }
            chatData = chatSnap.data();
            isParticipant = chatData.participants?.includes(therapistId);
            needsTherapist = chatData.needsTherapist;
            if (!isParticipant && !needsTherapist) {
              setChatError("You do not have permission to access this chat.");
              setActiveChatId(null);
              navigate("/therapist-dashboard/private-chat");
              return;
            }
          }
        }

        setActiveChatId(chatId);
      } catch (err) {
        console.error("Error validating chat:", err);
        setChatError("Failed to load chat. Please try again.");
        setActiveChatId(null);
        navigate("/therapist-dashboard/private-chat");
      } finally {
        setIsValidatingChat(false);
      }
    };

    validateChat();
  }, [location.pathname, chatId, therapistId, navigate, displayName]);

  // Load private chats with retry
  useEffect(() => {
    if (!therapistId) {
      console.log("No therapistId, skipping private chats subscription");
      setIsLoadingChats(false);
      return;
    }
    let retryCount = 0;
    const maxRetries = 3;
    const trySubscribe = () => {
      const q1 = query(
        collection(db, "privateChats"),
        where("participants", "array-contains", therapistId),
        limit(50)
      );
      const q2 = query(
        collection(db, "privateChats"),
        where("needsTherapist", "==", true),
        limit(50)
      );
      const unsubscribe1 = onSnapshot(q1, (snapshot) => {
        const chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPrivateChats((prev) => {
          const allChats = [...chats, ...prev];
          const uniqueChats = [...new Set(allChats.map((c) => c.id))].map((id) =>
            allChats.find((c) => c.id === id)
          );
          return uniqueChats;
        });
      }, (err) => {
        console.error("Error fetching private chats (participant):", err);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying private chats subscription (${retryCount}/${maxRetries})...`);
          setTimeout(trySubscribe, 2000 * retryCount);
        } else {
          showError("Failed to load private chats after retries. Please try again.");
        }
      });
      const unsubscribe2 = onSnapshot(q2, (snapshot) => {
        const chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPrivateChats((prev) => {
          const allChats = [...chats, ...prev];
          const uniqueChats = [...new Set(allChats.map((c) => c.id))].map((id) =>
            allChats.find((c) => c.id === id)
          );
          return uniqueChats;
        });
        setIsLoadingChats(false);
      }, (err) => {
        console.error("Error fetching private chats (needsTherapist):", err);
        setIsLoadingChats(false);
      });
      return () => {
        unsubscribe1();
        unsubscribe2();
      };
    };
    const unsubscribe = trySubscribe();
    return () => unsubscribe();
  }, [therapistId, showError]);

  // Watch private chat messages
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribeMessages = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Detect new
        const newMsgs = msgs.filter(
          (msg) => !prevPrivateMessagesRef.current.some((prev) => prev.id === msg.id)
        );

        setPrivateMessages(msgs);
        prevPrivateMessagesRef.current = msgs;

        if (newMsgs.length > 0) {
          playNotification();
        }

        // Existing transaction for unread reset...
        runTransaction(db, async (transaction) => {
          const chatSnap = await transaction.get(chatRef);
          if (chatSnap.exists()) {
            transaction.update(chatRef, { unreadCountForTherapist: 0 });
          }
        }).catch((err) => {
          console.error("Error resetting unread count:", err);
          showError("Failed to reset unread count. Please try again.");
        });
      },
      (err) => {
        console.error("Error fetching private messages:", err);
        setChatError("Failed to load private messages. Please try again.");
      }
    );
    return () => unsubscribeMessages();
  }, [activeChatId, playNotification, showError]);

  // Watch private chat events
  useEffect(() => {
    if (!activeChatId) 
      return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribeEvents = onSnapshot(
      q,
      (snapshot) => {
        const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPrivateEvents(evts);
      },
      (err) => {
        console.error("Error fetching private events:", err);
        setChatError("Failed to load private events. Please try again.");
      }
    );
    return () => unsubscribeEvents();
  }, [activeChatId]);

  // Fetch last seen timestamp
  useEffect(() => {
    if (!therapistId) return;
    const fetchLastSeen = async () => {
      const docRef = doc(db, "therapists", therapistId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const lastSeenGroupChat = snap.data().lastSeenGroupChat;
        let lastSeen;
        if (lastSeenGroupChat instanceof Timestamp) {
          lastSeen = lastSeenGroupChat.toMillis();
        } else if (typeof lastSeenGroupChat === "number") {
          lastSeen = lastSeenGroupChat;
        } else {
          lastSeen = Date.now();
        }
        setLastSeenTimestamp(lastSeen);
      } else {
        setLastSeenTimestamp(Date.now());
      }
    };
    fetchLastSeen().catch((err) => {
      console.error("Error fetching last seen:", err);
      showError("Failed to fetch last seen timestamp. Please try again.");
    });
  }, [therapistId, showError]);

  // Fetch therapist profile
  useEffect(() => {
    if (!therapistId) return;
    const therapistRef = doc(db, "therapists", therapistId);
    const unsubscribe = onSnapshot(
      therapistRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setTherapistInfo(data);
          setTherapistName(data.name || "Therapist");
        } else {
          const defaultInfo = {
            name: "New Therapist",
            gender: "",
            position: "",
            profile: "",
            rating: 0,
          };
          setTherapistInfo(defaultInfo);
          setTherapistName("Therapist");
        }
      },
      (err) => {
        console.error("Error fetching therapist profile:", err);
        showError("Failed to fetch therapist profile. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [therapistId, showError]);

  // Tab close vs refresh detection
  useEffect(() => {
    if (!auth.currentUser) return;
    let isReloading = false;
    const debouncedLeave = debounce(async () => {
      if (isReloading) return;
      const uid = auth.currentUser.uid;
      try {
        await runTransaction(db, async (transaction) => {
          if (activeChatId) {
            const privateChatRef = await transaction.get(doc(db, "privateChats", activeChatId));
            if (privateChatRef.exists()) {
              transaction.update(privateChatRef, {
                participants: arrayRemove(uid),
                aiOffered: false,
                needsTherapist: false,
              });
              transaction.set(doc(collection(privateChatRef, "events")), {
                type: "leave",
                user: displayName,
                text: `${displayName} left the chat.`,
                role: "system",
                timestamp: serverTimestamp(),
              });
            }
          }
          if (activeGroupId) {
            const groupChatRef = await transaction.get(doc(db, "groupChats", activeGroupId));
            if (groupChatRef.exists()) {
              transaction.update(groupChatRef, {
                participants: arrayRemove(uid),
              });
              transaction.set(doc(collection(groupChatRef, "events")), {
                type: "leave",
                user: displayName,
                timestamp: serverTimestamp(),
              });
            }
          }
        });
      } catch (err) {
        console.error("Error auto-leaving chats:", err);
        showError("Failed to auto-leave chats. Please try again.");
      }
    }, 1000);
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
      debouncedLeave.cancel();
    };
  }, [activeChatId, activeGroupId, displayName, showError]);

  // Send message to group chat with file support
  const sendReply = async (file = null) => {
    if (!reply.trim() && !file) return;
    if (!activeGroupId) return;
    if (file && (file.size > 5 * 1024 * 1024 || !['image/', 'application/pdf'].some(type => file.type.startsWith(type)))) {
      showError("Invalid file: too large or unsupported type");
      return;
    }
    try {
      let fileUrl = "";
      if (file) {
        const storageRef = ref(storage, `groupChats/${activeGroupId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);
        const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
        transaction.set(doc(messagesRef), {
          text: reply || "",
          fileUrl: fileUrl || null,
          userId: auth.currentUser.uid,
          displayName: therapistInfo.name,
          role: "therapist",
          timestamp: serverTimestamp(),
          pinned: false,
          reactions: {},
        });
        transaction.set(typingDoc, {
          typing: false,
          name: therapistInfo.name || "Therapist",
          timestamp: serverTimestamp(),
        });
        transaction.update(doc(db, "groupChats", activeGroupId), {
          lastMessage: {
            text: reply || "Attachment",
            displayName: therapistInfo.name,
            timestamp: serverTimestamp(),
          },
        });
      });
      setReply("");
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Error sending group message:", err);
      showError("Failed to send group message. Please try again.");
    }
  };

  // Toggle reaction on message
  const toggleReaction = async (msgId, reactionType) => {
    if (!auth.currentUser || !activeGroupId) return;
    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);
    try {
      await runTransaction(db, async (transaction) => {
        const msgSnap = await transaction.get(msgRef);
        if (!msgSnap.exists()) return;
        const reactions = msgSnap.data().reactions || {};
        const userId = auth.currentUser.uid;
        const currentReactions = reactions[reactionType] || [];
        const updatedReactions = currentReactions.includes(userId)
          ? currentReactions.filter((id) => id !== userId)
          : [...currentReactions, userId];
        const updated = { ...reactions, [reactionType]: updatedReactions };
        transaction.update(msgRef, { reactions: updated });
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
      showError("Failed to update reaction. Please try again.");
    }
  };

  // Delete message
  const deleteMessage = async (msgId, chatType = "group") => {
    if (therapistInfo.role !== "therapist") return;
    const activeId = chatType === "private" ? activeChatId : activeGroupId;
    if (!activeId) return;

    try {
      await runTransaction(db, async (transaction) => {
        const messagesPath = `${chatType === "private" ? "privateChats" : "groupChats"}/${activeId}/messages`;
        const msgRef = doc(db, messagesPath, msgId);
        transaction.delete(msgRef);

        const eventsPath = `${chatType === "private" ? "privateChats" : "groupChats"}/${activeId}/events`;
        transaction.set(doc(collection(db, eventsPath)), {
          type: "delete",
          user: therapistInfo.name,
          text: `Message deleted by ${therapistInfo.name}`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
    } catch (err) {
      console.error("Error deleting message:", err);
      showError("Failed to delete message. Please try again.");
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const therapistRef = doc(db, "therapistsOnline", uid);
      await runTransaction(db, async (transaction) => {
        if (activeChatId) {
          const chatRef = await transaction.get(doc(db, "privateChats", activeChatId));
          if (chatRef.exists()) {
            const now = Date.now();
            transaction.set(doc(collection(chatRef, "events")), {
              type: "leave",
              user: displayName,
              text: `${displayName} left the chat.`,
              role: "system",
              timestamp: serverTimestamp(),
            });
            transaction.update(chatRef, {
              participants: arrayRemove(uid),
              aiOffered: true,
              aiActive: false,
              therapistJoinedOnce: false,
              lastLeaveEvent: now,
              lastLeaveAiOffered: now,
              needsTherapist: false,
            });
          }
        }
        transaction.set(therapistRef, {
          name: displayName || auth.currentUser.email,
          online: false,
          lastSeen: serverTimestamp(),
        });
      });
      await signOut(auth);
      setTherapistInfo({
        name: "",
        gender: "",
        position: "",
        profile: "",
        rating: 0,
      });
      setMessages([]);
      setPrivateChats([]);
      setActiveChatId(null);
      setActiveGroupId(null);
      setPrivateMessages([]);
      setPrivateEvents([]);
      navigate("/therapist-login");
    } catch (err) {
      console.error("Logout error:", err);
      showError("Failed to logout. Please try again.");
    }
  };

  // Save therapist profile
  const saveProfile = async () => {
    if (!therapistId) return;
    try {
      await setDoc(doc(db, "therapists", therapistId), therapistInfo, { merge: true });
      alert("Profile saved successfully!");
      setEditing(false);
    } catch (err) {
      console.error("Error saving profile:", err);
      showError("Failed to save profile. Please try again.");
    }
  };

  // Join group chat
  const joinGroupChat = async (groupId) => {
    if (!auth.currentUser) return;
    try {
      const groupRef = doc(db, "groupChats", groupId);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) {
        throw new Error("Group chat does not exist");
      }
      const lastMsgsTime = messages[messages.length - 1]?.timestamp?.toMillis() || Date.now();
      await runTransaction(db, async (transaction) => {
        transaction.update(groupRef, { 
          participants: arrayUnion(auth.currentUser.uid),
          unreadCount: 0
        });
        transaction.set(
          doc(db, "therapists", therapistId),
          { lastSeenGroupChat: serverTimestamp() },
          { merge: true }
        );
      });
      setLastSeenTimestamp(lastMsgsTime);
      setIsGroupChatOpen(true);
      setInGroupChat(true);
      setActiveGroupId(groupId);
      navigate(`/therapist-dashboard/group-chat/${groupId}`);
    } catch (err) {
      console.error("Error joining group chat:", err);
      showError("Failed to join group chat. Please try again.");
    }
  };

  // Leave group chat
  const leaveGroupChat = async () => {
    if (!auth.currentUser || !activeGroupId) return;
    try {
      const groupRef = doc(db, "groupChats", activeGroupId);
      const lastMsgTime = messages[messages.length - 1]?.timestamp?.toMillis() || Date.now();
      await runTransaction(db, async (transaction) => {
        transaction.update(groupRef, { participants: arrayRemove(auth.currentUser.uid) });
        transaction.set(
          doc(db, "therapists", therapistId),
          { lastSeenGroupChat: serverTimestamp() },
          { merge: true }
        );
        transaction.set(doc(collection(groupRef, "events")), {
          type: "leave",
          user: displayName,
          timestamp: serverTimestamp(),
        });
      });
      setIsGroupChatOpen(false);
      setInGroupChat(false);
      setLastSeenTimestamp(lastMsgTime);
      setActiveGroupId(null);
      navigate("/therapist-dashboard/group-chat");
    } catch (err) {
      console.error("Error leaving group chat:", err);
      showError("Failed to leave group chat. Please try again.");
    }
  };

  // Join private chat
  const joinPrivateChat = async (chatId) => {
    if (!auth.currentUser) return;
    const chatRef = doc(db, "privateChats", chatId);
    const uid = auth.currentUser.uid;
    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) {
          transaction.set(chatRef, {
            participants: [uid],
            lastMessage: "",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: 0,
            aiActive: false,
            aiOffered: false,
            therapistJoinedOnce: true,
            lastJoinEvent: Date.now(),
            needsTherapist: false,
          });
          transaction.set(doc(collection(chatRef, "events")), {
            type: "join",
            user: displayName,
            text: `A therapist "${displayName}" has joined. You can now continue your conversation with them.`,
            role: "system",
            timestamp: serverTimestamp(),
          });
        } else {
          const chatData = chatSnap.data();
          if (!chatData.participants.includes(uid)) {
            transaction.update(chatRef, {
              participants: arrayUnion(uid),
              therapistJoinedOnce: true,
              aiOffered: false,
              aiActive: false,
              unreadCountForTherapist: 0,
              lastJoinEvent: Date.now(),
              needsTherapist: false,
            });
            transaction.set(doc(collection(chatRef, "events")), {
              type: "join",
              user: displayName,
              text: `A therapist "${displayName}" has joined. You can now continue your conversation with them.`,
              role: "system",
              timestamp: serverTimestamp(),
            });
          } else {
            transaction.update(chatRef, {
              unreadCountForTherapist: 0,
              needsTherapist: false,
            });
          }
        }
      });
      setActiveChatId(chatId);
      setChatError(null);
      navigate(`/therapist-dashboard/private-chat/${chatId}`);
    } catch (err) {
      console.error("Error joining private chat:", err);
      setChatError("Failed to join private chat. Please try again.");
      setActiveChatId(null);
      navigate("/therapist-dashboard/private-chat");
    }
  };

  // Leave private chat
  const leavePrivateChat = async () => {
    if (!activeChatId || !auth.currentUser) return;
    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        const now = Date.now();
        transaction.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: displayName,
          text: `${displayName} left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
        transaction.update(chatRef, {
          participants: arrayRemove(auth.currentUser.uid),
          aiOffered: true,
          aiActive: false,
          therapistJoinedOnce: false,
          lastLeaveEvent: now,
          lastLeaveAiOffered: now,
          needsTherapist: false,
        });
      });
      setActiveChatId(null);
      setPrivateMessages([]);
      setPrivateEvents([]);
      setChatError(null);
      navigate("/therapist-dashboard/private-chat");
    } catch (err) {
      console.error("Error leaving private chat:", err);
      if (err.message === "Chat document does not exist") {
        setChatError("This chat no longer exists.");
      } else {
        setChatError("Failed to leave chat. Please try again.");
      }
      setActiveChatId(null);
      navigate("/therapist-dashboard/private-chat");
    }
  };

  // Send private chat message
  const sendPrivateMessage = async (file = null) => {
    const text = newPrivateMessage.trim();
    if (!text && !file) return;
    if (!activeChatId || !auth.currentUser) return;
    
    if (file && (file.size > 5 * 1024 * 1024 || !['image/', 'application/pdf'].some(type => file.type.startsWith(type)))) {
      showError("Invalid file: too large or unsupported type");
      return;
    }

    setIsSendingPrivate(true);
    try {
      let fileUrl = "";
      if (file) {
        const storageRef = ref(storage, `privateChats/${activeChatId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }

      await runTransaction(db, async (transaction) => {
        const chatRef = doc(db, "privateChats", activeChatId);
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");

        transaction.set(doc(collection(chatRef, "messages")), {
          text: text || "",
          fileUrl: fileUrl || null,
          userId: auth.currentUser.uid,
          displayName: therapistName,
          role: "therapist",
          timestamp: serverTimestamp(),
        });
        transaction.update(chatRef, {
          lastMessage: text || "Attachment",
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: 0,
          needsTherapist: false,
        });
      });
      setNewPrivateMessage("");
    } catch (err) {
      console.error("Error sending private message:", err);
      showError(err.message === "Chat document does not exist" ? "This chat no longer exists." : "Failed to send message.");
      setActiveChatId(null);
      navigate("/therapist-dashboard/private-chat");
    } finally {
      setIsSendingPrivate(false);
    }
  };

  // Handle therapist profile click
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") {
      showError("Cannot view profile: Not a therapist message.");
      return;
    }
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      if (snap.exists()) setSelectedTherapist(snap.data());
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      showError("Failed to fetch therapist profile. Please try again.");
    }
  };

  // Combines use getTimestampMillis
  const combinedPrivateChat = [...privateMessages, ...privateEvents].sort((a, b) => {
    return getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp);
  });

  const combinedGroupChat = [...messages, ...groupEvents].sort((a, b) => {
    return getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp);
  });

  return (
    <div className="therapist-dashboard">
      <Sidebar
        groupUnreadCount={totalGroupUnread}
        privateUnreadCount={privateUnreadCount}
        onLogout={handleLogout}
        onToggle={handleToggleSidebar}
      />
      <div className={`box ${isSidebarOpen ? "open" : "closed"}`}>
        {errorMsg && (
          <div className={`error-toast ${isErrorFading ? 'fade-out' : ''}`}>
            {errorMsg}
            <button className="error-close-btn" 
            onClick={closeError}
            aria-label="Close error message"
            >
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
                    Welcome, <span className="highlight">{therapistInfo.name || "Therapist"}</span>!
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
                isGroupChatOpen={isGroupChatOpen}
                inGroupChat={inGroupChat}
                therapistsOnline={therapistsOnline}
                participants={participants}
                isParticipantsOpen={isParticipantsOpen}
                setIsParticipantsOpen={setIsParticipantsOpen}
                participantNames={participantNames}
                combinedGroupChat={combinedGroupChat}
                typingUsers={typingUsers}
                messagesEndRef={messagesEndRef}
                showEmojiPicker={showEmojiPicker}
                setShowEmojiPicker={setShowEmojiPicker}
                reply={reply}
                setReply={setReply}
                handleTyping={handleTyping}
                sendReply={sendReply}
                joinGroupChat={joinGroupChat}
                leaveGroupChat={leaveGroupChat}
                therapistInfo={therapistInfo}
                toggleReaction={toggleReaction}
                deleteMessage={deleteMessage}
                handleTherapistClick={handleTherapistClick}
                isLoadingChats={isLoadingChats}
                formatTimestamp={formatTimestamp}
                onEmojiClick={onEmojiClick}
              />
            }
          />
          <Route
            path="/private-chat/*"
            element={
              <PrivateChatSplitView
                privateChats={privateChats}
                activeChatId={activeChatId}
                isValidatingChat={isValidatingChat}
                chatError={chatError}
                isTherapistAvailable={isTherapistAvailable}
                activeTherapists={activeTherapists}
                selectedTherapist={selectedTherapist}
                setSelectedTherapist={setSelectedTherapist}
                combinedPrivateChat={combinedPrivateChat}
                typingUsers={typingUsers}
                privateMessagesEndRef={privateMessagesEndRef}
                showEmojiPicker={showEmojiPicker}
                setShowEmojiPicker={setShowEmojiPicker}
                newPrivateMessage={newPrivateMessage}
                setNewPrivateMessage={setNewPrivateMessage}
                handleTyping={handleTyping}
                sendPrivateMessage={sendPrivateMessage}
                isSendingPrivate={isSendingPrivate}
                joinPrivateChat={joinPrivateChat}
                leavePrivateChat={leavePrivateChat}
                handleTherapistClick={handleTherapistClick}
                navigate={navigate}
                therapistInfo={therapistInfo}
                toggleReaction={toggleReaction}
                deleteMessage={deleteMessage}
                isLoadingChats={isLoadingChats}
                formatTimestamp={formatTimestamp}
                onEmojiClick={onEmojiClick}
                anonNames={anonNames}
                showError={showError}
              />
            }
          />
          <Route
            path="/appointments"
            element={
              <div className="appointments">
                <h3>Appointments</h3>
                <p>View and manage your appointments here. (Feature coming soon)</p>
              </div>
            }
          />
          <Route
            path="/clients"
            element={
              <div className="clients">
                <h3>Clients</h3>
                <p>Manage your client list and view client details. (Feature coming soon)</p>
              </div>
            }
          />
          <Route
            path="/notifications"
            element={
              <div className="notifications">
                <h3>Notifications</h3>
                <ul>
                  {privateChats
                    .filter((chat) => chat.unreadCountForTherapist > 0)
                    .map((chat) => (
                      <li key={chat.id} className="notification-item" onClick={() => joinPrivateChat(chat.id)}>
                        New messages in Private Chat {chat.id} ({chat.unreadCountForTherapist})
                      </li>
                    ))}
                  {groupChats.some((group) => group.unreadCount > 0) && (
                    <li className="notification-item" onClick={() => navigate("/therapist-dashboard/group-chat")}>
                      New messages in Group Chats
                    </li>
                  )}
                  {privateChats.every((chat) => chat.unreadCountForTherapist === 0) &&
                    groupChats.every((group) => group.unreadCount === 0) && (
                      <li>No new notifications</li>
                    )}
                </ul>
              </div>
            }
          />
          <Route
            path="/profile"
            element={
              <div className="profile">
                <div className="therapist-profile">
                  {editing ? (
                    <div className="profile-edit">
                      <input
                        type="text"
                        placeholder="Name"
                        value={therapistInfo.name}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, name: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Gender"
                        value={therapistInfo.gender}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, gender: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Position"
                        value={therapistInfo.position}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, position: e.target.value }))}
                      />
                      <textarea
                        placeholder="Profile description"
                        value={therapistInfo.profile}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, profile: e.target.value }))}
                      />
                      <input
                        type="number"
                        placeholder="Rating"
                        value={therapistInfo.rating}
                        onChange={(e) =>
                          setTherapistInfo((prev) => ({ ...prev, rating: parseFloat(e.target.value) || 0 }))
                        }
                        min={0}
                        max={5}
                        step={0.1}
                      />
                      <button onClick={saveProfile}>Save</button>
                      <button onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="profile-view">
                      <p>
                        <strong>Name:</strong> {therapistInfo.name}
                      </p>
                      <p>
                        <strong>Gender:</strong> {therapistInfo.gender}
                      </p>
                      <p>
                        <strong>Position:</strong> {therapistInfo.position}
                      </p>
                      <p>
                        <strong>About:</strong> {therapistInfo.profile}
                      </p>
                      <p>
                        <strong>Rating:</strong> <span className="rating">⭐ {therapistInfo.rating}</span>
                      </p>
                      <button onClick={() => setEditing(true)}>Edit Profile</button>
                    </div>
                  )}
                </div>
              </div>
            }
          />
          <Route
            path="/settings"
            element={
              <div className="settings">
                <h3>Settings</h3>
                <p>Adjust notification preferences and chat settings. (Feature coming soon)</p>
              </div>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default TherapistDashboard;