import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import Navbar from "./components/Navbar.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateQuiz from "./pages/CreateQuiz.jsx";
import EditQuiz from "./pages/EditQuiz.jsx";
import HostRoom from "./pages/HostRoom.jsx";
import JoinRoom from "./pages/JoinRoom.jsx";
import PlayRoom from "./pages/PlayRoom.jsx";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <>
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
          />

          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <Register />
              </GuestOnly>
            }
          />

          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/quiz/new"
            element={
              <RequireAuth>
                <CreateQuiz />
              </RequireAuth>
            }
          />
          <Route
            path="/quiz/:id/edit"
            element={
              <RequireAuth>
                <EditQuiz />
              </RequireAuth>
            }
          />
          <Route
            path="/room/:code/host"
            element={
              <RequireAuth>
                <HostRoom />
              </RequireAuth>
            }
          />

          <Route path="/join" element={<JoinRoom />} />
          <Route path="/room/:code/play" element={<PlayRoom />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
