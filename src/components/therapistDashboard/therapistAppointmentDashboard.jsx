import React, { useState, useEffect, useRef } from "react";
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
import "../../styles/therapistAppointmentsDashboard.css";

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
  const [formErrors, setFormErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(null);
  const modalRef = useRef(null);

  const therapistUid = auth.currentUser?.uid;

  // === 1. Fetch ALL anonymous users ===
  useEffect(() => {
    const q = query(collection(db, "anonymousUsers"));
    const unsub = onSnapshot(q, (snap) => {
      const users = snap.docs.map((d) => ({
        id: d.id,
        displayName: d.data().displayName || "Unknown User",
      }));
      setAnonymousUsers(users.sort((a, b) => a.displayName.localeCompare(b.displayName)));
    });
    return unsub;
  }, []);

  // === 2. Fetch ALL appointments ===
  useEffect(() => {
    if (!therapistUid) return;

    const q = query(
      collection(db, "appointments"),
      where("therapistUid", "==", therapistUid)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const data = await Promise.all(
        snap.docs.map(async (d) => {
          const appt = { id: d.id, ...d.data() };

          if (appt.clientType === "anonymous" && appt.clientUid) {
            const anonSnap = await getDoc(doc(db, "anonymousUsers", appt.clientUid));
            if (anonSnap.exists()) {
              appt.clientName = anonSnap.data().displayName || "Unknown User";
            } else {
              appt.clientName = "Deleted User";
            }
          } else {
            appt.clientName = appt.clientName || "Client";
          }

          return appt;
        })
      );

      const sorted = data.sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`);
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
  };

  useEffect(() => {
    if (editingAppt) {
      setFormData({
        clientType: editingAppt.clientType || "anonymous",
        clientUid: editingAppt.clientUid || "",
        clientName: editingAppt.clientName || "",
        date: editingAppt.date || "",
        time: editingAppt.time || "",
        duration: editingAppt.duration || 60,
        notes: editingAppt.notes || "",
        reason: editingAppt.reason || "",
        status: editingAppt.status || "confirmed",
      });
      setShowForm(true);
    } else if (showForm) {
      resetForm();
    }
  }, [editingAppt, showForm]);

  // === Validation ===
  const validateForm = () => {
    const errors = {};
    if (!formData.clientUid) errors.clientUid = "Please select a client";
    if (!formData.date) errors.date = "Date is required";
    if (!formData.time) errors.time = "Time is required";
    if (!formData.duration || formData.duration < 15) errors.duration = "Min 15 min";
    if (formData.date && new Date(formData.date) < new Date().setHours(0, 0, 0, 0))
      errors.date = "Cannot be in the past";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // === Client Selection ===
  const handleClientChange = (e) => {
    const uid = e.target.value;
    const selected = anonymousUsers.find((u) => u.id === uid);
    setFormData((prev) => ({
      ...prev,
      clientUid: uid,
      clientName: selected ? selected.displayName : "",
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
        therapistUid,
        clientType: "anonymous",
        clientUid: formData.clientUid,
        clientName: formData.clientName,
        date: formData.date,
        time: formData.time,
        duration: parseInt(formData.duration),
        notes: formData.notes,
        reason: editingAppt ? formData.reason : "",
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
    return appt.clientName || "Unknown User";
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
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={() => {
              setEditingAppt(null);
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
                <i class="fas fa-times"></i>
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
                >
                  <option value="">Select a client</option>
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

      {/* === TABLE === */}
      <div className="appointments-list">
        {filteredAppointments.length === 0 ? (
          <p className="no-appointments">No appointments found.</p>
        ) : (
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
                <tr key={appt.id} className={appt.status === "pending" ? "pending-row" : ""}>
                  <td>{formatClientDisplay(appt)}</td>
                  <td>{formatDateTime(appt.date, appt.time)}</td>
                  <td>{appt.duration} min</td>
                  <td className={`status-${appt.status.toLowerCase()}`}>
                    {appt.status}
                  </td>
                  <td>{appt.reason || "—"}</td>
                  <td>
                    {appt.status === "pending" ? (
                      <>
                        <button onClick={() => handleDecision(appt.id, "confirmed")} className="btn-accept">
                          Accept
                        </button>
                        <button
                          onClick={() => setShowRejectModal({ apptId: appt.id, reason: "" })}
                          className="btn-reject"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <>
                        {appt.status === "confirmed" && (
                          <>
                            <button onClick={() => setEditingAppt(appt)} className="action-btn edit-btn">
                              Edit
                            </button>
                            <button onClick={() => handleStatusUpdate(appt.id, "cancelled")} className="action-btn cancel-btn">
                              Cancel
                            </button>
                            <button onClick={() => handleStatusUpdate(appt.id, "completed")} className="action-btn complete-btn">
                              Complete
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(appt.id)} className="action-btn delete-btn">
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TherapistAppointmentsDashboard;