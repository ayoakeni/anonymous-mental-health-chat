import React from "react";
import { useParams } from "react-router-dom";
import PrivateChat from "./PrivateChat";

function PrivateChatWrapper() {
  const { chatId } = useParams();
  return <PrivateChat chatId={chatId} />;
}

export default PrivateChatWrapper;
