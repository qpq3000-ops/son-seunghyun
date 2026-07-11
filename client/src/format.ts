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

// 금액의 한글 표기 (이카운트 거래명세서: "금 액 : 팔십이만칠천이백원 정")
export const wonToKorean = (n: number): string => {
  const num = Math.trunc(Math.abs(n));
  if (num === 0) return '영';
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smalls = ['', '십', '백', '천'];
  const groups = ['', '만', '억', '조'];
  const chunks: number[] = [];
  let v = num;
  while (v > 0) { chunks.push(v % 10000); v = Math.floor(v / 10000); }
  let out = '';
  for (let g = chunks.length - 1; g >= 0; g--) {
    const chunk = chunks[g];
    if (!chunk) continue;
    let part = '';
    for (let p = 3; p >= 0; p--) {
      const d = Math.floor(chunk / (10 ** p)) % 10;
      if (!d) continue;
      part += (d === 1 && p > 0 ? '' : digits[d]) + smalls[p];
    }
    out += part + groups[g];
  }
  return (n < 0 ? '마이너스 ' : '') + out;
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
