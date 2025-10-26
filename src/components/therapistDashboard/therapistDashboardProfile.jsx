import React, { useState, useRef } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import "../../styles/therapistDashboardProfile.css";

const TherapistDashboardProfile = ({ therapistInfo, editing, setEditing, setTherapistInfo, saveProfile, therapistId, isOnline }) => {
  const [profileImage, setProfileImage] = useState(therapistInfo.profileImage || null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);
  const storage = getStorage();

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, profileImage: 'Image size must be less than 2MB' }));
        return;
      }
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        setErrors((prev) => ({ ...prev, profileImage: 'Only JPEG or PNG images are allowed' }));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setProfileImage(reader.result);
        setTherapistInfo((prev) => ({ ...prev, profileImage: reader.result }));
        setErrors((prev) => ({ ...prev, profileImage: '' }));
      };
      reader.readAsDataURL(file);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!therapistInfo.name.trim()) newErrors.name = 'Name is required';
    if (!therapistInfo.gender) newErrors.gender = 'Gender is required';
    if (!therapistInfo.position.trim()) newErrors.position = 'Position is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (!therapistId) {
      setErrors((prev) => ({ ...prev, general: 'User ID is missing. Please try again.' }));
      return;
    }

    setIsSaving(true);
    try {
      let fileUrl = therapistInfo.profileImage;
      if (fileUrl && fileUrl.startsWith('data:')) {
        // Convert base64 to blob
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        const storageRef = ref(storage, `therapists/${therapistId}/profile.jpg`);
        await uploadBytes(storageRef, blob);
        fileUrl = await getDownloadURL(storageRef);
        setTherapistInfo((prev) => ({ ...prev, profileImage: fileUrl }));
      }

      // Update Firestore with profile data
      await setDoc(
        doc(db, 'therapists', therapistId),
        {
          name: therapistInfo.name,
          gender: therapistInfo.gender,
          position: therapistInfo.position,
          profile: therapistInfo.profile,
          rating: therapistInfo.rating,
          profileImage: fileUrl,
        },
        { merge: true }
      );

      setSuccessMessage('Profile saved successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setEditing(false);

      // Call parent saveProfile for any additional logic
      await saveProfile();
    } catch (err) {
      console.error('Error saving profile:', err);
      setErrors((prev) => ({ ...prev, general: 'Failed to save profile. Please try again.' }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profileContainer">
      {successMessage && <div className="successMessage">{successMessage}</div>}
      {errors.general && <div className="errorMessage">{errors.general}</div>}
      <div className="profileCard">
        {editing ? (
          <div className="editForm">
            <div className="avatarSection">
              <div className="avatarWrapper">
                {therapistInfo.profileImage ? (
                  <img src={therapistInfo.profileImage} alt={therapistInfo.name} className={`avatar ${isOnline ? "online" : ""}`} />
                ) : (
                  <div className={`avatarPlaceholder ${isOnline ? "online" : ""}`}>
                    {therapistInfo.name ? therapistInfo.name[0].toUpperCase() : 'T'}
                  </div>
                )}
                <button
                  className="uploadButton"
                  onClick={() => fileInputRef.current.click()}
                >
                  Upload Image
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png"
                  onChange={handleImageUpload}
                  className="fileInput"
                />
                {errors.profileImage && <span className="error">{errors.profileImage}</span>}
              </div>
            </div>
            <div className="formGroup">
              <label className="label">Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={therapistInfo.name}
                onChange={(e) => setTherapistInfo((prev) => ({ ...prev, name: e.target.value }))}
                className={`input ${errors.name ? 'inputError' : ''}`}
              />
              {errors.name && <span className="error">{errors.name}</span>}
            </div>
            <div className="formGroup">
              <label className="label">Gender</label>
              <select
                value={therapistInfo.gender}
                onChange={(e) => setTherapistInfo((prev) => ({ ...prev, gender: e.target.value }))}
                className={`input ${errors.gender ? 'inputError' : ''}`}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-Binary">Non-Binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
              {errors.gender && <span className="error">{errors.gender}</span>}
            </div>
            <div className="formGroup">
              <label className="label">Position</label>
              <input
                type="text"
                placeholder="Enter your position"
                value={therapistInfo.position}
                onChange={(e) => setTherapistInfo((prev) => ({ ...prev, position: e.target.value }))}
                className={`input ${errors.position ? 'inputError' : ''}`}
              />
              {errors.position && <span className="error">{errors.position}</span>}
            </div>
            <div className="formGroup">
              <label className="label">Profile Description</label>
              <textarea
                placeholder="Enter your profile description"
                value={therapistInfo.profile}
                onChange={(e) => setTherapistInfo((prev) => ({ ...prev, profile: e.target.value }))}
                className="textarea"
              />
            </div>
            <div className="formGroup">
              <label className="label">Rating</label>
              <input
                type="number"
                placeholder="Rating (0-5)"
                value={therapistInfo.rating}
                onChange={(e) =>
                  setTherapistInfo((prev) => ({ ...prev, rating: parseFloat(e.target.value) || 0 }))
                }
                min={0}
                max={5}
                step={0.1}
                className="input"
              />
            </div>
            <div className="buttonGroup">
              <button onClick={handleSave} className="saveButton" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="cancelButton" disabled={isSaving}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="viewMode">
            <div className="avatarSection">
              <div className="avatarWrapper">
                {therapistInfo.profileImage ? (
                  <img src={therapistInfo.profileImage} alt={therapistInfo.name} className={`avatar ${isOnline ? "online" : ""}`} />
                ) : (
                  <div className={`avatarPlaceholder ${isOnline ? "online" : ""}`}>
                    {therapistInfo.name ? therapistInfo.name[0].toUpperCase() : 'T'}
                  </div>
                )}
              </div>
            </div>
            <div className="profileField">
              <span className="fieldLabel">Name:</span>
              <span className="fieldValue">{therapistInfo.name || 'Not set'}</span>
            </div>
            <div className="profileField">
              <span className="fieldLabel">Gender:</span>
              <span className="fieldValue">{therapistInfo.gender || 'Not set'}</span>
            </div>
            <div className="profileField">
              <span className="fieldLabel">Position:</span>
              <span className="fieldValue">{therapistInfo.position || 'Not set'}</span>
            </div>
            <div className="profileField">
              <span className="fieldLabel">About:</span>
              <span className="fieldValue">{therapistInfo.profile || 'No description provided'}</span>
            </div>
            <div className="profileField">
              <span className="fieldLabel">Rating:</span>
              <span className="rating">
                {therapistInfo.rating > 0 ? (
                  <>
                    {'★'.repeat(Math.floor(therapistInfo.rating))}
                    {therapistInfo.rating % 1 >= 0.5 && '☆'}
                    <span className="ratingValue">({therapistInfo.rating.toFixed(1)})</span>
                  </>
                ) : (
                  'No rating'
                )}
              </span>
            </div>
            <button onClick={() => setEditing(true)} className="editButton">
              Edit Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TherapistDashboardProfile;