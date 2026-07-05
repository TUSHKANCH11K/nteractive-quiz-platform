import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext.jsx";

const CATEGORIES = [
  "Общее",
  "Технологии",
  "Наука",
  "История",
  "География",
  "Спорт",
  "Культура",
  "Кино",
];

const statusLabel = {
  waiting: "Ожидание",
  active: "Идёт",
  finished: "Завершён",
};
const statusBadge = {
  waiting: "badge-warning",
  active: "badge-success",
  finished: "badge-gray",
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [hostedRooms, setHostedRooms] = useState([]);
  const [participatedRooms, setParticipatedRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);

  const stats = [
    { label: "Ваши квизы", value: quizzes.length },
    { label: "Проведённые комнаты", value: hostedRooms.length },
    { label: "Участий", value: participatedRooms.length },
  ];

  useEffect(() => {
    Promise.all([
      axios.get("/api/quizzes/my"),
      axios.get("/api/rooms/my/hosted"),
      axios.get("/api/quizzes/history"),
    ])
      .then(([q, r, h]) => {
        setQuizzes(q.data);
        setHostedRooms(r.data);
        setParticipatedRooms(h.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const deleteQuiz = async (id) => {
    if (!confirm("Удалить квиз?")) return;
    await axios.delete(`/api/quizzes/${id}`);
    setQuizzes((q) => q.filter((x) => x.id !== id));
  };

  const launchQuiz = async (quizId) => {
    setCreating(quizId);
    try {
      const r = await axios.post("/api/rooms", { quiz_id: quizId });
      navigate(`/room/${r.data.code}/host`);
    } catch (err) {
      alert(err.response?.data?.error || "Ошибка запуска");
    } finally {
      setCreating(null);
    }
  };

  if (loading)
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );

  return (
    <div className="page">
      <div className="hero-card mb-24">
        <div className="hero-copy">
          <span className="badge badge-primary mb-16">VK Quiz Arena</span>
          <h1>Центр управления квизами</h1>
          <p className="text-secondary mt-8">
            Собирайте вопросы, запускайте комнаты и следите за историей игр в
            одном месте.
          </p>
        </div>
        <div className="hero-grid">
          {stats.map((stat) => (
            <div key={stat.label} className="hero-stat">
              <span className="hero-stat-value">{stat.value}</span>
              <span className="hero-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-12 mt-24" style={{ flexWrap: "wrap" }}>
          <Link to="/quiz/new" className="btn btn-primary btn-lg">
            + Создать квиз
          </Link>
          <Link to="/join" className="btn btn-secondary btn-lg">
            Войти по коду
          </Link>
        </div>
      </div>

      <div className="section-heading mb-16">
        <h2>Мои квизы</h2>
        <p className="text-secondary">
          Редактируйте, запускайте и следите за живыми комнатами.
        </p>
      </div>

      {/* Quizzes grid */}
      {quizzes.length === 0 ? (
        <div
          className="card surface-panel"
          style={{ textAlign: "center", padding: "48px 24px" }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <h3 className="mb-8">Пока здесь пусто</h3>
          <p className="text-secondary mb-16">
            Создайте первый квиз, чтобы собрать свою игровую комнату.
          </p>
          <Link to="/quiz/new" className="btn btn-primary">
            Создать квиз
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}
        >
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="flex items-center justify-between">
                <span className="badge badge-primary">{q.category}</span>
                <span className="text-sm text-secondary">
                  {q.questionCount} вопр.
                </span>
              </div>
              <div>
                <h3 style={{ marginBottom: 4 }}>{q.title}</h3>
                {q.description && (
                  <p
                    className="text-secondary text-sm"
                    style={{
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {q.description}
                  </p>
                )}
              </div>
              <div className="text-sm text-secondary">
                ⏱ {q.time_per_question}с на вопрос
              </div>
              <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => launchQuiz(q.id)}
                  disabled={creating === q.id || q.questionCount === 0}
                  title={q.questionCount === 0 ? "Добавьте вопросы" : ""}
                  style={{ flex: 1 }}
                >
                  {creating === q.id ? "..." : "▶ Запустить"}
                </button>
                <Link
                  to={`/quiz/${q.id}/edit`}
                  className="btn btn-secondary btn-sm"
                >
                  Изменить
                </Link>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => deleteQuiz(q.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hosted rooms history */}
      {hostedRooms.length > 0 && (
        <div className="mb-24">
          <div className="section-heading mb-16">
            <h2>История проведённых квизов</h2>
            <p className="text-secondary">
              Недавние комнаты, статус и код для быстрого доступа.
            </p>
          </div>
          <div
            className="card surface-panel"
            style={{ padding: 0, overflow: "hidden" }}
          >
            {hostedRooms.map((r, i) => (
              <div
                key={r.code}
                style={{
                  padding: "14px 20px",
                  borderBottom:
                    i < hostedRooms.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="fw-600">{r.quiz_title}</span>
                  <span
                    className="text-secondary text-sm"
                    style={{ marginLeft: 8 }}
                  >
                    {r.category}
                  </span>
                </div>
                <span className="text-secondary text-sm">
                  {r.participant_count} участн.
                </span>
                <span className={`badge ${statusBadge[r.status]}`}>
                  {statusLabel[r.status]}
                </span>
                <span
                  className="text-secondary text-sm"
                  style={{ fontFamily: "monospace" }}
                >
                  {r.code}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participated rooms history */}
      {participatedRooms.length > 0 && (
        <div>
          <div className="section-heading mb-16">
            <h2>История участия</h2>
            <p className="text-secondary">
              Сохранённые результаты и начисленные очки.
            </p>
          </div>
          <div
            className="card surface-panel"
            style={{ padding: 0, overflow: "hidden" }}
          >
            {participatedRooms.map((r, i) => (
              <div
                key={`${r.code}-${i}`}
                style={{
                  padding: "14px 20px",
                  borderBottom:
                    i < participatedRooms.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <span className="fw-600">{r.quiz_title}</span>
                  <span
                    className="text-secondary text-sm"
                    style={{ marginLeft: 8 }}
                  >
                    {r.category}
                  </span>
                </div>
                <span className="fw-600 text-primary">{r.score} очков</span>
                <span className={`badge ${statusBadge[r.status]}`}>
                  {statusLabel[r.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
