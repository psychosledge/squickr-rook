import { Routes, Route, Navigate } from "react-router";
import LobbyPage from "@/pages/LobbyPage";
import GamePage from "@/pages/GamePage";
import OnlineLobbyPage from "@/pages/OnlineLobbyPage";
import OnlineGamePage from "@/pages/OnlineGamePage";
import UpdateBanner from "@/components/UpdateBanner/UpdateBanner";

export default function App() {
  return (
    <>
      <UpdateBanner />
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/online" element={<OnlineLobbyPage />} />
        <Route path="/online/:code" element={<OnlineLobbyPage />} />
        <Route path="/online/:code/game" element={<OnlineGamePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
