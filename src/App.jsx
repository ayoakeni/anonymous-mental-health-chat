import { Routes, Route } from "react-router-dom";
import Home from "./page/home";
import About from "./page/about";
import ChatRoom from "./page/chats_rooms/chatRoom";
import TherapistLogin from "./login/therapist_login";
import PrivateChatWrapper from "./page/chats_rooms/PrivateChatWrapper";
import TherapistDashboard from "./page/therapistDashboard";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/chat-room" element={<ChatRoom />} />
      <Route path="/chat-room/:chatId" element={<PrivateChatWrapper />} />
      <Route path="/about" element={<About />} />
      <Route path="/therapist-login" element={<TherapistLogin />} />
      <Route path="/therapist-dashboard/*" element={<TherapistDashboard />} />
    </Routes>
  );
}

export default App;