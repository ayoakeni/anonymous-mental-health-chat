import React, { useState, useEffect, useRef } from "react";
import { db, Timestamp } from "../../utils/firebase";
import { doc, setDoc, updateDoc, deleteDoc, collection } from "firebase/firestore";
import "../../styles/therapistDashboardAppointment.css";

const TherapistDashboardAppointment = ({ therapistId, appointments, clients, showError, formatTimestamp }) => {
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);
  const [formData, setFormData] = useState({
    clientId: "",
    clientName: "",
    date: "",
    time: "",
    duration: 60,
    notes: "",
    status: "Scheduled",
  });
  const [formErrors, setFormErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [isModalClosing, setIsModalClosing] = useState(false);
  const modalRef = useRef(null);

  // Reset form when creating a new appointment
  useEffect(() => {
    if (!showForm || editingAppt) return;
    setFormData({
      clientId: "",
      clientName: "",
      date: "",
      time: "",
      duration: 60,
      notes: "",
      status: "Scheduled",
    });
    setFormErrors({});
  }, [showForm, editingAppt]);

  useEffect(() => {
    if (showForm && modalRef.current) {
      const firstInput = modalRef.current.querySelector("select, input");
      firstInput?.focus();
    }
  }, [showForm]);

  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showForm]);

  // Populate form when editing an appointment
  useEffect(() => {
    if (editingAppt) {
      setFormData({
        clientId: editingAppt.clientId || "",
        clientName: editingAppt.clientName || "",
        date: editingAppt.date || "",
        time: editingAppt.time || "",
        duration: editingAppt.duration || 60,
        notes: editingAppt.notes || "",
        status: editingAppt.status || "Scheduled",
      });
      setShowForm(true);
    }
  }, [editingAppt]);

  const closeModal = () => {
    setIsModalClosing(true);
    setTimeout(() => {
      setShowForm(false);
      setEditingAppt(null);
      setFormErrors({});
      setIsModalClosing(false);
    }, 300);
  };

  // Handle modal close on outside click
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
  }

  return () => {
    document.removeEventListener("mousedown", handleOutsideClick);
    document.removeEventListener("keydown", handleEscapeKey);
  };
}, [showForm]);

  // Validate form inputs
  const validateForm = () => {
    const errors = {};
    if (!formData.clientId) errors.clientId = "Client is required";
    if (!formData.date) errors.date = "Date is required";
    if (!formData.time) errors.time = "Time is required";
    if (!formData.duration || formData.duration < 15) errors.duration = "Duration must be at least 15 minutes";
    if (formData.date && new Date(formData.date) < new Date().setHours(0, 0, 0, 0))
      errors.date = "Date cannot be in the past";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === "clientId") {
      const client = clients.find((c) => c.id === value);
      setFormData((prev) => ({
        ...prev,
        clientId: value,
        clientName: client ? client.name : "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Handle form submission (create or update appointment)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const apptRef = editingAppt ? doc(db, "appointments", editingAppt.id) : doc(collection(db, "appointments"));
      const apptData = {
        therapistId,
        clientId: formData.clientId,
        clientName: formData.clientName,
        date: formData.date,
        time: formData.time,
        duration: parseInt(formData.duration),
        notes: formData.notes,
        status: formData.status,
        updatedAt: Timestamp.now(),
      };
      if (!editingAppt) {
        apptData.createdAt = Timestamp.now();
      }
      await setDoc(apptRef, apptData, { merge: true });
      setSuccessMessage(editingAppt ? "Appointment updated successfully!" : "Appointment created successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
      setShowForm(false);
      setEditingAppt(null);
      setFormErrors({});
    } catch (err) {
      console.error("Error saving appointment:", err);
      showError("Failed to save appointment. Please try again.");
    }
  };

  // Handle edit button click
  const handleEdit = (appt) => {
    setEditingAppt(appt);
  };

  // Handle cancel button (update status to Cancelled)
  const handleCancel = async (apptId) => {
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

  // Handle delete button
  const handleDelete = async (apptId) => {
    if (!window.confirm("Are you sure you want to delete this appointment?")) return;
    try {
      await deleteDoc(doc(db, "appointments", apptId));
      setSuccessMessage("Appointment deleted successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.error("Error deleting appointment:", err);
      showError("Failed to delete appointment. Please try again.");
    }
  };

  // Filter appointments based on status
  const filteredAppointments = filter === "All" ? appointments : appointments.filter((appt) => appt.status === filter);

  // Format date and time for display
  const formatDateTime = (date, time) => {
    if (!date || !time) return "N/A";
    const dateObj = new Date(`${date}T${time}`);
    return dateObj.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="appointments">
      <div className="appointments-header">
        <h3>Appointments</h3>
        <div className="appointments-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="appointment-filter"
          >
            <option value="All">All</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingAppt(null);
            }}
            className="create-appointment-btn"
          >
            <i className="fa-solid fa-plus" style={{ marginRight: "8px" }}></i>
            Create Appointment
          </button>
        </div>
      </div>
      {successMessage && <div className="success-message">{successMessage}</div>}
      {showForm && (
        <div className={`modal-backdrop ${isModalClosing ? "fade-out" : ""}`}>
          <div className={`modal ${isModalClosing ? "slide-out" : ""}`} ref={modalRef}>
            <div className="modal-header">
              <h4>{editingAppt ? "Edit Appointment" : "Create Appointment"}</h4>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  closeModal()
                }}
                aria-label="Close modal"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="appointment-form">
              <div className="form-group">
                <label className="label">Client</label>
                <select
                  name="clientId"
                  value={formData.clientId}
                  onChange={handleFormChange}
                  className={`input ${formErrors.clientId ? "input-error" : ""}`}
                >
                  <option value="">Select Client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {formErrors.clientId && <span className="error">{formErrors.clientId}</span>}
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
                <label className="label">Duration (minutes)</label>
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
              <div className="form-group">
                <label className="label">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  className="input textarea"
                  rows="4"
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
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="save-btn">
                  {editingAppt ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingAppt(null);
                    setFormErrors({});
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="appointments-list">
        {filteredAppointments.length > 0 ? (
          <table className="appointments-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Date & Time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((appt) => (
                <tr key={appt.id}>
                  <td>{appt.clientName || "Unknown Client"}</td>
                  <td>{formatDateTime(appt.date, appt.time)}</td>
                  <td>{appt.duration} min</td>
                  <td className={`status-${appt.status.toLowerCase()}`}>{appt.status}</td>
                  <td>{appt.notes || "N/A"}</td>
                  <td>
                    <button
                      onClick={() => handleEdit(appt)}
                      className="action-btn edit-btn"
                      disabled={appt.status === "Cancelled"}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleCancel(appt.id)}
                      className="action-btn cancel-btn"
                      disabled={appt.status === "Cancelled"}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(appt.id)}
                      className="action-btn delete-btn"
                    >
                      Delete
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

export default TherapistDashboardAppointment;