import { signInAnonymously } from "firebase/auth";
import { auth } from "../utils/firebase";
export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    console.log("Logged in anonymously:", result.user.uid);

    // Assign a random display name
    if (!localStorage.getItem("anonName")) {
      const randomNum = Math.floor(100 + Math.random() * 900); // random 3-digit
      const anonName = `Anonymous${randomNum}`;
      localStorage.setItem("anonName", anonName);
    }
  } catch (error) {
    console.error("Login error:", error);
  }
};

// Helper to get the display name
export const getAnonName = () => {
  return localStorage.getItem("anonName") || "Anonymous";
};
