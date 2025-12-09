import { signInAnonymously, signOut } from "firebase/auth";
import { auth, db, doc, setDoc, serverTimestamp } from "../utils/firebase";
import { getDoc } from "firebase/firestore"

export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    const user = result.user;

    // Check if this anonymous user is banned
    const anonDocRef = doc(db, "anonymousUsers", user.uid);
    const anonDoc = await getDoc(anonDocRef);

    if (anonDoc.exists() && anonDoc.data().banned === true) {
      await signOut(auth);
      alert("You have been banned from using this service.");
      throw new Error("Banned anonymous user");
    }

    // Generate or retrieve anonymous name (e.g. Anonymous1234)
    let anonName = localStorage.getItem("anonName");
    if (!anonName) {
      anonName = `Anonymous${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("anonName", anonName);
    }

    // Save/update profile
    await setDoc(anonDocRef, {
      anonymousName: anonName,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      online: true
    }, { merge: true });

    return user;

  } catch (error) {
    console.error("Anonymous login failed:", error);
    throw error;
  }
};

// Helper to get the display name
export const getAnonName = () => {
  return localStorage.getItem("anonName") || "Anonymous";
};