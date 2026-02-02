import { useState, useEffect } from "react";
import { useTherapistAvailability } from "../../hooks/useTherapistAvailability";
import "../../assets/styles/therapistAvailability.css";

const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", 
  "17:00", "18:00", "19:00", "20:00"
];

const DAYS = [
  "monday", "tuesday", "wednesday", 
  "thursday", "friday", "saturday", "sunday"
];

function TherapistAvailabilitySettings({ therapistId }) {
  const { availability, loading, saving, saveAvailability } = useTherapistAvailability(therapistId);
  const [localAvailability, setLocalAvailability] = useState(availability);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalAvailability(availability);
  }, [availability]);

  const toggleTimeSlot = (day, time) => {
    setLocalAvailability((prev) => {
      const daySlots = prev[day] || [];
      const newSlots = daySlots.includes(time)
        ? daySlots.filter((t) => t !== time)
        : [...daySlots, time].sort();

      setHasChanges(true);
      return { ...prev, [day]: newSlots };
    });
  };

  const handleSave = async () => {
    try {
      await saveAvailability(localAvailability);
      setHasChanges(false);
      alert("Availability saved successfully!");
    } catch (error) {
      alert("Failed to save availability. Please try again.");
    }
  };

  const handleReset = () => {
    setLocalAvailability(availability);
    setHasChanges(false);
  };

  if (loading) {
    return <div className="loading">Loading availability...</div>;
  }

  return (
    <div className="availability-settings">
      <div className="availability-header">
        <h3>Set Your Weekly Availability</h3>
        <p>Select the time slots when you're available for appointments</p>
      </div>

      <div className="availability-grid">
        <div className="grid-header">
          <div className="time-label">Time</div>
          {DAYS.map((day) => (
            <div key={day} className="day-label">
              {day.charAt(0).toUpperCase() + day.slice(1, 3)}
            </div>
          ))}
        </div>

        {TIME_SLOTS.map((time) => (
          <div key={time} className="grid-row">
            <div className="time-cell">{time}</div>
            {DAYS.map((day) => (
              <div
                key={`${day}-${time}`}
                className={`slot-cell ${
                  localAvailability[day]?.includes(time) ? "selected" : ""
                }`}
                onClick={() => toggleTimeSlot(day, time)}
              >
                {localAvailability[day]?.includes(time) && "✓"}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="availability-actions">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="save-btn"
        >
          {saving ? "Saving..." : "Save Availability"}
        </button>
        <button
          onClick={handleReset}
          disabled={!hasChanges || saving}
          className="reset-btn"
        >
          Reset Changes
        </button>
      </div>

      {hasChanges && (
        <div className="unsaved-warning">
          You have unsaved changes
        </div>
      )}
    </div>
  );
}

export default TherapistAvailabilitySettings;