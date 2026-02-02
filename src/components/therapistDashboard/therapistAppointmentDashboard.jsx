import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../utils/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import PendingAppointmentsView from "./PendingAppointmentsView";
import "../../assets/styles/therapistAppointmentsDashboard.css";

const TherapistAppointmentsDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [anonymousUsers, setAnonymousUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);
  const [formData, setFormData] = useState({
    clientType: "anonymous",
    clientUid: "",
    clientName: "",
    date: "",
    time: "",
    duration: 60,
    notes: "",
    reason: "",
    status: "confirmed",
  });
  const therapistUid = auth.currentUser?.uid;
  const [formErrors, setFormErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(null);
  const modalRef = useRef(null);
  const [activeTab, setActiveTab] = useState("my-appointments");
  const [therapistName, setTherapistName] = useState("");

  // Fetch therapist name
  useEffect(() => {
    if (!therapistUid) return;
    
    const unsub = onSnapshot(doc(db, "therapists", therapistUid), (snap) => {
      if (snap.exists()) {
        setTherapistName(snap.data().name || "Therapist");
      }
    });
    
    return unsub;
  }, [therapistUid]);

  // === Fetch anonymous users for dropdown ===
  useEffect(() => {
    const q = query(collection(db, "anonymousUsers"));
    const unsub = onSnapshot(q, (snap) => {
      const users = snap.docs.map((d) => ({
        id: d.id,
        displayName: d.data().anonymousName || `Anonymous ${d.id.slice(-4)}`,
      }));
      setAnonymousUsers(users.sort((a, b) => a.displayName.localeCompare(b.displayName)));
    });
    return unsub;
  }, []);

  // === 2. Fetch ALL appointments + resolve deleted users ===
  useEffect(() => {
    if (!therapistUid) return;

    const q = query(
      collection(db, "appointments"),
      where("therapistId", "==", therapistUid)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const data = await Promise.all(
        snap.docs.map(async (d) => {
          const raw = d.data();
          const appt = {
            id: d.id,
            ...raw,
            clientUid: raw.userId || "", // keep for form editing
          };

          let displayName = "Unknown User";

          // PRIORITY 1: Use stored userName (this is the name saved at booking time)
          if (raw.userName && raw.userName.trim() !== "") {
            displayName = raw.userName.trim();
          }
          // PRIORITY 2: If no stored name, try to fetch current anonymousName
          else if (raw.userId) {
            try {
              const userSnap = await getDoc(doc(db, "anonymousUsers", raw.userId));
              if (userSnap.exists()) {
                const name = userSnap.data().anonymousName;
                displayName = name ? name.trim() : `Anonymous ${raw.userId.slice(-4)}`;
              } else {
                displayName = "Deleted User";
              }
            } catch (err) {
              displayName = "Deleted User";
            }
          }
          // PRIORITY 3: Final fallback
          else {
            displayName = "Unknown User";
          }

          return {
            ...appt,
            displayName, // final resolved name for table
            clientName: raw.userName || displayName, // for editing form
          };
        })
      );

      const sorted = data.sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        
        const dateA = a.requestedDate;
        const dateB = b.requestedDate;
        const timeA = a.requestedTime;
        const timeB = b.requestedTime;
        
        return new Date(`${dateA} ${timeA}`) - new Date(`${dateB} ${timeB}`);
      });

      setAppointments(sorted);
      setLoading(false);
    });

    return unsub;
  }, [therapistUid]);

  // === Modal Accessibility ===
  useEffect(() => {
    if (showForm && modalRef.current) {
      const firstInput = modalRef.current.querySelector("select, input");
      firstInput?.focus();
    }
  }, [showForm]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) closeModal();
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") closeModal();
    };

    if (showForm) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [showForm]);

  const closeModal = () => {
    setIsModalClosing(true);
    setTimeout(() => {
      setShowForm(false);
      setEditingAppt(null);
      setFormErrors({});
      setIsModalClosing(false);
    }, 300);
  };

  // === Form Reset & Edit ===
  const resetForm = () => {
    setFormData({
      clientType: "anonymous",
      clientUid: "",
      clientName: "",
      date: "",
      time: "",
      duration: 60,
      notes: "",
      reason: "",
      status: "confirmed",
    });
    setFormErrors({});
  };

  // Form Reset & Edit
  useEffect(() => {
    if (editingAppt && anonymousUsers.length > 0) {
      setFormData({
        clientType: "anonymous",
        clientUid: editingAppt.clientUid || "",
        clientName: editingAppt.clientName || "",
        date: editingAppt.requestedDate || "",
        time: editingAppt.requestedTime || "",
        duration: editingAppt.duration || 60,
        notes: editingAppt.notes || "",
        reason: editingAppt.reason || "",
        status: editingAppt.status || "confirmed",
      });
      setShowForm(true);
    } else if (showForm && !editingAppt) {
      resetForm();
    }
  }, [editingAppt, anonymousUsers, showForm]);

  // === Validation ===
  const validateForm = () => {
    const errors = {};
    if (!formData.clientUid) errors.clientUid = "Please select a client";
    if (!formData.date) errors.date = "Date is required";
    if (!formData.time) errors.time = "Time is required";
    if (formData.duration < 15) errors.duration = "Min 15 min";
    if (formData.date && new Date(formData.date) < new Date().setHours(0, 0, 0, 0))
      errors.date = "Cannot be in the past";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // === Client Selection ===
  const handleClientChange = (e) => {
    const selectedId = e.target.value;
    const selectedUser = anonymousUsers.find(u => u.id === selectedId);
    
    setFormData(prev => ({
      ...prev,
      clientUid: selectedId,
      clientName: selectedUser ? selectedUser.displayName : "",
    }));
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // === Submit ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const apptRef = editingAppt
        ? doc(db, "appointments", editingAppt.id)
        : doc(collection(db, "appointments"));

      const apptData = {
        therapistId: therapistUid,
        userId: formData.clientUid,
        userName: formData.clientName,
        date: formData.date,
        time: formData.time,
        duration: parseInt(formData.duration),
        notes: formData.notes?.trim(),
        reason: editingAppt ? formData.reason : "Manual booking by therapist",
        status: formData.status,
        updatedAt: Timestamp.now(),
      };

      if (!editingAppt) apptData.createdAt = Timestamp.now();

      await setDoc(apptRef, apptData, { merge: true });
      showSuccess(editingAppt ? "Updated!" : "Created!");
      closeModal();
    } catch (err) {
      console.error(err);
      alert("Failed to save appointment.");
    }
  };

  // === Actions ===
  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleDecision = async (apptId, status, reason = "") => {
    try {
      await updateDoc(doc(db, "appointments", apptId), {
        status,
        decisionReason: reason,
        decidedAt: serverTimestamp(),
      });

      showSuccess(`Appointment ${status === "confirmed" ? "confirmed" : "declined"}!`);
    } catch (err) {
      alert("Failed to update.");
    }
  };

  const handleStatusUpdate = async (apptId, status) => {
    try {
      await updateDoc(doc(db, "appointments", apptId), { status, updatedAt: Timestamp.now() });
      showSuccess(`Marked as ${status}!`);
    } catch (err) {
      alert("Failed.");
    }
  };

  const handleDelete = async (apptId) => {
    if (!window.confirm("Delete this appointment?")) return;
    try {
      await deleteDoc(doc(db, "appointments", apptId));
      showSuccess("Deleted!");
    } catch (err) {
      alert("Failed to delete.");
    }
  };

  // === UI Helpers ===
  const formatDateTime = (date, time) => {
    if (!date || !time) return "N/A";
    return new Date(`${date}T${time}`).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatClientDisplay = (appt) => {
    return appt.displayName || "Unknown User";
  };

  const filteredAppointments = filter === "All"
    ? appointments
    : appointments.filter((a) => a.status === filter);

  // === LOADING STATE ===
  if (loading) {
    return (
      <div className="dash-card-spin">
        <div className="spinner"></div>
        <p>Loading appointments...</p>
      </div>
    );
  }

  return (
    <div className="appointments-panel">
      <div className="appointments-header">
        <h3>Appointments</h3>
        <div className="appointments-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="appointment-filter"
          >
            <option value="All">All</option>
            <option value="pending">Pending</option>
            <option value="claimed">Claimed (Need Review)</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={() => {
              setEditingAppt(null);
              resetForm();
              setShowForm(true);
            }}
            className="create-appointment-btn"
          >
            Create
          </button>
        </div>
      </div>

      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* === CREATE / EDIT MODAL === */}
      {showForm && (
        <div className={`modal-backdrop ${isModalClosing ? "fade-out" : ""}`}>
          <div className={`modal ${isModalClosing ? "slide-out" : ""}`} ref={modalRef}>
            <div className="modal-header">
              <h4>{editingAppt ? "Edit" : "Create"} Appointment</h4>
              <button className="modal-close-btn" onClick={closeModal} aria-label="Close">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="appointment-form">
              {/* Client Dropdown */}
              <div className="form-group">
                <label className="label">Client</label>
                <select
                  name="clientUid"
                  value={formData.clientUid}
                  onChange={handleClientChange}
                  className={`input ${formErrors.clientUid ? "input-error" : ""}`}
                  disabled={anonymousUsers.length === 0}
                  required
                >
                  <option value="">
                    {anonymousUsers.length === 0 ? "Loading clients..." : "Select a client"}
                  </option>
                  {anonymousUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
                {formErrors.clientUid && <span className="error">{formErrors.clientUid}</span>}
              </div>

              <div className="form-group">
                <label className="label">Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleFormChange}
                  className={`input ${formErrors.date ? "input-error" : ""}`}
                />
                {formErrors.date && <span className="error">{formErrors.date}</span>}
              </div>

              <div className="form-group">
                <label className="label">Time</label>
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={handleFormChange}
                  className={`input ${formErrors.time ? "input-error" : ""}`}
                />
                {formErrors.time && <span className="error">{formErrors.time}</span>}
              </div>

              <div className="form-group">
                <label className="label">Duration (min)</label>
                <input
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

              {/* READ-ONLY REASON */}
              {editingAppt && (
                <div className="form-group">
                  <label className="label">Client's Original Reason</label>
                  <div className="readonly-reason">
                    {formData.reason || "(No reason provided)"}
                  </div>
                </div>
              )}

              {/* Therapist Notes */}
              <div className="form-group">
                <label className="label">Your Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  className="input textarea"
                  rows="3"
                  placeholder="Session notes, follow-up, observations..."
                />
              </div>

              <div className="form-group">
                <label className="label">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleFormChange}
                  className="input"
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="form-actions">
                <button type="submit" className="save-btn">
                  {editingAppt ? "Update" : "Create"}
                </button>
                <button type="button" onClick={closeModal} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === REJECTION MODAL === */}
      {showRejectModal && (
        <div className="modal-backdrop" onClick={() => setShowRejectModal(null)}>
          <div
            className="modal reject-modal"
            onClick={(e) => e.stopPropagation()}
            ref={modalRef}
          >
            <div className="modal-header">
              <h4>Reject Appointment</h4>
              <button
                className="modal-close-btn"
                onClick={() => setShowRejectModal(null)}
                aria-label="Close"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body">
              <p>Are you sure you want to reject this appointment?</p>
              <div className="form-group">
                <label className="label">Reason (optional)</label>
                <textarea
                  placeholder="Explain why you're rejecting..."
                  value={showRejectModal.reason}
                  onChange={(e) =>
                    setShowRejectModal((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  className="input textarea"
                  rows="3"
                  autoFocus
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                onClick={async () => {
                  await handleDecision(
                    showRejectModal.apptId,
                    "rejected",
                    showRejectModal.reason.trim() || "No reason provided"
                  );
                  setShowRejectModal(null);
                }}
                className="save-btn"
              >
                Reject Appointment
              </button>
              <button onClick={() => setShowRejectModal(null)} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appointments Tabs - MOVE THIS UP */}
      <div className="appointments-tabs">
        <button 
          onClick={() => setActiveTab("my-appointments")}
          className={activeTab === "my-appointments" ? "active" : ""}
        >
          My Appointments
        </button>
        <button 
          onClick={() => setActiveTab("pending")}
          className={activeTab === "pending" ? "active" : ""}
        >
          Available to Claim
        </button>
      </div>

      {/* Show content based on active tab */}
      {activeTab === "my-appointments" && (
        <div className="appointments-list">
          <div className="appointments-list">
            {filteredAppointments.length === 0 ? (
              <p className="no-appointments">No appointments found.</p>
            ) : (
              <div className="table-wrapper">
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Date & Time</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppointments.map((appt) => (
                      <tr
                        key={appt.id}
                        className={appt.status === "pending" ? "pending-row" : ""}
                      >
                        <td className={appt.displayName === "Deleted User" ? "status-deleted" : ""}>
                          {formatClientDisplay(appt)}
                        </td>
                        <td>{formatDateTime(appt.requestedDate, appt.requestedTime)}</td>
                        <td>{appt.duration} min</td>
                        <td className={`status-${appt.status.toLowerCase()}`}>
                          {appt.status}
                        </td>
                        <td>{appt.reason || "—"}</td>
                        <td className="actions-cell">
                          {appt.status === "pending" ? (
                            <>
                              <button
                                onClick={() => handleDecision(appt.id, "claimed")}
                                className="btn-accept"
                              >
                                Claim
                              </button>
                              <button
                                onClick={() => setShowRejectModal({ apptId: appt.id, reason: "" })}
                                className="btn-reject"
                              >
                                Reject
                              </button>
                            </>
                          ) : appt.status === "claimed" ? (
                            // ✅ NEW: Actions for CLAIMED appointments (review before confirming)
                            <>
                              <button
                                onClick={() => setEditingAppt(appt)}
                                className="action-btn edit-btn"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appt.id, "confirmed")}
                                className="action-btn confirm-btn"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appt.id, "cancelled")}
                                className="action-btn cancel-btn"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDelete(appt.id)}
                                className="action-btn delete-btn"
                              >
                                Delete
                              </button>
                            </>
                          ) : appt.status === "confirmed" ? (
                            // Actions for CONFIRMED appointments
                            <>
                              <button
                                onClick={() => setEditingAppt(appt)}
                                className="action-btn edit-btn"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appt.id, "cancelled")}
                                className="action-btn cancel-btn"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appt.id, "completed")}
                                className="action-btn complete-btn"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => handleDelete(appt.id)}
                                className="action-btn delete-btn"
                              >
                                Delete
                              </button>
                            </>
                          ) : appt.status === "completed" ? (
                            // Actions for COMPLETED appointments
                            <>
                              <button
                                onClick={() => setEditingAppt(appt)}
                                className="action-btn edit-btn"
                              >
                                View/Edit
                              </button>
                              <button
                                onClick={() => handleDelete(appt.id)}
                                className="action-btn delete-btn"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            // Actions for CANCELLED/REJECTED appointments
                            <>
                              <button
                                onClick={() => handleDelete(appt.id)}
                                className="action-btn delete-btn"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "pending" && (
        <PendingAppointmentsView 
          therapistId={therapistUid}
          therapistName={therapistName}
        />
      )}
    </div>
  );
};

export default TherapistAppointmentsDashboard;