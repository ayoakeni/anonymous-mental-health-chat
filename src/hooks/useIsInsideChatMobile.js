import { useLocation } from "react-router-dom";

export function useIsInsideChat() {
  const { pathname } = useLocation();

  const chatBases = [
    "/therapist-dashboard/private-chat",
    "/therapist-dashboard/group-chat",
    "/anonymous-dashboard/private-chat",
    "/anonymous-dashboard/group-chat",
  ];

  return chatBases.some((base) => {
    const regex = new RegExp(`^${base}/[^/]+$`);
    return regex.test(pathname);
  });
}