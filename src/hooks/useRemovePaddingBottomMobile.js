import { useLocation } from "react-router-dom";

export function useRemovePaddingBottomMobile() {
  const { pathname } = useLocation();

  // Match ANY private or group chat route (list or inside)
  const isPrivateChat = /\/private-chat($|\/)/.test(pathname);
  const isGroupChat   = /\/group-chat($|\/)/.test(pathname);
  const isNotify   = /\/notifications($|\/)/.test(pathname);
  const isAppoint   = /\/appointments($|\/)/.test(pathname);
  return isPrivateChat || isGroupChat || isNotify || isAppoint;
}