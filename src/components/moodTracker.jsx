import { useState, useEffect, useMemo } from "react";
import { collection, setDoc, doc, query, where, onSnapshot, limit, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../utils/firebase";

const MoodTracker = ({ formatTimestamp }) => {
  const [mood, setMood] = useState("");
  const [lastLoggedMood, setLastLoggedMood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Mood options with emojis, memoized to prevent recreation on every render
  const moodOptions = useMemo(() => [
    { value: "happy", label: "Happy", emoji: "😊" },
    { value: "sad", label: "Sad", emoji: "😢" },
    { value: "anxious", label: "Anxious", emoji: "😣" },
    { value: "neutral", label: "Neutral", emoji: "😐" },
    { value: "excited", label: "Excited", emoji: "😊" }
  ], []);

  // Helper function to format timestamp
  const renderTimestamp = (timestamp) => {
    if (!timestamp) return "Unknown time";
    const formatted = formatTimestamp(timestamp);
    if (typeof formatted === "object" && formatted.dateStr && formatted.timeStr) {
      return (
        <>
          <span className="meta-date">{formatted.dateStr}</span>
          <span className="meta-time">{formatted.timeStr}</span>
        </>
      );
    }
    return formatted || "Unknown time";
  };

  // Fetch moods and sort client-side
  const fetchLastMood = () => {
    setLoading(true);
    setError(null);
    const userId = auth.currentUser?.uid || "anonymous";
    const q = query(
      collection(db, "moods"),
      where("userId", "==", userId),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Sort moods client-side by timestamp
        const moods = snapshot.docs.map(doc => doc.data());
        const latestMood = moods.sort((a, b) => {
          const aTime = a.timestamp?.seconds || 0;
          const bTime = b.timestamp?.seconds || 0;
          return bTime - aTime; // Descending order
        })[0];
        if (latestMood) {
          setLastLoggedMood({
            mood: moodOptions.find((m) => m.value === latestMood.mood) || { label: latestMood.mood, emoji: "❓" },
            timestamp: latestMood.timestamp
          });
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching moods:", error);
      setError("Failed to load last mood. Please try again.");
      setLoading(false);
    });
    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = fetchLastMood();
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
        setError(null);
        // Refetch moods after logging
        fetchLastMood();
      } catch (error) {
        setError("Failed to log mood. Please try again.");
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
        disabled={!mood || loading}
      >
        Log Mood
      </button>
      {loading && <div className="last-mood"><p>Loading last mood...</p></div>}
      {error && (
        <div className="last-mood error">
          <p>{error}</p>
          <button
            className="retry-button"
            onClick={fetchLastMood}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && lastLoggedMood && (
        <div className="last-mood">
          <p>
            Last logged: {lastLoggedMood.mood.emoji} {lastLoggedMood.mood.label} on{" "}
            {renderTimestamp(lastLoggedMood.timestamp)}
          </p>
        </div>
      )}
    </div>
  );
};

export default MoodTracker;