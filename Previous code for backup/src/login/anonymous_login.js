import { signInAnonymously, signOut } from "firebase/auth";
import { auth, db } from "../utils/firebase";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";

// Global counter (shared by all anonymous users)
const GLOBAL_COUNTER_REF = doc(db, "signInCounters", "anonymousUsers");

export const loginAnonymously = async (showGlobalError) => {
  try {
    // Anonymous sign-in
    const result = await signInAnonymously(auth);
    const user = result.user;
    
    const anonDocRef = doc(db, "anonymousUsers", user.uid);
    const anonSnap = await getDoc(anonDocRef);
    
    // Block banned users from re-logging in
    if (anonSnap.exists() && anonSnap.data().banned === true) {
      await signOut(auth);
      const reason = anonSnap.data().banReason || "No reason provided";
      showGlobalError(`You have been banned.\n\nReason: ${reason}`);
      throw new Error("Banned user");
    }

    // Check for existing anonymous user
    if (anonSnap.exists()) {
      const anonName = anonSnap.data().anonymousName;
      localStorage.setItem("anonName", anonName);
      return { user, anonName };
    }

    // New anonymous user, assign unique number safely
    const anonName = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(GLOBAL_COUNTER_REF);

      const lastNumber = counterSnap.exists()
        ? counterSnap.data().lastNumber || 0
        : 0;

      const nextNumber = lastNumber + 1;
      const newAnonName = `Anonymous${nextNumber}`;

      // Update global counter
      transaction.set(
        GLOBAL_COUNTER_REF,
        { lastNumber: nextNumber },
        { merge: true }
      );

      // Create anonymous user document
      transaction.set(anonDocRef, {
        anonymousName: newAnonName,
        signInNumber: nextNumber,
        banned: false,
        banReason: null,
        createdAt: serverTimestamp(),
      });

      localStorage.setItem("anonName", newAnonName);
      return newAnonName;
    });

    return { user, anonName };

  } catch (error) {
    console.error("Anonymous login failed:", error);
    if (showGlobalError && error.message !== "Banned user") {
      showGlobalError("Anonymous login failed. Please try again.");
    }
    throw error;
  }
};

// Helper to get display name anywhere
export const getAnonName = () => {
  return localStorage.getItem("anonName") || "Anonymous user";
};