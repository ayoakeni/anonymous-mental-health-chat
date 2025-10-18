// src/components/PrivateChat.js
import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "../../utils/firebase";

function PrivateChat({ chatId }) {
  const navigate = useNavigate();
  const { chatId: paramChatId } = useParams();

  useEffect(() => {
    if (!auth.currentUser?.email) {
      // Anonymous user
      navigate(`/anonymous-dashboard/private-chat/${chatId || paramChatId}`);
    } else {
      // Therapist user
      navigate(`/therapist-dashboard/private-chat/${chatId || paramChatId}`);
    }
  }, [navigate, chatId, paramChatId]);

  return null; // Redirect happens immediately
}

export default PrivateChat;