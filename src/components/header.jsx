import {Link} from "react-router-dom";
function Header() {
  return (
    <div style={{ padding: "20px" }}>
      <nav>
        <Link to="/chat">Go to Chatroom</Link> |{" "}
        <Link to="/about">About</Link> |{" "}
        <Link to="/therapist_login">Login therapist</Link>
      </nav>
    </div>
  );
}
export default Header;