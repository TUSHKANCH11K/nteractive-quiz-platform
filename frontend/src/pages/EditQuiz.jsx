import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import CreateQuiz from './CreateQuiz.jsx';

export default function EditQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`/api/quizzes/${id}`)
      .then(r => setQuiz(r.data))
      .catch(err => setError(err.response?.data?.error || 'Квиз не найден'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (error) return (
    <div className="page">
      <div className="alert alert-error">{error}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>← Назад</button>
    </div>
  );

  return (
    <CreateQuiz
      initialData={quiz}
      quizId={id}
      onSaved={() => navigate('/dashboard')}
    />
  );
}
