export interface WaveForecastPoint {
  time: string;
  heightM: number;
  quality: '좋음' | '보통' | '주의';
}

export interface SurfBreakBriefing {
  id: string;
  name: string;
  region: string;
  nowHeightM: number;
  periodSeconds: number;
  wind: string;
  waterTemperatureC: number;
  tide: string;
  bestWindow: string;
  note: string;
  forecast: WaveForecastPoint[];
}

export const SURF_BREAK_BRIEFINGS: SurfBreakBriefing[] = [
  {
    id: 'yangyang-jukdo',
    name: '죽도해변',
    region: '강원 양양',
    nowHeightM: 1.1,
    periodSeconds: 9,
    wind: '서 2m/s',
    waterTemperatureC: 24,
    tide: '10:42 만조',
    bestWindow: '06:00–09:00',
    note: '오전 약한 오프쇼어. 입문자는 남쪽 완만한 피크가 편해요.',
    forecast: [
      { time: '06', heightM: 1.2, quality: '좋음' },
      { time: '09', heightM: 1.1, quality: '좋음' },
      { time: '12', heightM: 0.9, quality: '보통' },
      { time: '15', heightM: 0.8, quality: '보통' },
      { time: '18', heightM: 0.7, quality: '보통' },
      { time: '21', heightM: 0.6, quality: '주의' },
    ],
  },
  {
    id: 'busan-songjeong',
    name: '송정해변',
    region: '부산 해운대',
    nowHeightM: 0.8,
    periodSeconds: 7,
    wind: '남동 3m/s',
    waterTemperatureC: 26,
    tide: '11:18 만조',
    bestWindow: '06:30–08:30',
    note: '이른 시간 면이 가장 깨끗해요. 오후에는 온쇼어 영향이 커져요.',
    forecast: [
      { time: '06', heightM: 0.9, quality: '좋음' },
      { time: '09', heightM: 0.8, quality: '보통' },
      { time: '12', heightM: 0.7, quality: '보통' },
      { time: '15', heightM: 0.6, quality: '주의' },
      { time: '18', heightM: 0.6, quality: '주의' },
      { time: '21', heightM: 0.5, quality: '주의' },
    ],
  },
  {
    id: 'jeju-jungmun',
    name: '중문색달',
    region: '제주 서귀포',
    nowHeightM: 1.5,
    periodSeconds: 11,
    wind: '북동 2m/s',
    waterTemperatureC: 27,
    tide: '09:56 만조',
    bestWindow: '07:00–10:00',
    note: '긴 주기의 세트가 들어와요. 리프와 이안류에 익숙한 서퍼에게 맞아요.',
    forecast: [
      { time: '06', heightM: 1.4, quality: '좋음' },
      { time: '09', heightM: 1.6, quality: '좋음' },
      { time: '12', heightM: 1.5, quality: '좋음' },
      { time: '15', heightM: 1.3, quality: '보통' },
      { time: '18', heightM: 1.2, quality: '보통' },
      { time: '21', heightM: 1.1, quality: '보통' },
    ],
  },
];

export interface CourtTransfer {
  id: string;
  venue: string;
  region: string;
  dateLabel: string;
  time: string;
  durationMinutes: number;
  surface: '하드' | '클레이' | '인조잔디';
  courtType: '실내' | '실외';
  price: number;
  host: string;
  chatId: string;
  note: string;
}

export const COURT_TRANSFERS: CourtTransfer[] = [
  {
    id: 'court-001',
    venue: '잠실 유수지 2번 코트',
    region: '서울 송파',
    dateLabel: '8월 25일 · 화',
    time: '19:00',
    durationMinutes: 120,
    surface: '하드',
    courtType: '실외',
    price: 24000,
    host: '랠리왕김테니스',
    chatId: 'chat-002',
    note: '우천 취소 가능. 예약자 이름 변경까지 도와드려요.',
  },
  {
    id: 'court-002',
    venue: '반포 종합운동장 1번 코트',
    region: '서울 서초',
    dateLabel: '8월 27일 · 목',
    time: '20:00',
    durationMinutes: 120,
    surface: '인조잔디',
    courtType: '실외',
    price: 30000,
    host: '반포에이스',
    chatId: 'chat-002',
    note: '조명 포함 금액. 복식 한 팀이 사용하기 좋아요.',
  },
  {
    id: 'court-003',
    venue: '성남 실내테니스장 B코트',
    region: '경기 성남',
    dateLabel: '8월 29일 · 토',
    time: '10:00',
    durationMinutes: 90,
    surface: '하드',
    courtType: '실내',
    price: 45000,
    host: '분당포핸드',
    chatId: 'chat-002',
    note: '냉방 운영. 예약 확정 문자 전달 후 입금받아요.',
  },
  {
    id: 'court-004',
    venue: '양재 시민의숲 4번 코트',
    region: '서울 서초',
    dateLabel: '8월 30일 · 일',
    time: '07:00',
    durationMinutes: 120,
    surface: '하드',
    courtType: '실외',
    price: 18000,
    host: '선데이서버',
    chatId: 'chat-001',
    note: '아침 시간대라 주차가 여유로워요. 예약 전체 양도입니다.',
  },
];
