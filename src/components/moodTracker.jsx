import { useState } from "react";
import { collection, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../utils/firebase";

const MoodTracker = () => {
  const [mood, setMood] = useState("");
  const logMood = async () => {
    if (mood) {
      await setDoc(doc(collection(db, "moods")), {
        userId: auth.currentUser?.uid || "anonymous",
        mood,
        timestamp: serverTimestamp(),
      });
    }
  };
  return (
    <div className="mood-tracker">
      <h3>Log Your Mood</h3>
      <div className="inputButton">
        <select value={mood} onChange={(e) => setMood(e.target.value)}>
          <option value="">Select Mood</option>
          <option value="happy">Happy</option>
          <option value="sad">Sad</option>
          <option value="anxious">Anxious</option>
        </select>
        <button onClick={logMood}>Log Mood</button>
      </div>
    </div>
  );
};

export default MoodTracker;