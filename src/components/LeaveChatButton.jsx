import { addDoc, collection, doc, updateDoc, arrayRemove, serverTimestamp, getDoc } from "firebase/firestore";
import { auth, db } from "../utils/firebase";

const LeaveChatButton = ({ type, chatId, therapistInfo, setActiveChatId, onLeave }) => {
  const handleLeave = async () => {
    try {
      if (type === "private" && chatId) {
        // Private chat logic
        const chatRef = doc(db, "privateChats", chatId);
        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: `${therapistInfo.name} left the chat`,
          role: "system",
          timestamp: serverTimestamp(),
        });
        await updateDoc(chatRef, {
          participants: arrayRemove(auth.currentUser.uid),
        });
        setActiveChatId(null);
      } else if (type === "group") {
        // Group chat logic
        let name = therapistInfo?.name || "Therapist";
        const snap = await getDoc(doc(db, "therapists", auth.currentUser.uid));
        if (snap.exists()) {
          name = snap.data().name || name;
        }

        await addDoc(collection(db, "messages"), {
          text: `${name} left the chat`,
          role: "system",
          timestamp: serverTimestamp(),
        });

        // Call the onLeave prop from TherapistDashboard to handle local state
        if (onLeave) onLeave();
      }
    } catch (err) {
      console.error("Leave chat error:", err);
    }
  };

  return (
    <button onClick={handleLeave} style={{ background: "orange", color: "white" }}>
      ⬅ Leave Chat
    </button>
  );
};

export default LeaveChatButton;