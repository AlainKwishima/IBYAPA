import type { LocalExamRecord } from './examHistoryStorage';
import type { ExamAnswerDetail } from '../navigation/types';

export type PerformanceHistoryRow = {
  id: string;
  title: string;
  date: string;
  status: 'PASSED' | 'FAILED';
  answers: string;
  duration: string;
  sortKey: number;
  /** Optional detail for modal */
  percent: number;
  correct: number;
  total: number;
  answeredCount?: number;
  startedAt?: string;
  finishedAt?: string;
  elapsedSec?: number;
  answerDetails?: ExamAnswerDetail[];
};

function parseTime(isoLike: string): number {
  const t = Date.parse(isoLike);
  return Number.isFinite(t) ? t : 0;
}

function mapExamTitleKey(examTypeRaw: string): string {
  const examType = examTypeRaw.trim().toLowerCase();
  if (!examType) return 'performance.theoryExam';
  if (examType.includes('sign')) return 'performance.signsExam';
  if (examType.includes('traffic') || examType.includes('road')) return 'performance.trafficExam';
  return 'performance.theoryExam';
}

/** Best-effort map for `GET /api/performance/all` items (schema not documented). */
export function mapServerPerformanceEntry(raw: unknown, index: number): PerformanceHistoryRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o._id ?? o.id ?? `srv_${index}`);
  const createdRaw = o.createdAt ?? o.updatedAt ?? o.date ?? o.examDate;
  const createdAt = typeof createdRaw === 'string' ? createdRaw : new Date().toISOString();
  const startedAt = typeof o.startedAt === 'string' ? o.startedAt : undefined;
  const finishedAt = typeof o.finishedAt === 'string' ? o.finishedAt : undefined;
  const rawCorrect = o.correctAnswers ?? o.correct ?? o.score ?? o.obtainedMarks ?? o.marksObtained;
  const parsedCorrect = rawCorrect == null ? Number.NaN : Number(rawCorrect);
  const total = Number(o.totalQuestions ?? o.total ?? o.outOf ?? o.maxQuestions ?? 20) || 20;
  // The mobile client sends the documented `marks` field as a percentage.
  // Keep that value when the backend response does not also include correct answers.
  const marks = Number(o.marks);
  const percentRaw = o.percentage ?? o.percent ?? o.scorePercent ?? (Number.isFinite(marks) ? marks : undefined);
  const percent =
    typeof percentRaw === 'number' && Number.isFinite(percentRaw)
      ? Math.round(percentRaw)
      : Number.isFinite(Number(percentRaw))
        ? Math.round(Number(percentRaw))
        : Number.isFinite(parsedCorrect)
          ? Math.round((parsedCorrect / Math.max(total, 1)) * 100)
          : 0;
  const correct = Number.isFinite(parsedCorrect) ? parsedCorrect : Math.round((percent / 100) * total);
  const passed = Boolean(o.passed ?? o.isPassed ?? percent >= 60);
  const durationMin = o.durationMinutes ?? o.durationInMinutes ?? o.duration;
  const duration =
    typeof durationMin === 'number' && durationMin > 0
      ? `${Math.round(durationMin)} min`
      : typeof o.duration === 'string' && o.duration.trim()
        ? String(o.duration)
      : typeof o.timeSpent === 'string'
        ? o.timeSpent
        : typeof o.durationLabel === 'string'
          ? o.durationLabel
          : '—';
  const examType =
    typeof o.examType === 'string'
      ? o.examType
      : typeof o.examName === 'string'
        ? o.examName
        : typeof o.type === 'string'
          ? o.type
          : '';
  const title = mapExamTitleKey(examType);

  return {
    id,
    title,
    date: createdAt,
    status: passed ? 'PASSED' : 'FAILED',
    answers: `${correct}/${total}`,
    duration,
    sortKey: parseTime(createdAt),
    percent,
    correct,
    total,
    answeredCount: typeof o.answeredCount === 'number' ? o.answeredCount : undefined,
    startedAt,
    finishedAt,
    elapsedSec: typeof o.elapsedSec === 'number' ? o.elapsedSec : typeof o.elapsedSeconds === 'number' ? o.elapsedSeconds : undefined,
    answerDetails: Array.isArray(o.answers)
      ? o.answers
          .filter((a) => a && typeof a === 'object')
          .map((a) => {
            const r = a as Record<string, unknown>;
            return {
              questionId: String(r.questionId ?? r._id ?? r.id ?? ''),
              questionText: String(r.questionText ?? r.question ?? ''),
              questionImageUrls: Array.isArray(r.questionImageUrls)
                ? r.questionImageUrls.filter((url): url is string => typeof url === 'string')
                : Array.isArray(r.imageURLs)
                  ? r.imageURLs.filter((url): url is string => typeof url === 'string')
                  : undefined,
              options: Array.isArray(r.options)
                ? r.options
                    .filter((option) => option && typeof option === 'object')
                    .map((option) => {
                      const o = option as Record<string, unknown>;
                      return {
                        id: String(o.id ?? o._id ?? ''),
                        text: String(o.text ?? o.optionText ?? ''),
                        imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : typeof o.optionImageURL === 'string' ? o.optionImageURL : null,
                        isCorrect: Boolean(o.isCorrect ?? o.is_correct),
                      };
                    })
                    .filter((option) => option.id || option.text)
                : undefined,
              selectedOptionId: typeof r.selectedOptionId === 'string' ? r.selectedOptionId : null,
              selectedOptionText: typeof r.selectedOptionText === 'string' ? r.selectedOptionText : null,
              correctOptionId: typeof r.correctOptionId === 'string' ? r.correctOptionId : null,
              correctOptionText: typeof r.correctOptionText === 'string' ? r.correctOptionText : null,
              explanation:
                typeof r.explanation === 'string'
                  ? r.explanation
                  : typeof r.feedback === 'string'
                    ? r.feedback
                    : null,
              isCorrect: Boolean(r.isCorrect),
            };
          })
      : undefined,
  };
}

export function mapLocalExamRecord(r: LocalExamRecord): PerformanceHistoryRow {
  const passed = r.percent >= 60;
  return {
    id: r.id,
    title: r.mode === 'signs' ? 'performance.signsExam' : 'performance.theoryExam',
    date: r.finishedAt ?? r.createdAt,
    status: passed ? 'PASSED' : 'FAILED',
    answers: `${r.correct}/${r.total}`,
    duration: r.timeLabel,
    sortKey: parseTime(r.finishedAt ?? r.createdAt),
    percent: r.percent,
    correct: r.correct,
    total: r.total,
    answeredCount: r.answeredCount,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    elapsedSec: r.elapsedSec,
    answerDetails: r.answers?.map((a) => ({
      questionId: a.questionId,
      questionText: a.questionText,
      questionImageUrls: a.questionImageUrls,
      options: a.options,
      selectedOptionId: a.selectedOptionId,
      selectedOptionText: a.selectedOptionText,
      correctOptionId: a.correctOptionId,
      correctOptionText: a.correctOptionText,
      explanation: a.explanation,
      isCorrect: a.isCorrect,
    })),
  };
}

export function mergePerformanceHistory(server: unknown[], local: LocalExamRecord[]): PerformanceHistoryRow[] {
  const fromServer = server.map((x, i) => mapServerPerformanceEntry(x, i)).filter(Boolean) as PerformanceHistoryRow[];
  const fromLocal = local.map(mapLocalExamRecord);
  const serverIds = new Set(fromServer.map((row) => row.id));
  const merged = [...fromServer];

  for (const row of fromLocal) {
    const sameServerIndex = merged.findIndex(
      (existing) =>
        serverIds.has(existing.id) &&
        existing.title === row.title &&
        existing.percent === row.percent &&
        existing.sortKey > 0 &&
        row.sortKey > 0 &&
        Math.abs(existing.sortKey - row.sortKey) <= 2 * 60 * 1000,
    );

    if (sameServerIndex >= 0) {
      // Keep the local copy because it contains the complete answer review.
      if ((row.answerDetails?.length ?? 0) > (merged[sameServerIndex].answerDetails?.length ?? 0)) {
        merged[sameServerIndex] = row;
      }
      continue;
    }

    merged.push(row);
  }

  return merged.sort((a, b) => b.sortKey - a.sortKey);
}
