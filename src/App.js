import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Chatroom from "./page/chats_rooms/chat";
import Home from "./page/home";
import About from "./page/about";
import TherapistLogin from "./login/therapist_login";
import PrivateChatWrapper from "./components/PrivateChatWrapper";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chatroom />} />
        <Route path="/private/:chatId" element={<PrivateChatWrapper />} />
        <Route path="/about" element={<About />} />
        <Route path="/therapist" element={<TherapistLogin />} />
      </Routes>
    </Router>
  );
}

export default App;
