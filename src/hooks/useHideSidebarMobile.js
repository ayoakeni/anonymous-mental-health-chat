import { useLocation } from "react-router-dom";

export function useHideSidebarMobile() {
  const { pathname } = useLocation();

  const isPrivate = pathname.includes("/private-chat/");
  const isGroup   = pathname.includes("/group-chat/");

  const segments = pathname.split("/").filter(Boolean);
  // Always hide sidebar in anonymous private chat
  if (pathname.startsWith("/anonymous-dashboard/private-chat")) {
    return true;
  }

  // Normal behavior for therapist + group
  const inPrivateChat = isPrivate && segments.length > 2;
  const inGroupChat   = isGroup   && segments.length > 2;

  return inPrivateChat || inGroupChat;
}