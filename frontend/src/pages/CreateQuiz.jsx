import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const CATEGORIES = ['Общее', 'Технологии', 'Наука', 'История', 'География', 'Спорт', 'Культура', 'Кино и TV'];

function emptyQuestion() {
  return {
    text: '',
    image_url: '',
    type: 'single',
    options: [
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  };
}

export default function CreateQuiz({ initialData, quizId, onSaved }) {
  const navigate = useNavigate();
  const isEdit = !!quizId;

  const [meta, setMeta] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    category: initialData?.category || 'Общее',
    time_per_question: initialData?.time_per_question || 30,
  });
  const [questions, setQuestions] = useState(
    initialData?.questions?.length ? initialData.questions.map(q => ({
      text: q.text,
      image_url: q.image_url || '',
      type: q.type,
      options: q.options.map(o => ({ text: o.text, is_correct: !!o.is_correct })),
    })) : [emptyQuestion()]
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setMeta_ = k => e => setMeta(m => ({ ...m, [k]: e.target.value }));

  const setQ = (qi, k, v) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, [k]: v } : q));
  const setOpt = (qi, oi, k, v) => setQuestions(qs =>
    qs.map((q, i) => i !== qi ? q : {
      ...q,
      options: q.options.map((o, j) => j !== oi ? o : { ...o, [k]: v }),
    })
  );

  const toggleCorrect = (qi, oi) => {
    const q = questions[qi];
    if (q.type === 'single') {
      setQuestions(qs => qs.map((qq, i) => i !== qi ? qq : {
        ...qq,
        options: qq.options.map((o, j) => ({ ...o, is_correct: j === oi })),
      }));
    } else {
      setOpt(qi, oi, 'is_correct', !q.options[oi].is_correct);
    }
  };

  const addOption = qi => {
    if (questions[qi].options.length >= 6) return;
    setQuestions(qs => qs.map((q, i) => i !== qi ? q : {
      ...q, options: [...q.options, { text: '', is_correct: false }]
    }));
  };

  const removeOption = (qi, oi) => {
    if (questions[qi].options.length <= 2) return;
    setQuestions(qs => qs.map((q, i) => i !== qi ? q : {
      ...q, options: q.options.filter((_, j) => j !== oi)
    }));
  };

  const addQuestion = () => setQuestions(qs => [...qs, emptyQuestion()]);
  const removeQuestion = qi => {
    if (questions.length <= 1) return;
    setQuestions(qs => qs.filter((_, i) => i !== qi));
  };
  const moveQuestion = (qi, dir) => {
    const nq = [...questions];
    const target = qi + dir;
    if (target < 0 || target >= nq.length) return;
    [nq[qi], nq[target]] = [nq[target], nq[qi]];
    setQuestions(nq);
  };

  const validate = () => {
    if (!meta.title.trim()) return 'Укажите название квиза';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) return `Вопрос ${i + 1}: введите текст вопроса`;
      const filled = q.options.filter(o => o.text.trim());
      if (filled.length < 2) return `Вопрос ${i + 1}: нужно минимум 2 варианта ответа`;
      const correct = q.options.filter(o => o.is_correct && o.text.trim());
      if (correct.length === 0) return `Вопрос ${i + 1}: отметьте правильный ответ`;
    }
    return null;
  };

  const submit = async e => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);

    const payload = {
      ...meta,
      time_per_question: Number(meta.time_per_question),
      questions: questions.map(q => ({
        ...q,
        image_url: q.image_url.trim() || null,
        options: q.options.filter(o => o.text.trim()),
      })),
    };

    try {
      if (isEdit) {
        await axios.put(`/api/quizzes/${quizId}`, payload);
        onSaved && onSaved();
      } else {
        const r = await axios.post('/api/quizzes', payload);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const optColors = ['#FF5252', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4'];

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <div className="flex items-center justify-between mb-24">
        <h1>{isEdit ? 'Редактировать квиз' : 'Новый квиз'}</h1>
        <button onClick={() => navigate('/dashboard')} className="btn btn-ghost">← Назад</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={submit}>
        {/* Meta */}
        <div className="card mb-16">
          <h3 className="mb-16">Настройки квиза</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Название квиза *</label>
              <input className="input" value={meta.title} onChange={setMeta_('title')} placeholder="Введите название" maxLength={100} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Описание</label>
              <textarea className="input" value={meta.description} onChange={setMeta_('description')} placeholder="Краткое описание (необязательно)" rows={2} maxLength={300} />
            </div>
            <div className="form-group">
              <label>Категория</label>
              <select className="input" value={meta.category} onChange={setMeta_('category')}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Время на вопрос (секунды)</label>
              <input className="input" type="number" min={5} max={120} value={meta.time_per_question} onChange={setMeta_('time_per_question')} />
            </div>
          </div>
        </div>

        {/* Questions */}
        {questions.map((q, qi) => (
          <div key={qi} className="card mb-16" style={{ borderTop: `4px solid ${optColors[qi % optColors.length]}` }}>
            <div className="flex items-center justify-between mb-16">
              <h4>Вопрос {qi + 1}</h4>
              <div className="flex gap-8">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}>↑</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveQuestion(qi, 1)} disabled={qi === questions.length - 1}>↓</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeQuestion(qi)} disabled={questions.length === 1} style={{ color: 'var(--danger)' }}>✕</button>
              </div>
            </div>

            <div className="form-group">
              <label>Текст вопроса *</label>
              <textarea className="input" value={q.text} onChange={e => setQ(qi, 'text', e.target.value)} placeholder="Введите вопрос..." rows={2} maxLength={500} />
            </div>

            <div className="form-group">
              <label>URL изображения <span className="text-secondary">(необязательно)</span></label>
              <input className="input" value={q.image_url} onChange={e => setQ(qi, 'image_url', e.target.value)} placeholder="https://..." />
              {q.image_url && (
                <img src={q.image_url} alt="preview" style={{ maxHeight: 120, borderRadius: 8, marginTop: 8, objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
              )}
            </div>

            <div className="form-group">
              <label>Тип вопроса</label>
              <select className="input" value={q.type} onChange={e => setQ(qi, 'type', e.target.value)} style={{ maxWidth: 240 }}>
                <option value="single">Один правильный ответ</option>
                <option value="multiple">Несколько правильных ответов</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, display: 'block' }}>
                Варианты ответов *
                <span className="text-secondary text-sm" style={{ marginLeft: 8, fontWeight: 400 }}>
                  {q.type === 'single' ? '(выберите один правильный)' : '(выберите все правильные)'}
                </span>
              </label>
              {q.options.map((opt, oi) => (
                <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: q.type === 'single' ? '50%' : 6,
                      border: `2.5px solid ${opt.is_correct ? 'var(--success)' : 'var(--border)'}`,
                      background: opt.is_correct ? 'var(--success)' : 'transparent',
                      cursor: 'pointer', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onClick={() => toggleCorrect(qi, oi)}
                  >
                    {opt.is_correct && <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>✓</span>}
                  </div>
                  <input
                    className="input"
                    value={opt.text}
                    onChange={e => setOpt(qi, oi, 'text', e.target.value)}
                    placeholder={`Вариант ${oi + 1}`}
                    maxLength={200}
                  />
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => removeOption(qi, oi)} disabled={q.options.length <= 2} style={{ flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {q.options.length < 6 && (
                <button type="button" className="btn btn-secondary btn-sm mt-8" onClick={() => addOption(qi)}>
                  + Добавить вариант
                </button>
              )}
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-outline btn-block mb-24" onClick={addQuestion}>
          + Добавить вопрос
        </button>

        <div className="flex gap-12" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Отмена</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? 'Сохраняем...' : (isEdit ? 'Сохранить изменения' : `Создать квиз (${questions.length} вопр.)`)}
          </button>
        </div>
      </form>
    </div>
  );
}
