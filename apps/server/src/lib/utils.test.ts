import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateQuizScore } from './utils'
import type { AnswerSubmission, QuizQuestion } from '@eduverse/shared'

const questions = [
  {
    id: 'single', type: 'single_choice', text: 'Single', points: 2,
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B', isCorrect: true }],
  },
  {
    id: 'multiple', type: 'multiple_choice', text: 'Multiple', points: 3,
    correctAnswer: ['a', 'c'], options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }],
  },
  { id: 'short', type: 'short_answer', text: 'Short', points: 1, correctAnswer: '  EduVerse  ' },
  { id: 'unset', type: 'single_choice', text: 'No answer', points: 4, options: [{ id: 'a', text: 'A' }] },
] as unknown as QuizQuestion[]

test('scores all supported answer forms without granting unanswered questions', () => {
  const answers = [
    { questionId: 'single', selectedOptionIds: ['b'] },
    { questionId: 'multiple', selectedOptionIds: ['c', 'a'] },
    { questionId: 'short', textAnswer: 'eduverse' },
    { questionId: 'unset', selectedOptionIds: ['a'] },
  ] as AnswerSubmission[]
  assert.deepEqual(calculateQuizScore(answers, questions), {
    rawScore: 6,
    totalPoints: 10,
    correctCount: 3,
    totalQuestions: 4,
    percentage: 60,
  })
})

test('multiple choice requires the exact option set', () => {
  const result = calculateQuizScore([
    { questionId: 'multiple', selectedOptionIds: ['a', 'b', 'c'] },
  ] as AnswerSubmission[], questions)
  assert.equal(result.correctCount, 0)
  assert.equal(result.rawScore, 0)
  assert.equal(result.percentage, 0)
})
