import { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";

export function useAppointments(therapistId, showError) {
  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Appointments for this therapist
  useEffect(() => {
    if (!therapistId) {
      setAppointments([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "appointments"),
      where("therapistId", "==", therapistId),
      orderBy("time", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAppointments(list);
        setLoading(false);
      },
      (err) => {
        showError("Failed to load appointments.");
        setLoading(false);
      }
    );

    return unsub;
  }, [therapistId, showError]);

  // All anonymous users (for booking dropdown) — ONLY if therapistId exists
  useEffect(() => {
    if (!therapistId) {
      setClients([]);
      return;
    }

    const q = query(collection(db, "anonymousUsers"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().anonymousName || `Anonymous_${d.id.slice(0, 8)}`,
        }));
        setClients(list);
      },
      (err) => showError("Failed to load clients.")
    );
    return unsub;
  }, [therapistId, showError]);

  return { appointments, clients, loadingAppointments: loading };
}