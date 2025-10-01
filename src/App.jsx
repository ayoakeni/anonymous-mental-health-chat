import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Chatroom from "./page/chats_rooms/groupchat";
import Home from "./page/home";
import About from "./page/about";
import TherapistLogin from "./login/therapist_login";
import PrivateChatWrapper from "./components/PrivateChatWrapper";
import TherapistDashboard from "./page/therapistDashboard";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chatroom />} />
        <Route path="/private/:chatId" element={<PrivateChatWrapper />} />
        <Route path="/about" element={<About />} />
        <Route path="/therapist_login" element={<TherapistLogin />} />
        <Route path="/dashboard_therapist" element={<TherapistDashboard/>} />
      </Routes>
    </Router>
  );
}

export default App;
