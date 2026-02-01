import { useState } from "react";
import { usePendingAppointments } from "../../hooks/usePendingAppointments";
import { format } from "date-fns";
import "../../assets/styles/pendingAppointments.css";

function PendingAppointmentsView({ therapistId, therapistName }) {
  const { appointments, loading, claimAppointment } = usePendingAppointments(therapistId);
  const [claiming, setClaiming] = useState(null);

  const handleClaim = async (appointmentId) => {
    setClaiming(appointmentId);
    try {
      await claimAppointment(appointmentId, therapistName);
      alert("Appointment claimed successfully!");
    } catch (error) {
      alert(error.message || "Failed to claim appointment");
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return <div className="loading">Loading appointments...</div>;
  }

  return (
    <div className="pending-appointments">
      <h3>Available Appointments</h3>
      <p className="subtitle">
        Showing appointments that match your availability
      </p>

      {appointments.length === 0 ? (
        <div className="no-appointments">
          No pending appointments match your availability
        </div>
      ) : (
        <div className="appointments-grid">
          {appointments.map((appt) => (
            <div key={appt.id} className="appointment-card">
              <div className="card-header">
                <span className="client-name">{appt.userName}</span>
                <span className="pending-badge">Pending</span>
              </div>

              <div className="card-body">
                <div className="info-row">
                  <i className="fas fa-calendar"></i>
                  <span>{format(new Date(appt.requestedDate), "MMM d, yyyy")}</span>
                </div>
                <div className="info-row">
                  <i className="fas fa-clock"></i>
                  <span>{appt.requestedTime}</span>
                </div>
                <div className="info-row">
                  <i className="fas fa-hourglass-half"></i>
                  <span>{appt.duration} minutes</span>
                </div>
                {appt.reason && (
                  <div className="reason">
                    <strong>Reason:</strong> {appt.reason}
                  </div>
                )}
              </div>

              <div className="card-footer">
                <button
                  onClick={() => handleClaim(appt.id)}
                  disabled={claiming === appt.id}
                  className="claim-btn"
                >
                  {claiming === appt.id ? "Claiming..." : "Claim Appointment"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PendingAppointmentsView;