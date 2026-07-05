import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div style={{ width: "100%", maxWidth: 420, padding: "0 16px" }}>
        <div className="card card-lg surface-panel">
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 56,
                height: 56,
                background: "#0077FF",
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 18,
                fontWeight: 800,
                color: "#fff",
              }}
            >
              VK
            </div>
            <span className="badge badge-primary mb-16">VK Quiz Arena</span>
            <h1 style={{ fontSize: 24 }}>Создать аккаунт</h1>
            <p className="text-secondary mt-8">
              Регистрация нужна, чтобы сохранять квизы и результаты.
            </p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={submit}>
            <div className="form-group">
              <label>Имя пользователя</label>
              <input
                className="input"
                type="text"
                value={form.username}
                onChange={set("username")}
                placeholder="nickname"
                required
                minLength={2}
                maxLength={30}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Пароль</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder="Минимум 6 символов"
                required
                minLength={6}
              />
            </div>
            <button
              className="btn btn-primary btn-block btn-lg"
              type="submit"
              disabled={loading}
            >
              {loading ? "Создаём..." : "Зарегистрироваться"}
            </button>
          </form>

          <p className="text-center mt-16 text-secondary text-sm">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
