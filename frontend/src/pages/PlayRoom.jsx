import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import socket from '../socket.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import Timer from '../components/Timer.jsx';

const OPTION_COLORS = ['#FF5252', '#4CAF50', '#2196F3', '#FF9800'];

// Phases: lobby | question | answered | question_end | leaderboard | finished
export default function PlayRoom() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const codeUpper = code.toUpperCase();
  const usernameFromState = location.state?.username || '';

  const [phase, setPhase] = useState('lobby');
  const [participants, setParticipants] = useState([]);
  const [quizInfo, setQuizInfo] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [myUsername, setMyUsername] = useState('');
  const [questionData, setQuestionData] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [answerResult, setAnswerResult] = useState(null); // { isCorrect, points, correctIds }
  const [questionEndData, setQuestionEndData] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [isLastQuestion, setIsLastQuestion] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(true);
  const [timerKey, setTimerKey] = useState(0);
  const answeredRef = useRef(false);

  // Username prompt if not provided
  const [usernameInput, setUsernameInput] = useState(usernameFromState || (user?.username || ''));
  const [joinPhase, setJoinPhase] = useState(!!usernameFromState || !!user ? 'connecting' : 'name');

  useEffect(() => {
    if (joinPhase !== 'connecting') return;

    if (!socket.connected) socket.connect();

    socket.emit('room:join', {
      code: codeUpper,
      username: usernameInput,
      token: token || null,
    });

    socket.on('room:joined', ({ room, participantId: pid, username: uname, participants: ps }) => {
      setParticipantId(pid);
      setMyUsername(uname);
      setParticipants(ps);
      setConnecting(false);
      if (room.status === 'active') setPhase('question');
      else if (room.status === 'finished') setPhase('finished');
      else setPhase('lobby');
    });

    socket.on('room:participant_joined', ({ participants: ps }) => setParticipants(ps));

    socket.on('quiz:started', () => {
      setPhase('lobby_started');
      setTimeout(() => setPhase('waiting_question'), 1200);
    });

    socket.on('quiz:question', ({ question, index, total, timeLeft, timeLimit }) => {
      setQuestionData({ question, index, total, timeLeft, timeLimit });
      setSelectedIds([]);
      setAnswerResult(null);
      setQuestionEndData(null);
      answeredRef.current = false;
      setTimerKey(k => k + 1);
      setPhase('question');
    });

    socket.on('quiz:answer_result', ({ isCorrect, points, correctIds }) => {
      setAnswerResult({ isCorrect, points, correctIds });
      setPhase('answered');
    });

    socket.on('quiz:question_end', ({ correctIds, answerCounts }) => {
      setQuestionEndData({ correctIds, answerCounts });
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

    socket.on('error', ({ message }) => {
      setError(message);
      setConnecting(false);
    });

    return () => {
      socket.off('room:joined');
      socket.off('room:participant_joined');
      socket.off('quiz:started');
      socket.off('quiz:question');
      socket.off('quiz:answer_result');
      socket.off('quiz:question_end');
      socket.off('quiz:leaderboard');
      socket.off('quiz:finished');
      socket.off('error');
      socket.disconnect();
    };
  }, [joinPhase]);

  const toggleOption = (optId) => {
    if (answeredRef.current || phase !== 'question') return;
    const q = questionData.question;
    if (q.type === 'single') {
      setSelectedIds([optId]);
    } else {
      setSelectedIds(ids =>
        ids.includes(optId) ? ids.filter(id => id !== optId) : [...ids, optId]
      );
    }
  };

  const submitAnswer = () => {
    if (answeredRef.current || selectedIds.length === 0) return;
    answeredRef.current = true;
    socket.emit('quiz:answer', {
      code: codeUpper,
      participantId,
      optionIds: selectedIds,
    });
  };

  // Auto-submit for single-choice questions after a short visual delay
  useEffect(() => {
    if (phase !== 'question' || !questionData || questionData.question.type !== 'single') return;
    if (selectedIds.length === 0 || answeredRef.current) return;
    const t = setTimeout(submitAnswer, 400);
    return () => clearTimeout(t);
  }, [selectedIds, phase]);

  // ── Name input ──────────────────────────────────────────────────────────
  if (joinPhase === 'name') return (
    <div className="page-center">
      <div style={{ width: '100%', maxWidth: 400, padding: '0 16px' }}>
        <div className="card card-lg">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
            <h2>Как вас зовут?</h2>
            <p className="text-secondary mt-8">Код: <strong>{codeUpper}</strong></p>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <input
              className="input"
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              placeholder="Введите имя"
              maxLength={30}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && usernameInput.trim().length >= 2 && setJoinPhase('connecting')}
            />
          </div>
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => setJoinPhase('connecting')}
            disabled={usernameInput.trim().length < 2}
          >
            Войти
          </button>
        </div>
      </div>
    </div>
  );

  // ── Connecting ──────────────────────────────────────────────────────────
  if (connecting && !error) return (
    <div className="loading-center">
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p className="text-secondary">Подключаемся к комнате {codeUpper}...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="page-center">
      <div style={{ textAlign: 'center' }}>
        <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/join')}>← Попробовать снова</button>
      </div>
    </div>
  );

  // ── Lobby ───────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div className="page" style={{ maxWidth: 600 }}>
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h2 className="mb-8">Ожидаем начала</h2>
        <p className="text-secondary">Организатор скоро запустит квиз</p>
        <div className="mt-24" style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius)', padding: '12px 24px', display: 'inline-block' }}>
          <span className="text-primary fw-600">Вы: {myUsername}</span>
        </div>
        <div className="mt-16">
          <p className="text-secondary text-sm mb-8">Участники ({participants.length})</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {participants.map(p => (
              <span key={p.id} className="participant-chip" style={p.id === participantId ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}}>
                {p.username} {p.id === participantId ? '(вы)' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (phase === 'lobby_started' || phase === 'waiting_question') return (
    <div className="loading-center">
      <div style={{ textAlign: 'center' }}>
        {phase === 'lobby_started'
          ? <><div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div><h2>Квиз начинается!</h2></>
          : <><div className="spinner" style={{ margin: '0 auto 16px' }} /><p className="text-secondary">Загружаем вопрос...</p></>
        }
      </div>
    </div>
  );

  // ── Question ─────────────────────────────────────────────────────────────
  if ((phase === 'question' || phase === 'answered') && questionData) {
    const { question, index, total, timeLeft, timeLimit } = questionData;

    return (
      <div className="page" style={{ maxWidth: 700 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span className="badge badge-primary">Вопрос {index + 1} / {total}</span>
          {phase === 'question' && (
            <Timer key={timerKey} initialSeconds={timeLeft} onExpire={() => {}} />
          )}
          {phase === 'answered' && answerResult && (
            <div style={{
              padding: '8px 20px', borderRadius: 'var(--radius)',
              background: answerResult.isCorrect ? 'var(--success-light)' : 'var(--danger-light)',
              color: answerResult.isCorrect ? 'var(--success)' : 'var(--danger)',
              fontWeight: 700, fontSize: 18,
            }}>
              {answerResult.isCorrect ? `+${answerResult.points} ✓` : '✗'}
            </div>
          )}
        </div>

        {/* Question card */}
        <div className="card mb-16">
          {question.image_url && (
            <img src={question.image_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 16 }} />
          )}
          <h2 style={{ lineHeight: 1.4 }}>{question.text}</h2>
          {question.type === 'multiple' && (
            <p className="text-secondary text-sm mt-8">Выберите все правильные ответы</p>
          )}
        </div>

        {/* Answer options */}
        <div className="answer-grid" style={{ marginBottom: 16 }}>
          {question.options.map((opt, i) => {
            const isSelected = selectedIds.includes(opt.id);
            const isCorrect = answerResult?.correctIds?.includes(opt.id);
            const wasSelected = isSelected;

            let cls = 'answer-btn';
            if (phase === 'answered') {
              if (isCorrect) cls += ' correct';
              else if (wasSelected && !isCorrect) cls += ' wrong';
            } else if (isSelected) {
              cls += ' selected';
            }

            return (
              <button
                key={opt.id}
                className={cls}
                onClick={() => toggleOption(opt.id)}
                disabled={phase === 'answered'}
                style={{
                  borderLeftColor: OPTION_COLORS[i % OPTION_COLORS.length],
                  borderLeftWidth: 5,
                }}
              >
                {opt.text}
              </button>
            );
          })}
        </div>

        {/* Submit button (multiple choice only; single-choice auto-submits via useEffect) */}
        {phase === 'question' && question.type === 'multiple' && (
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={submitAnswer}
            disabled={selectedIds.length === 0}
          >
            Подтвердить ответ ({selectedIds.length} выбр.)
          </button>
        )}
        {phase === 'question' && question.type === 'single' && selectedIds.length > 0 && (
          <p className="text-center text-secondary text-sm">Отправляем ответ...</p>
        )}

        {phase === 'answered' && (
          <div className="card" style={{ textAlign: 'center', background: answerResult?.isCorrect ? 'var(--success-light)' : 'var(--danger-light)' }}>
            {answerResult?.isCorrect
              ? <><span style={{ fontSize: 24 }}>🎉</span> <strong>Правильно! +{answerResult.points} очков</strong></>
              : <><span style={{ fontSize: 24 }}>😔</span> <strong>Неверно</strong></>
            }
          </div>
        )}
      </div>
    );
  }

  // ── Question end ─────────────────────────────────────────────────────────
  if (phase === 'question_end' && questionData) {
    const { question } = questionData;
    return (
      <div className="page" style={{ maxWidth: 700 }}>
        <div className="card mb-16" style={{ textAlign: 'center' }}>
          <h3>Правильные ответы:</h3>
        </div>
        <div className="answer-grid mb-16">
          {question.options.map((opt, i) => {
            const isCorrect = questionEndData?.correctIds?.includes(opt.id);
            return (
              <div
                key={opt.id}
                className={`answer-btn ${isCorrect ? 'correct' : ''}`}
                style={{ borderLeftWidth: 5, borderLeftColor: OPTION_COLORS[i % OPTION_COLORS.length], cursor: 'default' }}
              >
                {isCorrect ? '✓ ' : ''}{opt.text}
              </div>
            );
          })}
        </div>
        <p className="text-center text-secondary">Показываем таблицу лидеров...</p>
      </div>
    );
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────
  if (phase === 'leaderboard') return (
    <div className="page" style={{ maxWidth: 500 }}>
      <div className="card">
        <Leaderboard entries={leaderboardData} highlightId={participantId} title="Промежуточный результат" />
        <p className="text-center text-secondary mt-16 text-sm">
          {isLastQuestion ? 'Финальный результат...' : 'Следующий вопрос...'}
        </p>
      </div>
    </div>
  );

  // ── Finished ─────────────────────────────────────────────────────────────
  if (phase === 'finished') {
    const myRank = leaderboardData.findIndex(e => e.id === participantId) + 1;
    const myScore = leaderboardData.find(e => e.id === participantId)?.score || 0;

    return (
      <div className="page" style={{ maxWidth: 500 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>
            {myRank === 1 ? '🏆' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎯'}
          </div>
          <h1>Квиз завершён!</h1>
          {myRank > 0 && (
            <div className="mt-16" style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius)', padding: '16px 24px', display: 'inline-block' }}>
              <p className="text-secondary text-sm">Ваш результат</p>
              <p className="fw-700" style={{ fontSize: 24, color: 'var(--primary)' }}>{myScore} очков</p>
              <p className="text-secondary text-sm">{myRank} место из {leaderboardData.length}</p>
            </div>
          )}
        </div>
        <div className="card mb-16">
          <Leaderboard entries={leaderboardData} highlightId={participantId} title="Итоговая таблица" />
        </div>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/join')}>
          Сыграть ещё раз
        </button>
      </div>
    );
  }

  return <div className="loading-center"><div className="spinner" /></div>;
}
