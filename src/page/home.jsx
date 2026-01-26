import { useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../utils/firebase";
import { AuthContext } from "../App";
import { loginAnonymously } from "../login/anonymous_login";
import Header from "../components/header";
import "../assets/styles/home.css";

function Home() {
  const navigate = useNavigate();
  const [loadingAction, setLoadingAction] = useState(null);
  const { showGlobalError } = useContext(AuthContext);

  const handleJoinAnonymous = async (targetPath, actionType) => {
    // Prevent double clicks
    if (loadingAction !== null) return;

    setLoadingAction(actionType);

    try {
      const currentUser = auth.currentUser;

      // Block therapists
      if (currentUser && !currentUser.isAnonymous) {
        showGlobalError(
          "This feature is only available in anonymous mode. Please use your Therapist Dashboard instead."
        );
        setLoadingAction(null);
        return;
      }

      // Already signed in anonymously, go directly, no login needed
      if (currentUser && currentUser.isAnonymous) {
        navigate(targetPath);
        setLoadingAction(null);
        return;
      }

      // Not signed in, sign in anonymously
      await loginAnonymously(showGlobalError);
      navigate(targetPath);
    } catch (err) {
      console.error("Failed to join anonymously:", err);
      showGlobalError("Failed to join. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const testimonials = [
    {
      quote: "This platform gave me a safe space to share my struggles anonymously.",
      author: "Anonymous User",
    },
    {
      quote: "The AI support was there for me at 2 AM when I needed someone to talk to.",
      author: "Anonymous User",
    },
    {
      quote: "Connecting with a therapist privately changed my perspective on mental health.",
      author: "Anonymous User",
    },
  ];

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const toggleFAQ = (index) => {
    document.getElementById(`faq-${index}`).classList.toggle("open");
  };

  return (
    <div className="home-container">
      <Header />
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-content">
          <h1 id="hero-title" className="hero-title">
            Welcome to Anonymous Mental Health Support
          </h1>
          <p className="hero-subtitle">
            A safe, secure space to connect with peers, access AI-driven support, or chat privately with licensed therapists.
          </p>
          <div className="hero-cta">
            <button
              className="cta-button primary"
              onClick={() => handleJoinAnonymous("/anonymous-dashboard", "start")}
              disabled={loadingAction !== null}
            >
              {loadingAction === "start" ? "Starting chat..." : "Start Chatting"}
            </button>
            <Link to="/about" className="cta-button secondary">
              Learn More
            </Link>
          </div>
        </div>
      </section>

      <section className="features-section" aria-labelledby="features-title">
        <h2 id="features-title" className="features-title">
          How We Support You
        </h2>
        <div className="features-grid">
          <div className="feature-card">
            <i className="fas fa-users feature-icon"></i>
            <h3>Peer Support</h3>
            <p>Share experiences anonymously with a supportive community.</p>
            <button
              className="feature-cta"
              onClick={() => handleJoinAnonymous("/anonymous-dashboard/group-chat", "group")}
              disabled={loadingAction !== null}
            >
              {loadingAction === "group" ? "Joining..." : "Join Now"}
            </button>
          </div>
          <div className="feature-card">
            <i className="fas fa-robot feature-icon"></i>
            <h3>AI Support</h3>
            <p>Access 24/7 AI-driven assistance for immediate support, and responses.</p>
          </div>
          <div className="feature-card">
            <i className="fas fa-user-md feature-icon"></i>
            <h3>Therapist Chat</h3>
            <p>Connect privately with licensed therapists in a secure environment.</p>
            {/* <Link to="/find-therapist" className="feature-cta">Find a Therapist</Link> */}
          </div>
        </div>
      </section>

      {/* Rest of your sections (testimonials, stories, FAQ) remain unchanged */}
      <section className="testimonials-section" aria-labelledby="testimonials-title">
        <h2 id="testimonials-title" className="testimonials-title">
          What Our Community Says
        </h2>
        <div className="testimonial-slider">
          <button
            className="slider-arrow left"
            onClick={prevTestimonial}
            aria-label="Previous testimonial"
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <div className="testimonial">
            <p className="testimonial-quote">"{testimonials[currentTestimonial].quote}"</p>
            <p className="testimonial-author">{testimonials[currentTestimonial].author}</p>
          </div>
          <button
            className="slider-arrow right"
            onClick={nextTestimonial}
            aria-label="Next testimonial"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </section>

      <section className="stories-section">
        <h2>Community Stories</h2>
        <div className="stories-grid">
          <div className="story-card">
            <h3>Overcoming Anxiety</h3>
            <p>An anonymous user shares their journey...</p>
            <Link to="/stories/1" className="story-cta">Read More</Link>
          </div>
        </div>
      </section>

      <section className="faq-section" aria-labelledby="faq-title">
        <h2 id="faq-title" className="faq-title">Frequently Asked Questions</h2>
        <div className="faq-list">
          <div className="faq-item" id="faq-1">
            <button className="faq-question" onClick={() => toggleFAQ(1)}>
              Is my identity protected on this platform?
              <i className="fas fa-chevron-down"></i>
            </button>
            <div className="faq-answer">
              <p>
                Yes, our platform ensures complete anonymity. Username are generated anonymously example "Anonymous234", and no personal information is shared publicly.
              </p>
            </div>
          </div>
          <div className="faq-item" id="faq-2">
            <button className="faq-question" onClick={() => toggleFAQ(2)}>
              How do I access AI support?
              <i className="fas fa-chevron-down"></i>
            </button>
            <div className="faq-answer">
              <p>
                Ai support works immediately if no therapist is available to attend to you. then you can start conversation with our AI-driven support system, available 24/7.
              </p>
            </div>
          </div>
          <div className="faq-item" id="faq-3">
            <button className="faq-question" onClick={() => toggleFAQ(3)}>
              Are therapists licensed?
              <i className="fas fa-chevron-down"></i>
            </button>
            <div className="faq-answer">
              <p>
                All therapists on our platform are licensed professionals verified to provide mental health support.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;