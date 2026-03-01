import { Routes, Route, Navigate } from "react-router";
import LobbyPage from "@/pages/LobbyPage";
import GamePage from "@/pages/GamePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
