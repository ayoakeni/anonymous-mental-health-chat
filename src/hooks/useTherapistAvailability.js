import { useState, useEffect } from "react";
import { db } from "../utils/firebase";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

export function useTherapistAvailability(therapistId) {
  const [availability, setAvailability] = useState({
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!therapistId) return;

    const unsubscribe = onSnapshot(
      doc(db, "therapistAvailability", therapistId),
      (snapshot) => {
        if (snapshot.exists()) {
          setAvailability(snapshot.data().availability || {});
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error loading availability:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [therapistId]);

  const saveAvailability = async (newAvailability) => {
    if (!therapistId) return;
    setSaving(true);

    try {
      await setDoc(
        doc(db, "therapistAvailability", therapistId),
        {
          availability: newAvailability,
          updatedAt: serverTimestamp(),
          updatedBy: therapistId
        },
        { merge: true }
      );
      setAvailability(newAvailability);
    } catch (error) {
      console.error("Error saving availability:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const isAvailableAt = (dayOfWeek, time) => {
    const day = dayOfWeek.toLowerCase();
    return availability[day]?.includes(time) || false;
  };

  return { availability, loading, saving, saveAvailability, isAvailableAt };
}