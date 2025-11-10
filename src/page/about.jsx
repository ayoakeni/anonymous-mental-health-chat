import { useState } from 'react';
import { Link } from 'react-router-dom'
import '../styles/about.css';
import Header from "../components/header"

function About() {
  const [openFaq, setOpenFaq] = useState(null);

  // Toggle FAQ item
  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // FAQ data
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
      answer: "Yes, you can schedule sessions with licensed therapists for professional support."
    }
  ];

  return (
    <div className="about-container">
      <Header />
      {/* Hero Section */}
      <section className="hero-section-about">
        <div className="hero-content">
          <h1 className="hero-title">About Our Platform</h1>
          <p className="hero-subtitle">
            We provide anonymous mental health support through real-time peer chat, AI-driven assistance, and professional therapist access.
          </p>
          <div className="hero-cta">
            <Link to="/anonymous-dashboard" className="cta-button primary">Join the Community</Link>
            <Link to="/learn-more" className="cta-button secondary">Learn More</Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <h2 className="features-title">Our Core Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <i className="feature-icon fas fa-comments"></i>
            <h3>Peer Support</h3>
            <p>Connect anonymously with others in real-time to share experiences and support each other.</p>
            <a href="/anonymous-dashboard/group-chat" className="feature-cta">Join Chat</a>
          </div>
          <div className="feature-card">
            <i className="feature-icon fas fa-robot"></i>
            <h3>AI Assistance</h3>
            <p>Our AI offers instant, empathetic responses and resources to guide you through challenges.</p>
            <Link to="/ai-assist" className="feature-cta">Try AI Support</Link>
          </div>
          <div className="feature-card">
            <i className="feature-icon fas fa-user-md"></i>
            <h3>Therapist Access</h3>
            <p>Connect with licensed therapists for professional guidance when you need it most.</p>
            <Link to="/therapists" className="feature-cta">Find a Therapist</Link>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="mission-section">
        <h2 className="features-title">Our Mission</h2>
        <p className="mission-text">
          We believe mental health support should be accessible to everyone. Our platform fosters a safe, inclusive community for healing and growth.
        </p>
      </section>

      {/* FAQ Section */}
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

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Anonymous Mental Health Support. All rights reserved.</p>
        <div className="footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
          <a href="mailto:support@mentalhealthapp.com">Contact Us</a>
        </div>
      </footer>
    </div>
  );
}

export default About;