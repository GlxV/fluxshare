import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function RoomLandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/p2p", { replace: true });
  }, [navigate]);

  return null;
}
