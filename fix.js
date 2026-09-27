const fs = require('fs');

const content = `import AsyncStorage from '@react-native-async-storage/async-storage';

export function getExamStorageKey(userId: string | null | undefined): string {
  if (userId) return \`nkotanyi.examHistory.\${userId}.v1\`;
  return 'nkotanyi.examHistory.guest.v1';
}

const MAX_RECORDS = 50;

export type LocalExamAnswerDetail = {
  questionId: string;
  questionText: string;
  questionImageUrls?: string[];
  options?: Array<{
    id: string;
    text: string;
    imageUrl?: string | null;
    isCorrect: boolean;
  }>;
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  correctOptionId: string | null;
  correctOptionText: string | null;
  explanation?: string | null;
  isCorrect: boolean;
};

export type LocalExamRecord = {
  id: string;
  correct: number;
  total: number;
  percent: number;
  timeLabel: string;
  mode: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  elapsedSec?: number;
  answeredCount?: number;
  answers?: LocalExamAnswerDetail[];
};

export async function readLocalExamRecords(userId: string | null | undefined): Promise<LocalExamRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(getExamStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalExamRecord[]) : [];
  } catch {
    return [];
  }
}

export async function appendLocalExamRecord(
  entry: Omit<LocalExamRecord, 'id' | 'createdAt'>,
  userId: string | null | undefined,
): Promise<void> {
  const prev = await readLocalExamRecords(userId);
  const record: LocalExamRecord = {
    ...entry,
    id: \`local_\${Date.now()}_\${Math.random().toString(36).slice(2, 9)}\`,
    createdAt: new Date().toISOString(),
  };
  const next = [record, ...prev].slice(0, MAX_RECORDS);
  await AsyncStorage.setItem(getExamStorageKey(userId), JSON.stringify(next));
}
`;

fs.writeFileSync('services/examHistoryStorage.ts', content);
