// src/components/Chatroom.js
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../utils/firebase";

function Chatroom() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser?.email) {
      // Anonymous user
      navigate("/anonymous-dashboard");
    } else {
      // Therapist user
      navigate("/therapist-dashboard");
    }
  }, [navigate]);

  return null; // Redirect happens immediately
}

export default Chatroom;