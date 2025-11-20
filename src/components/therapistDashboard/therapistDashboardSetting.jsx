import "../../styles/therapistDashboardSetting.css";

export default function TherapistDashboardSetting({
  therapistInfo,
  setTherapistInfo,
  saveSettings,
  isSaving,
  navigate,
  handleLogout,
}) {
  const handleNotificationChange = (key, value) => {
    setTherapistInfo((prev) => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        [key]: value,
      },
    }));
  };

  const handleChatSettingsChange = (key, value) => {
    setTherapistInfo((prev) => ({
      ...prev,
      chatSettings: {
        ...prev.chatSettings,
        [key]: value,
      },
    }));
  };

  const handleAvailabilityChange = (value) => {
    setTherapistInfo((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        online: value,
      },
    }));
  };

  return (
    <div className="settings">
      <h3>Settings</h3>
      <div className="settings-container">
        <div className="settings-section">
          <h4>Notification Preferences</h4>
          <div className="settings-group">
            <label>
              <input
                type="checkbox"
                checked={therapistInfo.notificationPreferences.emailNotifications}
                onChange={(e) =>
                  handleNotificationChange("emailNotifications", e.target.checked)
                }
              />
              Email Notifications
            </label>
            <label>
              <input
                type="checkbox"
                checked={therapistInfo.notificationPreferences.soundNotifications}
                onChange={(e) =>
                  handleNotificationChange("soundNotifications", e.target.checked)
                }
              />
              Sound Notifications
            </label>
            <label>
              <input
                type="checkbox"
                checked={therapistInfo.notificationPreferences.desktopNotifications}
                onChange={(e) =>
                  handleNotificationChange("desktopNotifications", e.target.checked)
                }
              />
              Desktop Notifications
            </label>
            <label>
              Notification Frequency:
              <select
                value={therapistInfo.notificationPreferences.notificationFrequency}
                onChange={(e) =>
                  handleNotificationChange("notificationFrequency", e.target.value)
                }
              >
                <option value="immediate">Immediate</option>
                <option value="hourly">Hourly Digest</option>
                <option value="daily">Daily Digest</option>
              </select>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>Chat Settings</h4>
          <div className="settings-group">
            <label>
              <input
                type="checkbox"
                checked={therapistInfo.chatSettings.autoJoinNewChats}
                onChange={(e) =>
                  handleChatSettingsChange("autoJoinNewChats", e.target.checked)
                }
              />
              Auto-join New Chats
            </label>
            <label>
              <input
                type="checkbox"
                checked={therapistInfo.chatSettings.showTypingIndicator}
                onChange={(e) =>
                  handleChatSettingsChange("showTypingIndicator", e.target.checked)
                }
              />
              Show Typing Indicator
            </label>
            <label>
              <input
                type="checkbox"
                checked={therapistInfo.chatSettings.allowPrivateChats}
                onChange={(e) =>
                  handleChatSettingsChange("allowPrivateChats", e.target.checked)
                }
              />
              Allow Starting Private Chats
            </label>
            <label>
              Message Preview Length:
              <input
                type="number"
                min="20"
                max="100"
                value={therapistInfo.chatSettings.messagePreviewLength}
                onChange={(e) =>
                  handleChatSettingsChange(
                    "messagePreviewLength",
                    parseInt(e.target.value) || 50
                  )
                }
              />
              characters
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>Availability</h4>
          <div className="settings-group">
            <label>
              <input
                type="checkbox"
                checked={therapistInfo.availability.online}
                onChange={(e) => handleAvailabilityChange(e.target.checked)}
              />
              {therapistInfo.availability.online ? "Online" : "Offline"}
            </label>
          </div>
        </div>

        <div className="settings-actions">
          <button
            onClick={saveSettings}
            className="save-settings-btn"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <div className="settings-section">
          <h4>Account Management</h4>
          <div className="settings-group">
            <button onClick={() => navigate("/therapist-dashboard/profile")}>
              Edit Profile
            </button>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </div>
    </div>
  );
}