import { signInAnonymously } from "firebase/auth";
import { auth, db, doc, setDoc, serverTimestamp } from "../utils/firebase";

export const loginAnonymously = async () => {
  const result = await signInAnonymously(auth);
  const user = result.user;

  let anonName = localStorage.getItem("anonName");
  if (!anonName) {
    anonName = `Anonymous${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem("anonName", anonName);
  }

  await setDoc(doc(db, "anonymousUsers", user.uid), {
    anonymousName: anonName,
    createdAt: serverTimestamp(),
  }, { merge: true });

  return user;
};

// Helper to get the display name
export const getAnonName = () => {
  return localStorage.getItem("anonName") || "Anonymous";
};