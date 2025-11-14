import { useLocation } from "react-router-dom";

export function useInChat() {
  const { pathname } = useLocation();

  const isPrivate = pathname.includes("/private-chat/");
  const isGroup   = pathname.includes("/group-chat/");

  // Count non-empty path segments
  const segments = pathname.split("/").filter(Boolean);
  const inPrivateChat = isPrivate && segments.length > 2;
  const inGroupChat   = isGroup   && segments.length > 2;

  return inPrivateChat || inGroupChat;
}