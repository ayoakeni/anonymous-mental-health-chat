import { useState, useEffect, useMemo } from "react";
import { collection, setDoc, doc, query, where, onSnapshot, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../utils/firebase";

const MoodTracker = ({ formatTimestamp }) => {
  const [mood, setMood] = useState("");
  const [lastLoggedMood, setLastLoggedMood] = useState(null);

  // Mood options with emojis, memoized to prevent recreation on every render
  const moodOptions = useMemo(() => [
    { value: "happy", label: "Happy", emoji: "😊" },
    { value: "sad", label: "Sad", emoji: "😢" },
    { value: "anxious", label: "Anxious", emoji: "😣" },
    { value: "neutral", label: "Neutral", emoji: "😐" },
    { value: "excited", label: "Excited", emoji: "😊" }
  ], []);

  // Fetch the last logged mood
  useEffect(() => {
    const userId = auth.currentUser?.uid || "anonymous";
    const q = query(
      collection(db, "moods"),
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const moodData = snapshot.docs[0].data();
        setLastLoggedMood({
          mood: moodOptions.find((m) => m.value === moodData.mood) || { label: moodData.mood, emoji: "❓" },
          timestamp: moodData.timestamp
        });
      }
    }, (error) => {
      console.error("Error fetching last mood:", error);
    });
    return () => unsubscribe();
  }, [moodOptions]);

  // Handle mood logging
  const logMood = async () => {
    if (mood) {
      try {
        await setDoc(doc(collection(db, "moods")), {
          userId: auth.currentUser?.uid || "anonymous",
          mood,
          timestamp: serverTimestamp(),
        });
        setMood(""); // Reset selection
      } catch (error) {
        console.error("Error logging mood:", error);
      }
    }
  };

  return (
    <div className="mood-tracker">
      <div className="mood-options">
        {moodOptions.map((option) => (
          <button
            key={option.value}
            className={`mood-button ${mood === option.value ? "selected" : ""}`}
            onClick={() => setMood(option.value)}
            title={option.label}
          >
            {option.emoji}
          </button>
        ))}
      </div>
      <button
        className="log-mood-button"
        onClick={logMood}
        disabled={!mood}
      >
        Log Mood
      </button>
      {lastLoggedMood && (
        <div className="last-mood">
          <p>
            Last logged: {lastLoggedMood.mood.emoji} {lastLoggedMood.mood.label} on{" "}
            {formatTimestamp ? formatTimestamp(lastLoggedMood.timestamp) : "Unknown time"}
          </p>
        </div>
      )}
    </div>
  );
};

export default MoodTracker;