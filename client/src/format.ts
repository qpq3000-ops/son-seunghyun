// 원화/수량 포맷 유틸 — 금액은 정수(원), 수량은 kg 소수 1자리
export const fmtWon = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? '' : Math.trunc(n).toLocaleString('ko-KR');

export const fmtQty = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n)
    ? ''
    : (Math.round(n * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 });

export const parseWon = (s: string): number => {
  const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 조회 화면 기간 기본값(이번달 1일) — 판매/구매조회·재고수불부 등에서 공용 사용
export const monthStartISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// year/month(1~12)에서 delta개월 이동한 연/월 계산 — 달력(CalendarScreen)의 ◀▶ 월 이동에 사용
export const addMonths = (year: number, month: number, delta: number): { year: number; month: number } => {
  let m = month + delta;
  let y = year;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return { year: y, month: m };
};
