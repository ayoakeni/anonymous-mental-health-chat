import { signInAnonymously, signOut } from "firebase/auth";
import { auth, db, doc, serverTimestamp } from "../utils/firebase";
import {  setDoc, getDoc } from "firebase/firestore"

export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    const user = result.user;

    const anonDocRef = doc(db, "anonymousUsers", user.uid);
    const anonDoc = await getDoc(anonDocRef);

    if (anonDoc.exists() && anonDoc.data().banned === true) {
      const reason = anonDoc.data().banReason || "No reason provided";
      await signOut(auth);
      alert(`You have been banned from using this service.\n\nReason: ${reason}`);
      throw new Error("Banned user attempted login");
    }

    // Proceed only if not banned
    let anonName = localStorage.getItem("anonName");
    if (!anonName) {
      anonName = `Anonymous${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("anonName", anonName);
    }

    await setDoc(anonDocRef, {
      anonymousName: anonName,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      online: true,
      banned: false
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