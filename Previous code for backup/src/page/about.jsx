import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from "../utils/firebase";
import { AuthContext } from "../App";
import { loginAnonymously } from "../login/anonymous_login";
import '../assets/styles/about.css';
import Header from "../components/header";

function About() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);
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
      showGlobalError("Failed to join the chat. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      question: "Is my privacy protected?",
      answer: "Yes, we ensure anonymity with advanced encryption and do not store identifiable information unless provided."
    },
    {
      question: "How does AI assistance work?",
      answer: "Our AI provides real-time, empathetic responses based on evidence-based mental health practices."
    },
    {
      question: "Can I access professional therapists?",
      answer: "Yes, you can schedule sessions, book an appointment with licensed therapists for professional support."
    }
  ];

  return (
    <div className="about-container">
      <Header />

      <section className="hero-section-about">
        <div className="hero-content">
          <h1 className="hero-title">About Our Platform</h1>
          <p className="hero-subtitle">
            We provide anonymous mental health support through real-time peer chat, AI-driven assistance, and professional therapist access.
          </p>
          <div className="hero-cta">
            <button
              className="cta-button primary"
              onClick={() => handleJoinAnonymous("/anonymous-dashboard", "community")}
              disabled={loadingAction !== null}
            >
              {loadingAction === "community" ? "Joining Community..." : "Join the Community"}
            </button>
            <Link to="/learn-more" className="cta-button secondary">Learn More</Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <h2 className="features-title">Our Core Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <i className="feature-icon fas fa-comments"></i>
            <h3>Peer Support</h3>
            <p>Connect anonymously with others in real-time to share experiences and support each other.</p>
            <button
              className="feature-cta"
              onClick={() => handleJoinAnonymous("/anonymous-dashboard/group-chat", "group")}
              disabled={loadingAction !== null}
            >
              {loadingAction === "group" ? "Joining Chat..." : "Join Chat"}
            </button>
          </div>
          <div className="feature-card">
            <i className="feature-icon fas fa-robot"></i>
            <h3>AI Assistance</h3>
            <p>Our AI offers instant, empathetic responses and resources to guide you through challenges.</p>
          </div>
          <div className="feature-card">
            <i className="feature-icon fas fa-user-md"></i>
            <h3>Therapist Access</h3>
            <p>Connect with licensed therapists for professional guidance when you need it most.</p>
            <Link to="/find-therapist" className="feature-cta">Find a Therapist</Link>
          </div>
        </div>
      </section>

      <section className="mission-section">
        <h2 className="features-title">Our Mission</h2>
        <p className="mission-text">
          We believe mental health support should be accessible to everyone. Our platform fosters a safe, inclusive community for healing and growth.
        </p>
      </section>

      <section className="faq-section">
        <h2 className="faq-title">Frequently Asked Questions</h2>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <div key={index} className={`faq-item ${openFaq === index ? 'open' : ''}`}>
              <button className="faq-question" onClick={() => toggleFaq(index)}>
                {faq.question}
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className="faq-answer">
                {faq.answer}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default About;