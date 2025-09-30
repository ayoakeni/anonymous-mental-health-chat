import React from "react";
import { BrowserRouter as Router, Routes, Route} from "react-router-dom";
import Chatroom from "./page/chats_rooms/chat";
import Home from "./page/home";
import About from "./page/about";
import TherapistLogin from "./login/therapist_login";
import PrivateChat from "./page/chats_rooms/PrivateChat";
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chatroom />} />
        <Route path="/private" element={<PrivateChat />} />
        <Route path="/about" element={<About />} />
        <Route path="/therapist" element={<TherapistLogin />} />
      </Routes>
    </Router>
  );
}

export default App;
