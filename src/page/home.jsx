import {Link} from "react-router-dom";
function Home() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Welcome to Anonymous Mental Health Support</h1>
      <p>
        Connect with peers, talk to AI Support, or chat privately with a therapist.
      </p>
      <nav>
        <Link to="/chat">Go to Chatroom</Link> |{" "}
        <Link to="/private">Private Chat</Link> |{" "}
        <Link to="/about">About</Link> |{" "}
        <Link to="/therapist">Login therapist</Link>
      </nav>
    </div>
  );
}
export default Home;