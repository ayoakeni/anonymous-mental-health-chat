import { useState, useRef, useEffect } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import "../../styles/therapistDashboardProfile.css";

const TherapistDashboardProfile = ({
  therapistInfo,
  editing,
  setEditing,
  setTherapistInfo,
  therapistId,
  isOnline
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);
  const storage = getStorage();

  // LOCAL FORM STATE
  const [formData, setFormData] = useState({
    name: '',
    gender: '',
    position: '',
    profile: '',
    rating: 0,
    profileImage: null
  });

  // Sync form with therapistInfo when entering edit mode
  useEffect(() => {
    if (therapistInfo) {
      setFormData({
        name: therapistInfo.name || '',
        gender: therapistInfo.gender || '',
        position: therapistInfo.position || '',
        profile: therapistInfo.profile || '',
        rating: therapistInfo.rating || 0,
        profileImage: therapistInfo.profileImage || null
      });
    }
  }, [therapistInfo]);

  const handleCancel = () => {
    setFormData({
      name: therapistInfo.name || "",
      gender: therapistInfo.gender || "",
      position: therapistInfo.position || "",
      profile: therapistInfo.profile || "",
      rating: therapistInfo.rating || 0,
      profileImage: therapistInfo.profileImage || null
    });

    setEditing(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrors(p => ({ ...p, profileImage: 'Image size must be < 2 MB' }));
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setErrors(p => ({ ...p, profileImage: 'Only JPEG/PNG allowed' }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData(p => ({ ...p, profileImage: reader.result }));
      setErrors(p => ({ ...p, profileImage: '' }));
    };
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    const err = {};
    if (!formData.name?.trim()) err.name = 'Name is required';
    if (!formData.gender) err.gender = 'Gender is required';
    if (!formData.position?.trim()) err.position = 'Position is required';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm() || !therapistId) return;

    setIsSaving(true);
    try {
      let imageUrl = formData.profileImage;

      if (imageUrl && imageUrl.startsWith('data:')) {
        const resp = await fetch(imageUrl);
        const blob = await resp.blob();
        const storageRef = ref(storage, `therapists/${therapistId}/profile.jpg`);
        await uploadBytes(storageRef, blob);
        imageUrl = await getDownloadURL(storageRef);
      }

      const payload = {
        name: formData.name.trim(),
        gender: formData.gender,
        position: formData.position.trim(),
        profile: formData.profile.trim(),
        rating: Number(formData.rating) || 0,
        ...(imageUrl && { profileImage: imageUrl })
      };

      await setDoc(doc(db, 'therapists', therapistId), payload, { merge: true });

      setTherapistInfo(prev => ({
        ...prev,
        ...payload
      }));

      setSuccessMessage('Profile saved successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setEditing(false);
    } catch (err) {
      console.error(err);
      setErrors(p => ({ ...p, general: 'Failed to save profile.' }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profilePageWrapper">
      <div className="profileContainer">
        {successMessage && <div className="successMessage">{successMessage}</div>}
        {errors.general && <div className="errorMessage">{errors.general}</div>}

        <div className="profileCard">
          {editing ? (
            /* ------------------- EDIT MODE ------------------- */
            <div className="editForm">
              {/* Avatar */}
              <div className="avatarSection">
                <div className={`avatarWrapper ${isOnline ? 'online' : ''}`}>
                  {formData.profileImage ? (
                    <img src={formData.profileImage} alt={formData.name} className="avatar" />
                  ) : (
                    <div className="avatarPlaceholder">
                      {(formData.name?.[0] ?? 'T').toUpperCase()}
                    </div>
                  )}
                  <button type="button" className="uploadButton" onClick={() => fileInputRef.current?.click()}>
                    Upload Image
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png"
                    onChange={handleImageUpload}
                    className="fileInput"
                    style={{ display: 'none' }}
                  />
                </div>
                {errors.profileImage && <span className="error">{errors.profileImage}</span>}
              </div>

              <div className="formGroup">
                <label className="label">Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className={`input ${errors.name ? 'inputError' : ''}`}
                />
                {errors.name && <span className="error">{errors.name}</span>}
              </div>

              <div className="formGroup">
                <label className="label">Gender</label>
                <select
                  value={formData.gender}
                  onChange={e => setFormData(p => ({ ...p, gender: e.target.value }))}
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
                  value={formData.position}
                  onChange={e => setFormData(p => ({ ...p, position: e.target.value }))}
                  className={`input ${errors.position ? 'inputError' : ''}`}
                />
                {errors.position && <span className="error">{errors.position}</span>}
              </div>

              <div className="formGroup">
                <label className="label">Profile Description</label>
                <textarea
                  placeholder="Enter your profile description"
                  value={formData.profile}
                  onChange={e => setFormData(p => ({ ...p, profile: e.target.value }))}
                  className="textarea"
                />
              </div>

              {/* RATING — READ-ONLY */}
              <div className="formGroup">
                <label className="label">Average Rating</label>
                <div className="rating-display">
                  {(therapistInfo.rating ?? 0) > 0 ? (
                    <>
                      <span className='rating'>
                        {'★'.repeat(Math.floor(therapistInfo.rating ?? 0))}
                        {(therapistInfo.rating ?? 0) % 1 >= 0.5 && 'half-star'}
                        <strong className='ratingValue'> {(therapistInfo.rating ?? 0).toFixed(1)}</strong>
                      </span>
                    </>
                  ) : (
                    'No ratings yet'
                  )}
                </div>
              </div>

              <div className="buttonGroup">
                <button onClick={handleSave} className="saveButton" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={handleCancel} className="cancelButton" disabled={isSaving}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ------------------- VIEW MODE ------------------- */
            <div className="viewMode">
              <div className="avatarSection">
                <div className={`avatarWrapper ${isOnline ? 'online' : ''}`}>
                  {therapistInfo.profileImage ? (
                    <img src={therapistInfo.profileImage} alt={therapistInfo.name} className="avatar" />
                  ) : (
                    <div className="avatarPlaceholder">
                      {(therapistInfo.name?.[0] ?? 'T').toUpperCase()}
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
                  {(therapistInfo.rating ?? 0) > 0 ? (
                    <>
                      {'★'.repeat(Math.floor(therapistInfo.rating ?? 0))}
                      {(therapistInfo.rating ?? 0) % 1 >= 0.5 && 'half-star'}
                      <span className="ratingValue">({(therapistInfo.rating ?? 0).toFixed(1)})</span>
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
    </div>
  );
};

export default TherapistDashboardProfile;