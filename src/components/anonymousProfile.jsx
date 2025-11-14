// src/components/AnonymousDashboard/ProfilePrompt.jsx
import { useEffect, useState } from "react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../../utils/firebase";

/* --------------------------------------------------------------
   Reverse-geocode → “Area, City, Country”
   -------------------------------------------------------------- */
const getDetailedLocation = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    const data = await res.json();

    const area = data.locality || data.suburb || data.postcode || "";
    const city = data.city || data.principalSubdivision || "";
    const country = data.countryName || "";

    const parts = [area, city, country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Unknown area";
  } catch (err) {
    console.error("Geocode failed:", err);
    return "Location unavailable";
  }
};

/* --------------------------------------------------------------
   ProfilePrompt Component
   -------------------------------------------------------------- */
export default function ProfilePrompt() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  /* ----------------------------------------------------------
     Show modal only the first time (no displayName yet)
     ---------------------------------------------------------- */
  useEffect(() => {
    const check = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, "anonymousUsers", user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists() || !snap.data()?.displayName) {
        setShow(true);
      }
    };
    check();
  }, []);

  /* ----------------------------------------------------------
     Location consent handler
     ---------------------------------------------------------- */
  const handleLocationConsent = async (checked) => {
    setConsentGiven(checked);
    if (!checked) {
      setLocation("");
      return;
    }

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      setConsentGiven(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const full = await getDetailedLocation(latitude, longitude);
        setLocation(full);
      },
      () => {
        alert("Location access denied.");
        setConsentGiven(false);
        setLocation("");
      },
      { timeout: 10000, maximumAge: 600000 }
    );
  };

  /* ----------------------------------------------------------
     Save profile
     ---------------------------------------------------------- */
  const saveProfile = async () => {
    if (!name.trim()) {
      alert("Please enter a name.");
      return;
    }
    setLoading(true);
    try {
      const user = auth.currentUser;
      await setDoc(
        doc(db, "anonymousUsers", user.uid),
        {
          displayName: name.trim(),
          email: email.trim() || null,
          location: location || null,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      setShow(false);
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <>
      {/* Embedded CSS */}
      <style>{`
        .profile-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .profile-modal {
          background: #fff;
          border-radius: 12px;
          padding: 1.5rem;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .profile-modal h3 {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
          color: #1a1a1a;
        }

        .subtitle {
          margin-bottom: 1.5rem;
          color: #555;
        }

        .profile-input {
          width: 100%;
          padding: 0.75rem;
          margin-bottom: 1rem;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 1rem;
        }

        .location-section {
          margin-bottom: 1.5rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.95rem;
          cursor: pointer;
          user-select: none;
        }

        .location-preview {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #f8f9fa;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .location-edit {
          width: 100%;
          margin-top: 0.5rem;
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .button-group {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }

        .btn-primary,
        .btn-secondary {
          padding: 0.75rem 1.25rem;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary {
          background: #007bff;
          color: #fff;
        }
        .btn-primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .btn-secondary {
          background: #6c757d;
          color: #fff;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #5a6268;
        }

        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      {/* Modal UI */}
      <div className="profile-modal-backdrop">
        <div className="profile-modal">
          <h3>Help Your Therapist Help You</h3>
          <p className="subtitle">
            <small>
              Optional info — only visible to your therapist. You control everything.
            </small>
          </p>

          <input
            type="text"
            placeholder="Your name (e.g., Alex)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="profile-input"
            autoFocus
          />

          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="profile-input"
          />

          <div className="location-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => handleLocationConsent(e.target.checked)}
              />
              Share approximate location (area, city, country)
            </label>

            {location && (
              <div className="location-preview">
                <small>
                  Detected: <strong>{location}</strong>
                </small>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Edit (e.g., Yaba, Lagos)"
                  className="location-edit"
                />
              </div>
            )}
          </div>

          <div className="button-group">
            <button
              onClick={saveProfile}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
            <button
              onClick={() => setShow(false)}
              disabled={loading}
              className="btn-secondary"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </>
  );
}