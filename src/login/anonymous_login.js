import { signInAnonymously, signOut } from "firebase/auth";
import { auth, db, doc, serverTimestamp } from "../utils/firebase";
import {  setDoc, getDoc } from "firebase/firestore"

export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    const user = result.user;

    const anonDocRef = doc(db, "anonymousUsers", user.uid);
    const anonDoc = await getDoc(anonDocRef);

    // BLOCK BANNED USERS FROM RE-LOGGING IN
    if (anonDoc.exists() && anonDoc.data().banned === true) {
      await signOut(auth);
      const reason = anonDoc.data().banReason || "No reason provided";
      alert(`You have been banned.\n\nReason: ${reason}`);
      throw new Error("Banned user");
    }

    let anonName = localStorage.getItem("anonName");
    if (!anonName) {
      anonName = `Anonymous${Math.floor(100 + Math.random() * 9000)}`;
      localStorage.setItem("anonName", anonName);
    }

    await setDoc(anonDocRef, {
      anonymousName: anonName,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      online: true,
      banned: false,
      banReason: null,
    }, { merge: true });

    return user;
  } catch (error) {
    console.error("Anonymous login failed:", error);
    throw error;
  }
}

// Helper to get the display name
export const getAnonName = () => {
  return localStorage.getItem("anonName") || "Anonymous";
};