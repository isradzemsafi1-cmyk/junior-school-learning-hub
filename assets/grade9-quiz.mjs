export function gradeQuiz(questions, selectedAnswers) {
  let score = 0;
  let answered = 0;
  const feedback = questions.map((question, index) => {
    const selected = selectedAnswers[index];
    const answerIndex = Number(question.a ?? question.answerIndex);
    const explanation = question.e || question.explanation || '';
    if (selected === null || selected === undefined || selected === '') return `Not answered.${explanation ? ` ${explanation}` : ''}`;
    answered++;
    if (Number(selected) === answerIndex) {
      score++;
      return `Correct.${explanation ? ` ${explanation}` : ''}`;
    }
    return `Review: ${explanation || 'Check the notes and try again.'}`;
  });
  return { score, total: questions.length, answered, percentage: questions.length ? Math.round(score / questions.length * 100) : 0, feedback };
}

export async function saveQuizAttempt(client, { userId, term, topic, questions, selectedAnswers, result }) {
  return client.from('learner_quiz_attempts').insert({
    user_id: userId,
    grade: 'Grade 9',
    subject: 'Mathematics',
    score: result.score,
    total: result.total,
    percentage: result.percentage,
    answered: result.answered,
    answers: questions.map((question, index) => ({
      question: question.q || question.question,
      selected: selectedAnswers[index] ?? null,
      correct: Number(question.a ?? question.answerIndex),
      topic,
      term
    }))
  });
}
