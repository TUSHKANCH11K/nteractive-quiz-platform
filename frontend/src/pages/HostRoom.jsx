import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import Timer from '../components/Timer.jsx';

// Game phases: lobby | question | question_end | leaderboard | finished
export default function HostRoom() {
  const { code } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('lobby');
  const [quiz, setQuiz] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [questionData, setQuestionData] = useState(null);
  const [questionResult, setQuestionResult] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [isLastQuestion, setIsLastQuestion] = useState(false);
  const [answerCounts, setAnswerCounts] = useState({});
  const [answeredCount, setAnsweredCount] = useState(0);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const codeUpper = code.toUpperCase();

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit('room:host', { code: codeUpper, token });

    socket.on('room:host_joined', ({ room, quiz: q, participants: ps }) => {
      setQuiz(q);
      setParticipants(ps);
      setConnected(true);
      if (room.status === 'active') setPhase('question');
      else if (room.status === 'finished') setPhase('finished');
    });

    socket.on('room:participant_joined', ({ participants: ps }) => setParticipants(ps));

    socket.on('quiz:started', () => {
      setPhase('question');
      setAnswerCounts({});
      setAnsweredCount(0);
    });

    socket.on('quiz:question', ({ question, index, total, timeLeft, timeLimit, answerCounts: ac, answeredCount: acount }) => {
      setQuestionData({ question, index, total, timeLeft, timeLimit });
      setAnswerCounts(ac || {});
      setAnsweredCount(acount || 0);
      setQuestionResult(null);
      setPhase('question');
    });

    socket.on('quiz:answer_count', ({ counts, answeredCount: ac }) => {
      setAnswerCounts(counts);
      setAnsweredCount(ac);
    });

    socket.on('quiz:question_end', ({ correctIds, answerCounts: ac, answeredCount: acount }) => {
      setQuestionResult({ correctIds });
      setAnswerCounts(ac);
      setAnsweredCount(acount);
      setPhase('question_end');
    });

    socket.on('quiz:leaderboard', ({ leaderboard, isLast }) => {
      setLeaderboardData(leaderboard);
      setIsLastQuestion(isLast);
      setPhase('leaderboard');
    });

    socket.on('quiz:finished', ({ leaderboard }) => {
      setLeaderboardData(leaderboard);
      setPhase('finished');
    });

    socket.on('error', ({ message }) => setError(message));

    return () => {
      socket.off('room:host_joined');
      socket.off('room:participant_joined');
      socket.off('quiz:started');
      socket.off('quiz:question');
      socket.off('quiz:answer_count');
      socket.off('quiz:question_end');
      socket.off('quiz:leaderboard');
      socket.off('quiz:finished');
      socket.off('error');
      socket.disconnect();
    };
  }, []);

  const startQuiz = () => socket.emit('quiz:start', { code: codeUpper, token });
  const nextQuestion = () => socket.emit('quiz:next', { code: codeUpper, token });

  const shareUrl = `${window.location.origin}/join?code=${codeUpper}`;

  // ── Lobby ──────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div className="page" style={{ maxWidth: 680 }}>
      {error && <div className="alert alert-error mb-16">{error}</div>}
      <div className="card mb-16" style={{ textAlign: 'center', padding: '32px 24px' }}>
        <p className="text-secondary mb-8">Код комнаты</p>
        <div className="room-code mb-16">{codeUpper}</div>
        <p className="text-secondary text-sm mb-16">
          Участники заходят на <strong>{window.location.origin}/join</strong> и вводят этот код
        </p>
        <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(shareUrl); }}>
          📋 Копировать ссылку
        </button>
      </div>

      {quiz && (
        <div className="card mb-16">
          <div className="flex items-center gap-12">
            <div>
              <h3>{quiz.title}</h3>
              <p className="text-secondary text-sm">{quiz.category} · {quiz.time_per_question}с на вопрос</p>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-24">
        <div className="flex items-center justify-between mb-12">
          <h3>Участники</h3>
          <span className="badge badge-primary">{participants.length}</span>
        </div>
        {participants.length === 0 ? (
          <p className="text-secondary text-sm">Ожидаем участников...</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {participants.map(p => (
              <span key={p.id} className="participant-chip">👤 {p.username}</span>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn btn-primary btn-block btn-lg"
        onClick={startQuiz}
        disabled={participants.length === 0 || !connected}
      >
        {!connected ? 'Подключаемся...' : participants.length === 0 ? 'Ждём участников...' : `▶ Начать квиз (${participants.length} участн.)`}
      </button>
    </div>
  );

  // ── Question (host view) ────────────────────────────────────────────────
  if (phase === 'question' && questionData) {
    const { question, index, total, timeLeft, timeLimit } = questionData;
    const totalAnswers = Object.values(answerCounts).reduce((a, b) => a + b, 0);

    return (
      <div className="page" style={{ maxWidth: 800 }}>
        <div className="flex items-center justify-between mb-16">
          <div>
            <span className="badge badge-primary">Вопрос {index + 1} / {total}</span>
            <span className="text-secondary text-sm" style={{ marginLeft: 12 }}>
              Ответили: {answeredCount} / {participants.length}
            </span>
          </div>
          <Timer key={`timer-${index}`} initialSeconds={timeLeft} onExpire={() => {}} />
        </div>

        <div className="card mb-16">
          {question.image_url && (
            <img src={question.image_url} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, marginBottom: 16 }} />
          )}
          <h2 style={{ marginBottom: 4 }}>{question.text}</h2>
          <p className="text-secondary text-sm">{question.type === 'multiple' ? 'Несколько правильных ответов' : 'Один правильный ответ'}</p>
        </div>

        {/* Live answer bars */}
        <div className="card mb-16">
          <h4 className="mb-12">Ответы участников</h4>
          {question.options.map((opt, i) => {
            const count = answerCounts[opt.id] || 0;
            const pct = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
            return (
              <div key={opt.id} style={{ marginBottom: 10 }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm">{opt.text}</span>
                  <span className="text-sm fw-600">{count}</span>
                </div>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <button className="btn btn-primary btn-block btn-lg" onClick={nextQuestion}>
          Завершить вопрос →
        </button>
      </div>
    );
  }

  // ── Question end (show correct) ─────────────────────────────────────────
  if (phase === 'question_end' && questionData) {
    const { question } = questionData;
    const totalAnswers = Object.values(answerCounts).reduce((a, b) => a + b, 0);

    return (
      <div className="page" style={{ maxWidth: 800 }}>
        <div className="card mb-16" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <h2>Правильные ответы</h2>
        </div>

        <div className="card mb-16">
          <h3 className="mb-16">{questionData.question.text}</h3>
          {question.options.map((opt, i) => {
            const correct = questionResult?.correctIds?.includes(opt.id);
            const count = answerCounts[opt.id] || 0;
            const pct = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
            return (
              <div key={opt.id} style={{ marginBottom: 10 }}>
                <div className="flex items-center justify-between mb-4">
                  <span style={{ fontWeight: correct ? 700 : 400, color: correct ? 'var(--success)' : 'var(--text)' }}>
                    {correct ? '✓ ' : ''}{opt.text}
                  </span>
                  <span className="text-sm fw-600">{count} ({pct}%)</span>
                </div>
                <div className="progress">
                  <div className={`progress-bar ${correct ? 'progress-bar-success' : ''}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-center text-secondary">Показываем таблицу лидеров...</p>
      </div>
    );
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────
  if (phase === 'leaderboard') return (
    <div className="page" style={{ maxWidth: 600 }}>
      <div className="card">
        <Leaderboard entries={leaderboardData} title="Промежуточный результат" />
        <p className="text-center text-secondary mt-16 text-sm">
          {isLastQuestion ? 'Финальный результат...' : 'Следующий вопрос...'}
        </p>
      </div>
    </div>
  );

  // ── Finished ────────────────────────────────────────────────────────────
  if (phase === 'finished') return (
    <div className="page" style={{ maxWidth: 600 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>
        <h1>Квиз завершён!</h1>
        <p className="text-secondary mt-8">Итоговые результаты</p>
      </div>
      <div className="card mb-16">
        <Leaderboard entries={leaderboardData} title="Итоговая таблица лидеров" />
      </div>
      <button className="btn btn-primary btn-block" onClick={() => navigate('/dashboard')}>
        На главную
      </button>
    </div>
  );

  return (
    <div className="loading-center">
      {error ? <div className="alert alert-error">{error}</div> : <div className="spinner" />}
    </div>
  );
}
