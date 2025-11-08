import { useEffect, useState } from "react";
import { auth, db } from "../utils/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";

export function useTherapistProfile(navigate, showError) {
  const [info, setInfo] = useState({
    name: "", gender: "", position: "", profile: "", rating: 0,
    notificationPreferences: { emailNotifications: true, soundNotifications: true, desktopNotifications: false, notificationFrequency: "immediate" },
    chatSettings: { autoJoinNewChats: false, showTypingIndicator: true, messagePreviewLength: 50, allowPrivateChats: true },
    availability: { online: false },
  });
  const [therapistName, setTherapistName] = useState("Therapist");
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) { navigate("/therapist-login"); return; }
    const ref = doc(db, "therapists", uid);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setInfo(prev => ({
          ...prev,
          ...data,
          notificationPreferences: { ...prev.notificationPreferences, ...(data.notificationPreferences || {}) },
          chatSettings: { ...prev.chatSettings, ...(data.chatSettings || {}), allowPrivateChats: data.chatSettings?.allowPrivateChats ?? true },
          availability: { ...prev.availability, online: data.online ?? false },
        }));
        setTherapistName(data.name || "Therapist");
      }
    }, err => showError("Failed to load profile."));
    return unsub;
  }, [uid, navigate, showError]);

  const saveProfile = async () => {
    if (!uid) return;
    await setDoc(doc(db, "therapists", uid), {
      name: info.name, gender: info.gender, position: info.position,
      profile: info.profile, rating: info.rating,
    }, { merge: true });
  };

  const saveSettings = async () => {
    if (!uid) return;
    await setDoc(doc(db, "therapists", uid), {
      notificationPreferences: info.notificationPreferences,
      chatSettings: info.chatSettings,
      online: info.availability.online,
    }, { merge: true });
  };

  const logout = async (activeChatId, activeGroupId, displayName) => {
    await signOut(auth);
    // … (same transaction logic as before, omitted for brevity)
    navigate("/therapist-login");
  };

  return { info, therapistName, setInfo, saveProfile, saveSettings, logout };
}