import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onSnapshot, doc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../utils/firebase";

export default function RealTimeBanGuard({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser?.isAnonymous) return;

    const unsub = onSnapshot(doc(db, "anonymousUsers", auth.currentUser.uid), (snap) => {
      if (snap.exists() && snap.data().banned) {
        alert("Your access has been revoked by an administrator.");
        signOut(auth);
        navigate("/", { replace: true });
      }
    });

    return () => unsub();
  }, [navigate]);

  return children;
}