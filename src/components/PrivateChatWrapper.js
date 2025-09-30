import React from "react";
import { useParams } from "react-router-dom";
import PrivateChat from "../page/chats_rooms/PrivateChat";

function PrivateChatWrapper() {
  const { chatId } = useParams();
  return <PrivateChat chatId={chatId} />;
}

export default PrivateChatWrapper;
