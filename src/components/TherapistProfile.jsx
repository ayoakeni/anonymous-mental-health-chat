import { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { doc, onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { Verified } from "lucide-react";
import "../assets/styles/therapistProfile.css";

function TherapistProfile({ therapist, onBack, isOnline }) {
  const [realTimeOnline, setRealTimeOnline] = useState(isOnline);
  const [showReviews, setShowReviews] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Real-time online status
  useEffect(() => {
    if (!therapist?.uid) return;
    const therapistRef = doc(db, "therapists", therapist.uid);
    const unsubscribe = onSnapshot(
      therapistRef,
      (snap) => {
        if (snap.exists()) {
          setRealTimeOnline(snap.data().online ?? false);
        }
      },
      (err) => console.error("Online status error:", err)
    );
    return () => unsubscribe();
  }, [therapist?.uid]);

  useEffect(() => {
    if (!therapist?.uid || !showReviews) {
      setReviews([]);
      return;
    }

    setLoadingReviews(true);

    const therapistRef = doc(db, "therapists", therapist.uid);

    const unsubscribe = onSnapshot(therapistRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const loadedReviews = (data.ratings || []).map((r, index) => ({
          id: `rating-${index}`, // fake id since it's an array
          rating: r.rating,
          comment: r.comment || "",
          createdAt: data.ratedAt || null,
          anonymous: true,
          reviewerName: "Client",
        }));
        setReviews(loadedReviews);
      }
      setLoadingReviews(false);
    });

    return () => unsubscribe();
  }, [therapist?.uid, showReviews]);

  if (!therapist) return null;

  const toggleReviews = () => {
    setShowReviews((prev) => !prev);
  };

  return (
    <div className="therapist-profile">
      <div className="detail-close">
        <button className="close-button" onClick={onBack}>
          <i className="fa-solid fa-times"></i>
        </button>
        <span>Contact info</span>
      </div>

      <div className={`avatarWrapper ${realTimeOnline ? "online" : ""}`}>
        {therapist.profileImage ? (
          <img src={therapist.profileImage} alt={therapist.name} className="avatar" />
        ) : (
          <div className="avatarPlaceholder">
            {therapist.name?.[0]?.toUpperCase() || "T"}
          </div>
        )}
      </div>

      <h3>
        <div className="name-badge">
          {therapist.name}
          <div className="badges">
            {!therapist.verified && <Verified size={17} className="verified" />}
            {therapist.rating >= 4 && <span className="top-rated">Top Rated</span>}
          </div>
        </div>
        <span className={`status ${realTimeOnline ? "online" : "offline"}`}>
          ● {realTimeOnline ? "Online" : "Offline"}
        </span>
      </h3>

      <p><strong>Gender:</strong> {therapist.gender || "Not specified"}</p>
      <p><strong>Position:</strong> {therapist.position || "Not specified"}</p>
      <p><strong>About:</strong> {therapist.profile || "No description available"}</p>

      <div className="specialties">
        <strong>Specialties:</strong>
        {(therapist.specialties || ["Not specified"]).map((s, i) => (
          <span key={i} className="specialty-tag">{s}</span>
        ))}
      </div>

      <p>
        <strong>Rating:</strong>{" "}
        <span className="rating">
          {therapist.rating > 0 ? (
            <>
              {'★'.repeat(Math.floor(therapist.rating))}
              {therapist.rating % 1 >= 0.5 && '☆'}
              <span className="ratingValue"> {therapist.rating.toFixed(1)}</span>
              {therapist.totalRatings > 0 && (
                <span 
                  className="review" 
                  onClick={toggleReviews}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleReviews()}
                >
                  ({therapist.totalRatings} {therapist.totalRatings === 1 ? 'review' : 'reviews'})
                </span>
              )}
            </>
          ) : (
            "No ratings yet"
          )}
        </span>
      </p>

      {/* Reviews Section */}
      {showReviews && (
        <div className="reviews-section">
          <h4>Reviews ({therapist.totalRatings || 0})</h4>

          {loadingReviews ? (
            <p className="loading">Loading reviews...</p>
          ) : reviews.length === 0 ? (
            <p className="no-reviews">No reviews yet.</p>
          ) : (
            <div className="reviews-list">
              {reviews.map((review) => (
                <div key={review.id} className="review-item">
                  <div className="review-header">
                    <span className="reviewer-name">
                      {review.anonymous ? "Anonymous" : (review.reviewerName || "User")}
                    </span>
                    <span className="review-date">
                      {review.createdAt 
                        ? new Date(review.createdAt.toDate ? review.createdAt.toDate() : review.createdAt).toLocaleDateString() 
                        : "Date unknown"}
                    </span>
                  </div>
                  <div className="review-stars">
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                  </div>
                  <p className="review-comment">{review.comment || "No comment provided"}</p>
                </div>
              ))}
            </div>
          )}

          <button 
            className="hide-reviews-btn"
            onClick={() => setShowReviews(false)}
          >
            Hide reviews
          </button>
        </div>
      )}
    </div>
  );
}

export default TherapistProfile;