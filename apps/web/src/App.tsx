import { Routes, Route, Navigate } from "react-router";
import LobbyPage from "@/pages/LobbyPage";
import GamePage from "@/pages/GamePage";
import UpdateBanner from "@/components/UpdateBanner/UpdateBanner";

export default function App() {
  return (
    <>
      <UpdateBanner />
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
