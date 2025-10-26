import React, { useState, useEffect, useRef } from "react";
import { db, auth, Timestamp } from "../utils/firebase";
import { doc, setDoc, updateDoc, collection, query, where, onSnapshot, getDoc } from "firebase/firestore";
import "../styles/clientDashboard.css";

const ClientDashboard = ({ clientId, showError, formatTimestamp }) => {
  const [therapists, setTherapists] = useState([]);
  const [filter, setFilter] = useState("All");
  const [sortBy, setSortBy] = useState("date-desc");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState(null);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [formData, setFormData] = useState({
    notificationFrequency: "immediate",
    preferredContact: "email",
    receiveAppointmentReminders: true,
    therapistId: "",
    date: "",
    time: "",
    duration: 60,
    notes: "",
    status: "Scheduled",
  });
  const [formErrors, setFormErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const modalRef = useRef(null);

  // Set focus to first input when modal opens
  useEffect(() => {
    if (showForm && modalRef.current) {
      const firstInput = modalRef.current.querySelector("select, input");
      firstInput?.focus();
    }
  }, [showForm]);

  // Fetch appointments
  useEffect(() => {
    if (!clientId) return;
    const q = query(collection(db, "appointments"), where("clientId", "==", clientId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const appts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setAppointments(appts);
      },
      (err) => {
        console.error("Error fetching appointments:", err);
        showError("Failed to load appointments. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [clientId, showError]);

  // Fetch therapists connected to the client
  useEffect(() => {
    if (!clientId) return;
    const privateChatsQuery = query(
      collection(db, "privateChats"),
      where("participants", "array-contains", clientId)
    );
    const appointmentsQuery = query(
      collection(db, "appointments"),
      where("clientId", "==", clientId)
    );

    const fetchTherapists = async (ids, source, timestampField) => {
      return Promise.all(
        ids.map(async (id) => {
          const therapistRef = doc(db, "therapists", id);
          const therapistSnap = await getDoc(therapistRef);
          const onlineRef = doc(db, "therapistsOnline", id);
          const onlineSnap = await getDoc(onlineRef);
          return {
            id,
            name: therapistSnap.exists() ? therapistSnap.data().name : "Unknown Therapist",
            rating: therapistSnap.exists() ? therapistSnap.data().rating : 0,
            online: onlineSnap.exists() && onlineSnap.data().online,
            lastInteraction: source.data()[timestampField]?.toMillis() || 0,
          };
        })
      );
    };

    const unsubscribeChats = onSnapshot(
      privateChatsQuery,
      async (snapshot) => {
        const therapistIds = [
          ...new Set(
            snapshot.docs
              .map((doc) => doc.data().participants)
              .flat()
              .filter((id) => id !== clientId)
          ),
        ];
        const therapistData = await fetchTherapists(therapistIds, snapshot.docs[0], "lastUpdated");
        setTherapists((prev) => {
          const merged = [...prev, ...therapistData].reduce((acc, curr) => {
            const existing = acc.find((t) => t.id === curr.id);
            if (existing) {
              return [
                ...acc.filter((t) => t.id !== curr.id),
                { ...existing, lastInteraction: Math.max(existing.lastInteraction, curr.lastInteraction) },
              ];
            }
            return [...acc, curr];
          }, []);
          return merged;
        });
      },
      (err) => {
        console.error("Error fetching private chats:", err);
        showError("Failed to load therapists from chats. Please try again.");
      }
    );

    const unsubscribeAppts = onSnapshot(
      appointmentsQuery,
      async (snapshot) => {
        const therapistIds = [...new Set(snapshot.docs.map((doc) => doc.data().therapistId))];
        const therapistData = await fetchTherapists(therapistIds, snapshot.docs[0], "updatedAt");
        setTherapists((prev) => {
          const merged = [...prev, ...therapistData].reduce((acc, curr) => {
            const existing = acc.find((t) => t.id === curr.id);
            if (existing) {
              return [
                ...acc.filter((t) => t.id !== curr.id),
                { ...existing, lastInteraction: Math.max(existing.lastInteraction, curr.lastInteraction) },
              ];
            }
            return [...acc, curr];
          }, []);
          return merged;
        });
      },
      (err) => {
        console.error("Error fetching appointments:", err);
        showError("Failed to load therapists from appointments. Please try again.");
      }
    );

    return () => {
      unsubscribeChats();
      unsubscribeAppts();
    };
  }, [clientId, showError]);

  // Fetch client preferences
  useEffect(() => {
    if (!clientId) return;
    const clientRef = doc(db, "anonymousUsers", clientId);
    const unsubscribe = onSnapshot(
      clientRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFormData((prev) => ({
            ...prev,
            notificationFrequency: data.notificationFrequency || "immediate",
            preferredContact: data.preferredContact || "email",
            receiveAppointmentReminders: data.receiveAppointmentReminders !== false,
          }));
        }
      },
      (err) => {
        console.error("Error fetching client preferences:", err);
        showError("Failed to load preferences. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [clientId, showError]);

  // Reset form based on formType
  useEffect(() => {
    if (!showForm) return;
    if (formType === "preferences") {
      setFormData((prev) => ({
        ...prev,
        therapistId: "",
        date: "",
        time: "",
        duration: 60,
        notes: "",
        status: "Scheduled",
      }));
    } else if (formType === "appointment" && selectedTherapist) {
      setFormData((prev) => ({
        ...prev,
        therapistId: selectedTherapist.id,
        date: "",
        time: "",
        duration: 60,
        notes: "",
        status: "Scheduled",
      }));
    } else if (formType === "appointment" && selectedAppointment) {
      setFormData((prev) => ({
        ...prev,
        therapistId: selectedAppointment.therapistId,
        date: selectedAppointment.date,
        time: selectedAppointment.time,
        duration: selectedAppointment.duration,
        notes: selectedAppointment.notes,
        status: selectedAppointment.status,
      }));
    }
    setFormErrors({});
  }, [showForm, formType, selectedTherapist, selectedAppointment]);

  // Handle modal close
  const closeModal = () => {
    setIsModalClosing(true);
    setTimeout(() => {
      setShowForm(false);
      setFormType(null);
      setSelectedTherapist(null);
      setSelectedAppointment(null);
      setFormErrors({});
      setIsModalClosing(false);
    }, 300);
  };

  // Handle modal close on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        closeModal();
      }
    };

    const handleEscapeKey = (e) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };

    if (showForm) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "";
    };
  }, [showForm]);

  // Validate form inputs
  const validateForm = () => {
    const errors = {};
    if (formType === "preferences") {
      if (!formData.notificationFrequency) errors.notificationFrequency = "Notification frequency is required";
      if (!formData.preferredContact) errors.preferredContact = "Preferred contact method is required";
    } else if (formType === "appointment") {
      if (!formData.therapistId) errors.therapistId = "Therapist is required";
      if (!formData.date) errors.date = "Date is required";
      if (!formData.time) errors.time = "Time is required";
      if (!formData.duration || formData.duration < 15) errors.duration = "Duration must be at least 15 minutes";
      if (formData.date && new Date(formData.date) < new Date().setHours(0, 0, 0, 0))
        errors.date = "Date cannot be in the past";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      if (formType === "preferences") {
        const clientRef = doc(db, "anonymousUsers", clientId);
        await setDoc(
          clientRef,
          {
            notificationFrequency: formData.notificationFrequency,
            preferredContact: formData.preferredContact,
            receiveAppointmentReminders: formData.receiveAppointmentReminders,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
        setSuccessMessage("Preferences updated successfully!");
      } else if (formType === "appointment") {
        const apptRef = selectedAppointment
          ? doc(db, "appointments", selectedAppointment.id)
          : doc(collection(db, "appointments"));
        const therapist = therapists.find((t) => t.id === formData.therapistId);
        await setDoc(
          apptRef,
          {
            therapistId: formData.therapistId,
            clientId,
            clientName: (await getDoc(doc(db, "anonymousUsers", clientId))).data()?.name || "Anonymous Client",
            date: formData.date,
            time: formData.time,
            duration: parseInt(formData.duration),
            notes: formData.notes,
            status: formData.status,
            createdAt: selectedAppointment ? selectedAppointment.createdAt : Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
        setSuccessMessage(selectedAppointment ? "Appointment updated successfully!" : "Appointment scheduled successfully!");
      }
      setTimeout(() => setSuccessMessage(""), 3000);
      closeModal();
    } catch (err) {
      console.error("Error saving data:", err);
      showError(`Failed to save ${formType === "preferences" ? "preferences" : "appointment"}. Please try again.`);
    }
  };

  // Handle appointment cancellation
  const handleCancelAppointment = async (apptId) => {
    try {
      await updateDoc(doc(db, "appointments", apptId), {
        status: "Cancelled",
        updatedAt: Timestamp.now(),
      });
      setSuccessMessage("Appointment cancelled successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.error("Error cancelling appointment:", err);
      showError("Failed to cancel appointment. Please try again.");
    }
  };

  // Filter therapists based on status
  const filteredTherapists = filter === "All" ? therapists : therapists.filter((therapist) => {
    if (filter === "Online") return therapist.online;
    if (filter === "Offline") return !therapist.online;
    return true;
  });

  // Sort appointments
  const sortedAppointments = [...appointments].sort((a, b) => {
    if (sortBy === "date-desc") {
      return new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime();
    } else if (sortBy === "date-asc") {
      return new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime();
    } else if (sortBy === "status") {
      return a.status.localeCompare(b.status);
    }
    return 0;
  });

  // Format last interaction timestamp
  const formatLastInteraction = (timestamp) => {
    if (!timestamp) return "N/A";
    return formatTimestamp(timestamp);
  };

  return (
    <div className="clients">
      <div className="clients-header">
        <h3>My Therapists</h3>
        <div className="clients-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="client-filter"
            aria-label="Filter therapists by status"
          >
            <option value="All">All Therapists</option>
            <option value="Online">Online</option>
            <option value="Offline">Offline</option>
          </select>
          <button
            onClick={() => {
              setShowForm(true);
              setFormType("preferences");
              setSelectedTherapist(null);
              setSelectedAppointment(null);
            }}
            className="edit-prefs-btn"
          >
            <i className="fa-solid fa-user-gear" style={{ marginRight: "8px" }}></i>
            Edit Preferences
          </button>
        </div>
      </div>
      {successMessage && <div className="success-message">{successMessage}</div>}
      {showForm && (
        <div className={`modal-backdrop ${isModalClosing ? "fade-out" : ""}`}>
          <div className={`modal ${isModalClosing ? "slide-out" : ""}`} ref={modalRef}>
            <div className="modal-header">
              <h4>{formType === "preferences" ? "Edit Preferences" : selectedAppointment ? "Edit Appointment" : "Schedule Appointment"}</h4>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeModal}
                aria-label="Close modal"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="client-form">
              {formType === "preferences" ? (
                <>
                  <div className="form-group">
                    <label className="label" htmlFor="notificationFrequency">
                      Notification Frequency
                    </label>
                    <select
                      id="notificationFrequency"
                      name="notificationFrequency"
                      value={formData.notificationFrequency}
                      onChange={handleFormChange}
                      className={`input ${formErrors.notificationFrequency ? "input-error" : ""}`}
                    >
                      <option value="immediate">Immediate</option>
                      <option value="hourly">Hourly Digest</option>
                      <option value="daily">Daily Digest</option>
                    </select>
                    {formErrors.notificationFrequency && (
                      <span className="error">{formErrors.notificationFrequency}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="preferredContact">
                      Preferred Contact Method
                    </label>
                    <select
                      id="preferredContact"
                      name="preferredContact"
                      value={formData.preferredContact}
                      onChange={handleFormChange}
                      className={`input ${formErrors.preferredContact ? "input-error" : ""}`}
                    >
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="app">In-App</option>
                    </select>
                    {formErrors.preferredContact && (
                      <span className="error">{formErrors.preferredContact}</span>
                    )}
                  </div>
                  <div className="form-group checkbox-group">
                    <label className="label checkbox-label">
                      <input
                        type="checkbox"
                        name="receiveAppointmentReminders"
                        checked={formData.receiveAppointmentReminders}
                        onChange={handleFormChange}
                        className="checkbox-input"
                      />
                      <span className="checkbox-custom"></span>
                      Receive Appointment Reminders
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="label" htmlFor="therapistId">
                      Therapist
                    </label>
                    <select
                      id="therapistId"
                      name="therapistId"
                      value={formData.therapistId}
                      onChange={handleFormChange}
                      className={`input ${formErrors.therapistId ? "input-error" : ""}`}
                    >
                      <option value="">Select Therapist</option>
                      {therapists.map((therapist) => (
                        <option key={therapist.id} value={therapist.id}>
                          {therapist.name}
                        </option>
                      ))}
                    </select>
                    {formErrors.therapistId && <span className="error">{formErrors.therapistId}</span>}
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="date">
                      Date
                    </label>
                    <input
                      id="date"
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={handleFormChange}
                      className={`input ${formErrors.date ? "input-error" : ""}`}
                    />
                    {formErrors.date && <span className="error">{formErrors.date}</span>}
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="time">
                      Time
                    </label>
                    <input
                      id="time"
                      type="time"
                      name="time"
                      value={formData.time}
                      onChange={handleFormChange}
                      className={`input ${formErrors.time ? "input-error" : ""}`}
                    />
                    {formErrors.time && <span className="error">{formErrors.time}</span>}
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="duration">
                      Duration (minutes)
                    </label>
                    <input
                      id="duration"
                      type="number"
                      name="duration"
                      value={formData.duration}
                      onChange={handleFormChange}
                      min="15"
                      step="15"
                      className={`input ${formErrors.duration ? "input-error" : ""}`}
                    />
                    {formErrors.duration && <span className="error">{formErrors.duration}</span>}
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="notes">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleFormChange}
                      className="input textarea"
                      rows="4"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="status">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleFormChange}
                      className="input"
                    >
                      <option value="Scheduled">Scheduled</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                </>
              )}
              <div className="form-actions">
                <button type="submit" className="save-btn">
                  {formType === "preferences" ? "Save" : selectedAppointment ? "Update" : "Schedule"}
                </button>
                <button type="button" onClick={closeModal} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="clients-list">
        {filteredTherapists.length > 0 ? (
          <table className="clients-table" aria-label="Therapists List">
            <thead>
              <tr>
                <th scope="col">Therapist Name</th>
                <th scope="col">Status</th>
                <th scope="col">Rating</th>
                <th scope="col">Last Interaction</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTherapists.map((therapist) => (
                <tr key={therapist.id}>
                  <td data-label="Therapist Name">{therapist.name}</td>
                  <td data-label="Status" className={`status-${therapist.online ? "online" : "offline"}`}>
                    {therapist.online ? "Online" : "Offline"}
                  </td>
                  <td data-label="Rating">{therapist.rating || "N/A"}</td>
                  <td data-label="Last Interaction">{formatLastInteraction(therapist.lastInteraction)}</td>
                  <td data-label="Actions">
                    <button
                      onClick={() => {
                        showError("Chat navigation not implemented yet.");
                      }}
                      className="action-btn chat-btn"
                    >
                      Chat
                    </button>
                    <button
                      onClick={() => {
                        setShowForm(true);
                        setFormType("appointment");
                        setSelectedTherapist(therapist);
                        setSelectedAppointment(null);
                      }}
                      className="action-btn schedule-btn"
                    >
                      Schedule
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-therapists">No therapists found.</p>
        )}
      </div>
      <div className="appointments-list">
        <div className="appointments-header">
          <h3>My Appointments</h3>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="client-filter"
            aria-label="Sort appointments"
          >
            <option value="date-desc">Date (Newest)</option>
            <option value="date-asc">Date (Oldest)</option>
            <option value="status">Status</option>
          </select>
        </div>
        {sortedAppointments.length > 0 ? (
          <table className="appointments-table" aria-label="Client Appointments">
            <thead>
              <tr>
                <th scope="col">Therapist</th>
                <th scope="col">Date & Time</th>
                <th scope="col">Duration</th>
                <th scope="col">Status</th>
                <th scope="col">Notes</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAppointments.map((appt) => (
                <tr
                  key={appt.id}
                  className={new Date(`${appt.date}T${appt.time}`) > new Date() && appt.status === "Scheduled" ? "upcoming" : ""}
                >
                  <td data-label="Therapist">
                    {therapists.find((t) => t.id === appt.therapistId)?.name || "Unknown"}
                  </td>
                  <td data-label="Date & Time">
                    {formatTimestamp(new Date(`${appt.date}T${appt.time}`).getTime())}
                  </td>
                  <td data-label="Duration">{appt.duration} min</td>
                  <td data-label="Status" className={`status-${appt.status.toLowerCase()}`}>
                    {appt.status}
                  </td>
                  <td data-label="Notes">{appt.notes || "N/A"}</td>
                  <td data-label="Actions">
                    <button
                      className="action-btn edit-btn"
                      onClick={() => {
                        setShowForm(true);
                        setFormType("appointment");
                        setSelectedAppointment(appt);
                        setSelectedTherapist(therapists.find((t) => t.id === appt.therapistId));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="action-btn cancel-appointment-btn"
                      onClick={() => handleCancelAppointment(appt.id)}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-appointments">No appointments found.</p>
        )}
      </div>
    </div>
  );
};

export default ClientDashboard;