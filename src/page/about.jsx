import React, { useState } from 'react';
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
            <a href="/anonymous-dashboard" className="cta-button primary">Join the Community</a>
            <a href="/learn-more" className="cta-button secondary">Learn More</a>
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
            <a href="/anonmous-dashboard" className="feature-cta">Join Chat</a>
          </div>
          <div className="feature-card">
            <i className="feature-icon fas fa-robot"></i>
            <h3>AI Assistance</h3>
            <p>Our AI offers instant, empathetic responses and resources to guide you through challenges.</p>
            <a href="/ai-assist" className="feature-cta">Try AI Support</a>
          </div>
          <div className="feature-card">
            <i className="feature-icon fas fa-user-md"></i>
            <h3>Therapist Access</h3>
            <p>Connect with licensed therapists for professional guidance when you need it most.</p>
            <a href="/therapists" className="feature-cta">Find a Therapist</a>
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

      {/* Crisis Support Section */}
      <section className="crisis-section">
        <h2 className="crisis-title">Need Immediate Help?</h2>
        <p className="crisis-text">
          If you or someone you know is in crisis, reach out to our 24/7 support or contact a local helpline.
        </p>
        <a href="/crisis" className="crisis-button">Get Help Now</a>
      </section>
    </div>
  );
}

export default About;