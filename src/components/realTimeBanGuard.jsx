import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { onSnapshot, doc } from "firebase/firestore";
import { auth, db } from "../utils/firebase";

export default function RealTimeBanGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!auth.currentUser) return;

    const isAnon = auth.currentUser.isAnonymous;
    const collectionName = isAnon ? "anonymousUsers" : "users";

    const unsub = onSnapshot(doc(db, collectionName, auth.currentUser.uid), (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();

      // If user is banned AND appeal not accepted → redirect to banned screen
      if (data.banned === true && data.appealStatus !== "accepted") {
        // Only redirect if we're not already on /banned to avoid loop
        if (location.pathname !== "/banned") {
          navigate("/banned", { replace: true });
        }
      }

      // If appeal was ACCEPTED, let them back in automatically
      if (data.appealStatus === "accepted" && data.banned === false) {
        if (location.pathname === "/banned") {
          navigate("/anonymous-dashboard", { replace: true });
        }
      }
    });

    return () => unsub();
  }, [navigate, location.pathname]);

  return children;
}