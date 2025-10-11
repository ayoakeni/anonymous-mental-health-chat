import React, { useEffect, useState, useRef } from "react";
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
  getDocs,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { debounce } from "lodash";
import { useTypingStatus } from "../components/useTypingStatus";
import { signOut } from "firebase/auth";
import LeaveChatButton from "../components/LeaveChatButton";
import Sidebar from "../components/sidebar";
import EmojiPicker from 'emoji-picker-react';
import "../styles/therapistDashboard.css";

function TherapistDashboard() {
  const [messages, setMessages] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [reply, setReply] = useState("");
  const [privateChats, setPrivateChats] = useState([]);
  const [isGroupChatOpen, setIsGroupChatOpen] = useState(false);
  const [inGroupChat, setInGroupChat] = useState(false);
  const [groupUnreadCount, setGroupUnreadCount] = useState(0);
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
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
  const [participants, setParticipants] = useState([]); // For group chat participants
  const [showEmojiPicker, setShowEmojiPicker] = useState(false); // For emoji picker
  const [therapistsOnline, setTherapistsOnline] = useState([]); // For availability indicator
  const therapistId = auth.currentUser?.uid;
  const displayName = therapistInfo.name || "Unknown Therapist";
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  const privateMessagesEndRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { chatId } = useParams();

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

  // Calculate total private unread count
  const privateUnreadCount = privateChats.reduce(
    (sum, chat) => sum + (chat.unreadCountForTherapist || 0),
    0
  );

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
      alert("Failed to fetch therapist status. Please try again.");
    });
    return () => unsub();
  }, []);

  // Watch group chat participants
  useEffect(() => {
    const groupRef = doc(db, "groupChats", "mainGroup");
    const unsub = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        setParticipants(snap.data().participants || []);
      }
    });
    return () => unsub();
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
        console.log("Chat data:", JSON.stringify(chatData, null, 2));
        let isParticipant = chatData.participants?.includes(therapistId);
        let needsTherapist = chatData.needsTherapist === true;
        console.log("isParticipant:", isParticipant, "needsTherapist:", needsTherapist, "therapistId:", therapistId);

        if (!isParticipant && !needsTherapist) {
          console.log("Initial validation failed: Therapist not in participants and needsTherapist is false");
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
          console.log("Recent join event:", recentJoin, "isRecentJoin:", isRecentJoin);

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
        console.log("Private chats (participant) snapshot received:", snapshot.docs.length);
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
          alert("Failed to load private chats after retries. Please try again.");
        }
      });
      const unsubscribe2 = onSnapshot(q2, (snapshot) => {
        console.log("Private chats (needsTherapist) snapshot received:", snapshot.docs.length);
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
  }, [therapistId]);

  // Watch private chat messages
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribeMessages = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPrivateMessages(msgs);
        runTransaction(db, async (transaction) => {
          const chatSnap = await transaction.get(chatRef);
          if (chatSnap.exists()) {
            transaction.update(chatRef, { unreadCountForTherapist: 0 });
          }
        }).catch((err) => {
          console.error("Error resetting unread count:", err);
          alert("Failed to reset unread count. Please try again.");
        });
      },
      (err) => {
        console.error("Error fetching private messages:", err);
        setChatError("Failed to load private messages. Please try again.");
      }
    );
    return () => unsubscribeMessages();
  }, [activeChatId]);

  // Watch private chat events
  useEffect(() => {
    if (!activeChatId) return;
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

  // Group messages listener + unread count
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setMessages(msgs);
        if (!isGroupChatOpen) {
          const unread = msgs.filter((msg) => {
            const msgTime = msg.timestamp?.toMillis();
            return msgTime && (!lastSeenTimestamp || msgTime > lastSeenTimestamp);
          }).length;
          setGroupUnreadCount(unread);
        }
      },
      (err) => {
        console.error("Error fetching group messages:", err);
        alert("Failed to load group messages. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [isGroupChatOpen, lastSeenTimestamp]);

  // Watch group chat events
  useEffect(() => {
    const groupRef = doc(db, "groupChats", "mainGroup");
    const q = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setGroupEvents(evts);
      },
      (err) => {
        console.error("Error fetching group events:", err);
        alert("Failed to load group events. Please try again.");
      }
    );
    return () => unsubscribe();
  }, []);

  // Watch group chat participation
  useEffect(() => {
    if (!auth.currentUser) return;
    const groupRef = doc(db, "groupChats", "mainGroup");
    const unsub = onSnapshot(
      groupRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const isParticipant = data.participants?.includes(auth.currentUser.uid) || false;
          setInGroupChat(isParticipant);
          setIsGroupChatOpen(isParticipant && isGroupChatOpen);
        }
      },
      (err) => {
        console.error("Error fetching group chat data:", err);
        alert("Failed to load group chat data. Please try again.");
      }
    );
    return () => unsub();
  }, [isGroupChatOpen]);

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
      alert("Failed to fetch last seen timestamp. Please try again.");
    });
  }, [therapistId]);

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
        alert("Failed to fetch therapist profile. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [therapistId]);

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
          const groupChatRef = await transaction.get(doc(db, "groupChats", "mainGroup"));
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
        });
      } catch (err) {
        console.error("Error auto-leaving chats:", err);
        alert("Failed to auto-leave chats. Please try again.");
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
  }, [activeChatId, displayName]);

  // Send message to group chat with file support
  const sendReply = async (file = null) => {
    if (!reply.trim() && !file) return; // Modified to allow sending files without text
    try {
      let fileUrl = "";
      if (file) {
        const storageRef = ref(storage, `groupChat/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, "messages");
        const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
        transaction.set(doc(messagesRef), {
          text: reply || "", // Allow empty text if file is present
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
      });
      setReply("");
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Error sending group message:", err);
      alert("Failed to send group message. Please try again.");
    }
  };

  // Toggle reaction on message
  const toggleReaction = async (msgId, reactionType) => {
    if (!auth.currentUser) return;
    const msgRef = doc(db, "messages", msgId);
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
      alert("Failed to update reaction. Please try again.");
    }
  };

  // Delete message (moderation)
  const deleteMessage = async (msgId) => {
    if (therapistInfo.role !== "therapist") return;
    try {
      await runTransaction(db, async (transaction) => {
        transaction.delete(doc(db, "messages", msgId));
        const groupEventsRef = collection(db, "groupChats/mainGroup/events");
        transaction.set(doc(groupEventsRef), {
          type: "delete",
          user: therapistInfo.name,
          text: `Message deleted by ${therapistInfo.name}`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
    } catch (err) {
      console.error("Error deleting message:", err);
      alert("Failed to delete message. Please try again.");
    }
  };

  // Handle emoji click
  const onEmojiClick = (emojiData) => {
    setReply(reply + emojiData.emoji);
    setShowEmojiPicker(false);
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
      setPrivateMessages([]);
      setPrivateEvents([]);
      navigate("/therapist-login");
    } catch (err) {
      console.error("Logout error:", err);
      alert("Failed to logout. Please try again.");
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
      alert("Failed to save profile. Please try again.");
    }
  };

  // Join group chat
  const joinGroupChat = async () => {
    if (!auth.currentUser) return;
    try {
      const lastMsgTime = messages[messages.length - 1]?.timestamp?.toMillis() || Date.now();
      await runTransaction(db, async (transaction) => {
        const groupRef = doc(db, "groupChats", "mainGroup");
        transaction.set(groupRef, { participants: arrayUnion(auth.currentUser.uid) }, { merge: true });
        transaction.set(
          doc(db, "therapists", therapistId),
          { lastSeenGroupChat: serverTimestamp() },
          { merge: true }
        );
      });
      setLastSeenTimestamp(lastMsgTime);
      setIsGroupChatOpen(true);
      setInGroupChat(true);
      setGroupUnreadCount(0);
      navigate("/therapist-dashboard/group-chat");
    } catch (err) {
      console.error("Error joining group chat:", err);
      alert("Failed to join group chat. Please try again.");
    }
  };

  // Leave group chat
  const leaveGroupChat = async () => {
    if (!auth.currentUser) return;
    try {
      const lastMsgTime = messages[messages.length - 1]?.timestamp?.toMillis() || Date.now();
      await runTransaction(db, async (transaction) => {
        const groupRef = doc(db, "groupChats", "mainGroup");
        transaction.set(
          doc(db, "therapists", therapistId),
          { lastSeenGroupChat: serverTimestamp() },
          { merge: true }
        );
        transaction.update(groupRef, { participants: arrayRemove(auth.currentUser.uid) });
      });
      setIsGroupChatOpen(false);
      setInGroupChat(false);
      setGroupUnreadCount(0);
      setLastSeenTimestamp(lastMsgTime);
      navigate("/therapist-dashboard/group-chat");
    } catch (err) {
      console.error("Error leaving group chat:", err);
      alert("Failed to leave group chat. Please try again.");
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
  const sendPrivateMessage = async () => {
    if (!newPrivateMessage.trim() || !auth.currentUser || !activeChatId) return;
    setIsSendingPrivate(true);
    const chatRef = doc(db, "privateChats", activeChatId);
    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.set(doc(collection(chatRef, "messages")), {
          text: newPrivateMessage,
          userId: auth.currentUser.uid,
          displayName: therapistName,
          role: "therapist",
          timestamp: serverTimestamp(),
        });
        transaction.update(chatRef, {
          lastMessage: newPrivateMessage,
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: 0,
          needsTherapist: false,
        });
      });
      setNewPrivateMessage("");
      setIsSendingPrivate(false);
    } catch (err) {
      console.error("Error sending private message:", err);
      if (err.message === "Chat document does not exist") {
        setChatError("This chat no longer exists.");
      } else {
        setChatError("Failed to send private message. Please try again.");
      }
      setActiveChatId(null);
      navigate("/therapist-dashboard/private-chat");
    } finally {
      setIsSendingPrivate(false);
    }
  };

  // Handle therapist profile click
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      if (snap.exists()) setSelectedTherapist(snap.data());
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      alert("Failed to fetch therapist profile. Please try again.");
    }
  };

  // Combine private messages and events
  const combinedPrivateChat = [...privateMessages, ...privateEvents].sort((a, b) => {
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
  });

  // Combine group messages and events
  const combinedGroupChat = [...messages, ...groupEvents].sort((a, b) => {
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
  });

  return (
    <div className="therapist-dashboard">
      <Sidebar
        groupUnreadCount={groupUnreadCount}
        privateUnreadCount={privateUnreadCount}
        onLogout={handleLogout}
        onToggle={handleToggleSidebar}
      />
      <div className={`box ${isSidebarOpen ? "open" : "closed"}`}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <div className="welcome-header">
                  <h2>
                    Welcome, <span className="highlight">{therapistInfo.name || "Therapist"}</span>!
                  </h2>
                </div>
              </>
            }
          />
          <Route
            path="/group-chat"
            element={
              isGroupChatOpen && inGroupChat ? (
                <div className="group-chat">
                  <div className="detailLeave">
                    <h3 className="onlineStatus">
                      Group Chat{" "}
                      {therapistsOnline.length > 0
                        ? `(Therapists Online: ${therapistsOnline.map((t) => t.name).join(", ")})`
                        : "(No therapists online)"}
                    </h3>
                    <LeaveChatButton type="group" therapistInfo={therapistInfo} onLeave={leaveGroupChat} />
                  </div>
                  <div className="participant-list">
                    <h4>Participants ({participants.length})</h4>
                    {participants.map((uid) => (
                      <div key={displayName} className="participant-item">
                        {displayName}
                      </div>
                    ))}
                  </div>
                  {combinedGroupChat.some((msg) => msg.pinned) && (
                    <div className="pinned-message">
                      <strong>Pinned:</strong>{" "}
                      {combinedGroupChat.find((msg) => msg.pinned)?.text || "Welcome to the group chat!"}
                    </div>
                  )}
                  <div className="chat-box">
                    {combinedGroupChat.map((msg) => (
                      <p
                        key={msg.id}
                        className={`chat-message ${
                          msg.role === "therapist"
                            ? "therapist"
                            : msg.role === "ai"
                            ? "ai"
                            : msg.role === "system"
                            ? "system"
                            : "user"
                        }`}
                        onClick={() => handleTherapistClick(msg)}
                      >
                        <strong>{msg.displayName || msg.user || "Anonymous"}</strong>{" "}
                        <div className="message-content-time">
                          <span>{msg.text || msg.message}</span>
                          {msg.fileUrl && (
                            <a
                              href={msg.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="attachment-link"
                            >
                              <i class="fa-solid fa-paperclip"></i> View Attachment
                            </a>
                          )}
                          <span className="message-timestamp">
                            {msg.timestamp?.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="message-reactions">
                            <i
                              className="fa-solid fa-heart reaction"
                              style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReaction(msg.id, "heart");
                              }}
                            >
                              {msg.reactions?.heart?.length || 0}
                            </i>
                            <i
                              className="fa-solid fa-thumbs-up reaction"
                              style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReaction(msg.id, "thumbsUp");
                              }}
                            >
                              {msg.reactions?.thumbsUp?.length || 0}
                            </i>
                          </span>
                        </div>
                        {msg.role !== "system" && therapistInfo.role === "therapist" && (
                          <button
                            className="delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMessage(msg.id);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </p>
                    ))}
                    {typingUsers.length > 0 && (
                      <p className="typing-indicator">
                        {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                      </p>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="chat-input">
                    <button
                      className="emoji-btn"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    >
                      <i class="fa-regular fa-face-smile"></i>
                    </button>
                    {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}
                    <input
                      type="file"
                      id="group-file-upload"
                      style={{ display: "none" }}
                      onChange={(e) => sendReply(e.target.files[0])}
                    />
                    <button
                      className="attach-btn"
                      onClick={() => document.getElementById("group-file-upload").click()}
                    >
                      <i class="fa-solid fa-paperclip"></i>
                    </button>
                    <input
                      className="inputInsert"
                      type="text"
                      value={reply}
                      onChange={(e) => {
                        setReply(e.target.value);
                        handleTyping(e.target.value);
                      }}
                      placeholder="Reply to group chat..."
                    />
                    <button className="send-btn" onClick={() => sendReply()}>
                      <i class="fa-solid fa-paper-plane"></i>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="chat-list">
                  <h3>Group Chat</h3>
                  <div className="chat-card" onClick={joinGroupChat}>
                    <div>
                      <strong>Group Chat</strong>
                      <br />
                      <small>
                        {messages.length > 0
                          ? `${messages[messages.length - 1].displayName || "Anonymous"}: ${
                              messages[messages.length - 1].text
                            }`
                          : "No messages yet"}
                      </small>
                    </div>
                    {groupUnreadCount > 0 && <span className="unread-badge">{groupUnreadCount}</span>}
                  </div>
                </div>
              )
            }
          />
          <Route
            path="/private-chat"
            element={
              <div className="chat-list">
                <h3>Private Chats</h3>
                {isLoadingChats ? (
                  <p>Loading private chats...</p>
                ) : privateChats.length === 0 ? (
                  <p>No private chats available</p>
                ) : (
                  privateChats.map((chat) => (
                    <div key={chat.id} className="chat-card" onClick={() => joinPrivateChat(chat.id)}>
                      <div>
                        <strong>Chat ID:</strong> {chat.id} {chat.needsTherapist ? "(Needs Therapist)" : ""}
                        <br />
                        <small>{chat.lastMessage || "No messages yet"}</small>
                      </div>
                      {chat.unreadCountForTherapist > 0 && (
                        <span className="unread-badge">{chat.unreadCountForTherapist}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            }
          />
          <Route
            path="/private-chat/:chatId"
            element={
              isValidatingChat ? (
                <div className="chat-list">
                  <h3>Loading Private Chat...</h3>
                  <p>Validating chat access, please wait...</p>
                </div>
              ) : chatError ? (
                <div className="chat-list">
                  <h3>Error Loading Private Chat</h3>
                  <p>{chatError}</p>
                  <button onClick={() => navigate("/therapist-dashboard/private-chat")}>
                    Back to Private Chats
                  </button>
                </div>
              ) : activeChatId ? (
                <div className="private-chat">
                  <h3 className="onlineStatus">
                    Private Chat {activeChatId}{" "}
                    {isTherapistAvailable
                      ? `(Therapist Online: ${activeTherapists.join(", ")})`
                      : "(Waiting for Therapist)"}
                  </h3>
                  <LeaveChatButton onLeave={leavePrivateChat} />
                  {selectedTherapist && (
                    <div className="therapist-profile-card">
                      <button onClick={() => setSelectedTherapist(null)}>⬅ Back</button>
                      <h4>{selectedTherapist.name}</h4>
                      <p>{selectedTherapist.profile}</p>
                    </div>
                  )}
                  <div className="chat-container">
                    {combinedPrivateChat.map((msg) => (
                      <p
                        key={msg.id}
                        className={`chat-message ${
                          msg.role === "therapist"
                            ? "therapist"
                            : msg.role === "system"
                            ? "system"
                            : msg.role === "ai"
                            ? "ai"
                            : "user"
                        }`}
                        onClick={() => (msg.role === "therapist" ? handleTherapistClick(msg) : null)}
                      >
                        {msg.role === "system" ? (
                          <em>{msg.text}</em>
                        ) : (
                          <>
                            <strong>{msg.displayName || msg.role}:</strong> {msg.text}
                          </>
                        )}
                      </p>
                    ))}
                    {typingUsers.length > 0 && (
                      <p className="typing-indicator">
                        {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                      </p>
                    )}
                    <div ref={privateMessagesEndRef} />
                  </div>
                  <div className="chat-input">
                    <input
                      type="text"
                      value={newPrivateMessage}
                      onChange={(e) => {
                        setNewPrivateMessage(e.target.value);
                        handleTyping(e.target.value);
                      }}
                      placeholder="Type a message..."
                    />
                    <button onClick={sendPrivateMessage} disabled={isSendingPrivate}>
                      {isSendingPrivate ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="chat-list">
                  <h3>Error Loading Private Chat</h3>
                  <p>Chat not found or inaccessible. Please select a chat from the private chats list.</p>
                  <button onClick={() => navigate("/therapist-dashboard/private-chat")}>
                    Back to Private Chats
                  </button>
                </div>
              )
            }
          />
          <Route
            path="/appointments"
            element={
              <div>
                <h3>Appointments</h3>
                <p>View and manage your appointments here. (Feature coming soon)</p>
              </div>
            }
          />
          <Route
            path="/clients"
            element={
              <div>
                <h3>Clients</h3>
                <p>Manage your client list and view client details. (Feature coming soon)</p>
              </div>
            }
          />
          <Route
            path="/notifications"
            element={
              <div>
                <h3>Notifications</h3>
                <ul>
                  {privateChats
                    .filter((chat) => chat.unreadCountForTherapist > 0)
                    .map((chat) => (
                      <li key={chat.id} className="notification-item" onClick={() => joinPrivateChat(chat.id)}>
                        New messages in Private Chat {chat.id} ({chat.unreadCountForTherapist})
                      </li>
                    ))}
                  {groupUnreadCount > 0 && (
                    <li className="notification-item" onClick={joinGroupChat}>
                      {groupUnreadCount} new messages in Group Chat
                    </li>
                  )}
                  {privateChats.every((chat) => chat.unreadCountForTherapist === 0) && groupUnreadCount === 0 && (
                    <li>No new notifications</li>
                  )}
                </ul>
              </div>
            }
          />
          <Route
            path="/profile"
            element={
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
            }
          />
          <Route
            path="/settings"
            element={
              <div>
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