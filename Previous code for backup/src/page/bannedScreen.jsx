import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../utils/firebase";
import { signOut } from "firebase/auth";

export default function BannedScreen() {
  const [info, setInfo] = useState(null);
  const [appeal, setAppeal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchBanInfo = async () => {
      if (!auth.currentUser) return;
      const col = auth.currentUser.isAnonymous ? "anonymousUsers" : "users";
      const snap = await getDoc(doc(db, col, auth.currentUser.uid));
      if (snap.exists()) setInfo(snap.data());
    };
    fetchBanInfo();
  }, []);

  const submitAppeal = async () => {
    if (!appeal.trim() || submitting) return;

    setSubmitting(true);
    try {
      const col = auth.currentUser.isAnonymous ? "anonymousUsers" : "users";
      await updateDoc(doc(db, col, auth.currentUser.uid), {
        appealMessage: appeal.trim(),
        appealStatus: "pending",
        appealSubmittedAt: new Date(),
        appealSubmitted: true,
      });
      alert("Appeal submitted! We'll review it soon.");
      setAppeal("");
    } catch (e) {
      alert("Failed to submit appeal.");
    }
    setSubmitting(false);
  };

  if (!info) return <div style={{padding: "50px", textAlign:"center"}}>Loading...</div>;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f9fa",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px"
    }}>
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "12px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        maxWidth: "500px",
        width: "100%",
        textAlign: "center"
      }}>
        <h1>Account Suspended</h1>
        <p>Your access has been restricted.</p>

        <div style={{textAlign:"left", margin: "20px 0", background:"#f0f0f0", padding:"15px", borderRadius:"8px"}}>
          <p><strong>Reason:</strong> {info.banReason || "Not specified"}</p>
          {info.bannedAt && (
            <p><strong>Date:</strong> {info.bannedAt.toDate().toLocaleDateString()}</p>
          )}
        </div>

        {info.appealStatus === "pending" && (
          <div style={{color:"#d97706", fontWeight:"bold", margin:"20px 0"}}>
            Your appeal is being reviewed...
          </div>
        )}

        {info.appealStatus === "accepted" && (
          <div style={{color:"#16a34a", fontWeight:"bold", margin:"20px 0"}}>
            Appeal Accepted! Refresh the page to continue.
          </div>
        )}

        {info.appealStatus === "rejected" && (
          <div style={{color:"#dc2626", fontWeight:"bold", margin:"20px 0"}}>
            <p>Appeal Rejected</p>
            {info.appealResponse && <p style={{fontStyle:"italic", marginTop:"10px"}}>"{info.appealResponse}"</p>}
          </div>
        )}

        {!info.appealSubmitted && !info.appealStatus && (
          <>
            <textarea
              placeholder="Explain why you believe this was a mistake... (be respectful)"
              value={appeal}
              onChange={(e) => setAppeal(e.target.value)}
              style={{
                width: "100%",
                height: "120px",
                padding: "12px",
                margin: "15px 0",
                borderRadius: "8px",
                border: "1px solid #ccc",
                fontSize: "16px"
              }}
            />
            <button
              onClick={submitAppeal}
              disabled={submitting || !appeal.trim()}
              style={{
                padding: "12px 24px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: "pointer"
              }}
            >
              {submitting ? "Submitting..." : "Submit Appeal"}
            </button>
            <p style={{fontSize:"14px", color:"#666", marginTop:"10px"}}>
              One appeal per ban • Reviewed within 48 hours
            </p>
          </>
        )}

        <button
          onClick={() => signOut(auth)}
          style={{
            marginTop: "30px",
            padding: "10px 20px",
            background: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: "6px"
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}