import { useState, useEffect } from "react";
import { db } from "../utils/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  serverTimestamp,
  getDoc
} from "firebase/firestore";

export function usePendingAppointments(therapistId) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [therapistAvailability, setTherapistAvailability] = useState(null);

  // Load therapist availability
  useEffect(() => {
    if (!therapistId) return;

    const unsubscribe = onSnapshot(
      doc(db, "therapistAvailability", therapistId),
      (snapshot) => {
        if (snapshot.exists()) {
          setTherapistAvailability(snapshot.data().availability);
        }
      }
    );

    return unsubscribe;
  }, [therapistId]);

  // Load pending appointments
  useEffect(() => {
    if (!therapistId) return;

    const q = query(
      collection(db, "appointments"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allPending = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));

        // Filter by therapist availability
        const filtered = allPending.filter((appt) => {
          if (!therapistAvailability || !appt.requestedDate || !appt.requestedTime) {
            return false;
          }

          const appointmentDate = new Date(appt.requestedDate);
          const dayOfWeek = appointmentDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
          
          return therapistAvailability[dayOfWeek]?.includes(appt.requestedTime) || false;
        });

        setAppointments(filtered);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading appointments:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [therapistId, therapistAvailability]);

  const claimAppointment = async (appointmentId, therapistName) => {
    try {
      const appointmentRef = doc(db, "appointments", appointmentId);
      
      // Check if still available
      const snapshot = await getDoc(appointmentRef);
      if (!snapshot.exists() || snapshot.data().status !== "pending") {
        throw new Error("Appointment no longer available");
      }

      await updateDoc(appointmentRef, {
        status: "claimed",
        claimedBy: therapistId,
        therapistId: therapistId,
        therapistName: therapistName,
        claimedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return true;
    } catch (error) {
      console.error("Error claiming appointment:", error);
      throw error;
    }
  };

  return { appointments, loading, claimAppointment };
}