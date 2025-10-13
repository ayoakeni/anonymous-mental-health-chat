import { signInAnonymously } from "firebase/auth";
import { auth, db, doc, setDoc, serverTimestamp } from "../utils/firebase";

export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    const user = result.user;

    // Assign a random display name if not already set
    let anonName = localStorage.getItem("anonName");
    if (!anonName) {
      const randomNum = Math.floor(100 + Math.random() * 900); // random 3-digit
      anonName = `Anonymous${randomNum}`;
      localStorage.setItem("anonName", anonName);
      // Attempt to store in Firestore with retry
      let attempts = 3;
      while (attempts > 0) {
        try {
          await setDoc(
            doc(db, "anonymousUsers", user.uid),
            {
              anonymousName: anonName,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
          break; // Success, exit loop
        } catch (firestoreError) {
          console.error("Firestore write attempt failed:", firestoreError);
          attempts--;
          if (attempts === 0) {
            console.error("Failed to store anonymous name after retries:", firestoreError);
            // Continue without throwing, rely on localStorage
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }
    }

    return user;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

// Helper to get the display name
export const getAnonName = () => {
  return localStorage.getItem("anonName") || "Anonymous";
};