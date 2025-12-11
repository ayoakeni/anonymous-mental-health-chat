import { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../utils/firebase";
import { useNavigate } from "react-router-dom";
import Header from "../components/header";
import AppointmentBooking from "../components/AnonymousDashboard/anonymousAppointmentBooking";
import { Search, Star, CheckCircle, Clock, MessageCircle, Calendar } from "lucide-react";
import "../assets/styles/find-therapist.css";

export default function FindTherapist() {
  const [therapists, setTherapists] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "therapists"));
    const unsub = onSnapshot(q, async (snapshot) => {
      const therapistsData = await Promise.all(
        snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            uid: docSnap.id,
            ...data,
            online: data.online || false,
            allowPrivateChats: data.chatSettings?.allowPrivateChats ?? true,
            rating: data.rating || 0,
            totalRatings: data.totalRatings || 0,
            profileImage: data.profileImage || null,
          };
        })
      );

      setTherapists(therapistsData.filter(t => t.verified !== false));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const specialties = useMemo(() => {
    const all = therapists.flatMap(t => t.specialties || []);
    return ["all", ...new Set(all)];
  }, [therapists]);

  const filteredTherapists = useMemo(() => {
    return therapists.filter(t => {
      const matchesSearch = 
        t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.position?.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.specialties?.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSpecialty = selectedSpecialty === "all" || 
        t.specialties?.includes(selectedSpecialty);

      return matchesSearch && matchesSpecialty;
    });
  }, [therapists, searchTerm, selectedSpecialty]);

  const startPrivateChat = async (therapist) => {
    if (!therapist.allowPrivateChats) {
      alert("This therapist is not accepting private chats right now.\n\nYou can still book a session with them!");
      return;
    }

    const anonUid = auth.currentUser?.uid;
    if (!anonUid) {
      alert("You need to be signed in to message a therapist\n\nPlease go back to the home page and tap “Start Chatting” to continue.");
      return;
    }

    const uids = [anonUid.slice(0, 8), therapist.uid.slice(0, 8)].sort();
    const chatId = `${uids[0]}_${uids[1]}`;

    navigate(`/anonymous-dashboard/private-chat/${chatId}`, {
      state: {
        selectChatId: chatId,
        therapistId: therapist.uid,
        therapistName: therapist.name,
      },
    });
  };

  return (
    <div className="find-therapist-page">
      <Header />
      <section className="find-therapist-hero">
        <div className="hero-content">
          <h1>Find Your Therapist</h1>
          <p>Connect with verified mental health professionals ready to support you.</p>
        </div>
      </section>

      <section className="find-therapist-stats">
        <div className="stats-grid">
          <div className="stat-item">
            <p className="stat-number">{therapists.length}</p>
            <p className="stat-label">Total Therapists</p>
          </div>
          <div className="stat-item">
            <p className="stat-number online">{therapists.filter(t => t.online).length}</p>
            <p className="stat-label">Online Now</p>
          </div>
          <div className="stat-item">
            <p className="stat-number">4.8</p>
            <p className="stat-label">Average Rating</p>
          </div>
          <div className="stat-item">
            <p className="stat-number">24/7</p>
            <p className="stat-label">Support Available</p>
          </div>
        </div>
      </section>

      <section className="find-therapist-filters">
        <div className="filters-container">
          <div className="search-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search by name, specialty, or position..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <select
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            className="specialty-filter"
          >
            {specialties.map(spec => (
              <option key={spec} value={spec}>
                {spec === "all" ? "All Specialties" : spec}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="find-therapist-list">
        {loading ? ( 
        <div className="find-therapist-loading">
          <p><span className="spinner"></span> Loading therapists...</p>
        </div>
        ) : filteredTherapists.length === 0 ? (
          <p className="no-results">No therapists found matching your criteria.</p>
        ) : (
          <div className="therapist-grid">
            {filteredTherapists.map(therapist => (
              <article key={therapist.id} className="therapist-card">
                <header className="therapist-header">
                  <div className="therapist-info">
                    <div className="therapist-avatar-wrapper">
                      {therapist.profileImage ? (
                        <img 
                          src={therapist.profileImage} 
                          alt={therapist.name}
                          className="therapist-avatar-img"
                        />
                      ) : (
                        <div className="therapist-avatar-fallback">
                          {therapist.name?.[0] || "T"}
                        </div>
                      )}
                      {therapist.online && <div className="online-indicator"></div>}
                    </div>
                    <div>
                      <h3>{therapist.name}</h3>
                      <p className="position">{therapist.position?.position || therapist.position}</p>
                    </div>
                  </div>
                  {therapist.verified && (
                    <div className="verified-badge">
                      <CheckCircle className="icon" />
                      Verified
                    </div>
                  )}
                </header>

                <div className="therapist-body">
                  <p className="bio">
                    {therapist.profile || "Dedicated mental health professional ready to support you."}
                  </p>

                  {therapist.specialties && therapist.specialties.length > 0 && (
                    <div className="specialties">
                      <p className="label">Specialties</p>
                      <div className="specialty-tags">
                        {therapist.specialties.map((spec, i) => (
                          <span key={i} className="specialty-tag">{spec}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rating">
                    <div className="stars">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`star ${i < Math.floor(therapist.rating) ? "filled" : ""}`}
                        />
                      ))}
                    </div>
                    <span className="rating-text">
                      {therapist.rating.toFixed(1)} ({therapist.totalRatings} reviews)
                    </span>
                  </div>

                  <div className="status">
                    {therapist.online ? (
                      <>
                        <div className="online-dot"></div>
                        <span>Available Now</span>
                      </>
                    ) : (
                      <>
                        <Clock className="icon" />
                        <span>Usually responds in a few hours</span>
                      </>
                    )}
                  </div>

                  <div className="therapist-actions">
                  <button
                    onClick={() => startPrivateChat(therapist)}
                    className={`btn-chat ${!therapist.allowPrivateChats ? 'unavailable' : ''}`}
                    title={
                      !therapist.allowPrivateChats
                        ? "This therapist is not accepting private chats right now"
                        : "Start a private chat"
                    }
                  >
                    <MessageCircle className="icon" />
                    {therapist.allowPrivateChats ? "Start Chat" : "Unavailable"}
                  </button>

                    <button
                      onClick={() => {
                        setSelectedTherapist(therapist);
                        setShowBooking(true);
                      }}
                      className="btn-book"
                    >
                      <Calendar className="icon" />
                      Book Session
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {showBooking && selectedTherapist && (
        <AppointmentBooking
          therapist={selectedTherapist}
          onClose={() => {
            setShowBooking(false);
            setSelectedTherapist(null);
          }}
        />
      )}
    </div>
  );
}