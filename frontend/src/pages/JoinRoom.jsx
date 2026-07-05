import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function JoinRoom() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [code, setCode] = useState(searchParams.get("code") || "");
  const [username, setUsername] = useState(user?.username || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);

  // Auto-lookup when code is 6 chars
  useEffect(() => {
    if (code.length === 6) {
      axios
        .get(`/api/rooms/${code.toUpperCase()}`)
        .then((r) => setRoomInfo(r.data))
        .catch(() => setRoomInfo(null));
    } else {
      setRoomInfo(null);
    }
  }, [code]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (code.trim().length !== 6) {
      setError("Введите 6-значный код");
      return;
    }
    if (!user && username.trim().length < 2) {
      setError("Введите имя (минимум 2 символа)");
      return;
    }
    setLoading(true);

    try {
      const r = await axios.get(`/api/rooms/${code.toUpperCase()}`);
      if (r.data.room.status === "finished") {
        setError("Этот квиз уже завершён");
        setLoading(false);
        return;
      }
      navigate(`/room/${code.toUpperCase()}/play`, {
        state: { username: user ? user.username : username.trim() },
      });
    } catch (err) {
      setError(err.response?.data?.error || "Комната не найдена");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div style={{ width: "100%", maxWidth: 440, padding: "0 16px" }}>
        <div className="card card-lg surface-panel">
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎮</div>
            <span className="badge badge-primary mb-16">VK Quiz Arena</span>
            <h1 style={{ fontSize: 26 }}>Подключиться к комнате</h1>
            <p className="text-secondary mt-8">
              Введите код комнаты, который выдал организатор, и войдите в игру.
            </p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={submit}>
            <div className="form-group">
              <label>Код комнаты</label>
              <input
                className="input"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6),
                  )
                }
                placeholder="XXXXXX"
                maxLength={6}
                autoFocus
                style={{
                  textAlign: "center",
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: 6,
                  fontFamily: "monospace",
                }}
              />
            </div>

            {roomInfo && (
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                <strong>{roomInfo.quiz.title}</strong>
                <span className="text-sm" style={{ marginLeft: 8 }}>
                  {roomInfo.quiz.category}
                </span>
                <br />
                <span className="text-sm">
                  {roomInfo.participantCount} участников ·{" "}
                  {roomInfo.room.status === "waiting" ? "Ожидание" : "Идёт"}
                </span>
              </div>
            )}

            {!user && (
              <div className="form-group">
                <label>Ваше имя</label>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите имя"
                  maxLength={30}
                />
              </div>
            )}

            {user && (
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                Вы войдёте как <strong>{user.username}</strong>
              </div>
            )}

            <button
              className="btn btn-primary btn-block btn-lg"
              type="submit"
              disabled={loading || code.length !== 6}
            >
              {loading ? "Подключаемся..." : "Войти в квиз"}
            </button>
          </form>

          {!user && (
            <p className="text-center mt-16 text-secondary text-sm">
              Есть аккаунт? <a href="/login">Войти</a> — тогда результаты
              попадут в профиль.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
