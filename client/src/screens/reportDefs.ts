// 그리드형 보고서 정의 7종 — 설계-R1-보고서엔진.md §3.5.
// ReportScreen(공통 컴포넌트) + 이 정의만으로 화면이 완성된다. 손익계산서(서식형)는 PnlStatement.tsx.
import { fmtWon } from '../format';
import type { ReportDef } from '../components/ReportScreen';

interface MethodTotal { method: string; count: number; amount: number }

export const REPORT_DEFS: Record<string, ReportDef> = {

  // 1. 계정별원장 — 원장형(opening/rows/closing), 계정 필수 선택
  'acct-ledger': {
    id: 'acct-ledger', title: '계정별원장', endpoint: '/api/account-ledger',
    filters: [
      { key: 'account_code', kind: 'account', label: '계정', required: true, requiredMsg: '계정과목을 선택하세요.', helpEndpoint: '/api/accounts', width: 160 },
      { key: 'range', kind: 'date-range' },
      { key: 'partner_id', kind: 'partner', label: '거래처', omitWhen: '', helpEndpoint: '/api/partners', width: 150 },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'doc_no', width: 120 },
      { title: '유형', field: 'entry_type', width: 64, align: 'center' },
      { title: '거래처', field: 'partner_name', minWidth: 120 },
      { title: '차변', field: 'dr', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '대변', field: 'cr', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '잔액', field: 'balance', width: 120, align: 'right', fmt: 'won', bold: true },
      { title: '적요', field: 'summary', minWidth: 120 },
    ],
    summaryLine: e => `${e.meta.account.name} · 이월 ${fmtWon(e.opening)} / 차변 ${fmtWon(e.sum_dr)} / 대변 ${fmtWon(e.sum_cr)} / 잔액 ${fmtWon(e.closing)}`,
  },

  // 2. 총계정원장 — 집계형(rows/summary), 전 계정 요약
  'general-ledger': {
    id: 'general-ledger', title: '총계정원장', endpoint: '/api/general-ledger',
    filters: [
      { key: 'range', kind: 'date-range' },
      { key: 'category', kind: 'select', label: '구분', options: ['전체', '자산', '부채', '자본', '수익', '비용'], default: '전체', omitWhen: '전체' },
    ],
    columns: [
      { title: '계정코드', field: 'code', width: 84, align: 'center' },
      { title: '계정명', field: 'name', minWidth: 140 },
      { title: '구분', field: 'category', width: 64, align: 'center' },
      { title: '전기이월', field: 'opening', width: 120, align: 'right', fmt: 'won' },
      { title: '차변', field: 'dr', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '대변', field: 'cr', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '잔액', field: 'balance', width: 130, align: 'right', fmt: 'won', bold: true },
    ],
    summaryLine: e => `차변합계 ${fmtWon(e.summary.sum_dr)} / 대변합계 ${fmtWon(e.summary.sum_cr)} ${e.summary.sum_dr === e.summary.sum_cr ? '✓ 일치' : '⚠ 불일치'}`,
  },

  // 3. 현금출납장 — 원장형, 현금(101)/보통예금(103) 특화(select→코드 매핑)
  'cashbook': {
    id: 'cashbook', title: '현금출납장', endpoint: '/api/cashbook',
    filters: [
      {
        key: 'account_code', kind: 'select', label: '계정',
        options: ['101 현금', '103 보통예금'], default: '101 현금',
        mapValue: { '101 현금': '101', '103 보통예금': '103' },
      },
      { key: 'range', kind: 'date-range' },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'doc_no', width: 120 },
      { title: '구분', field: 'kind', width: 64, align: 'center' },
      { title: '거래처', field: 'partner_name', minWidth: 120 },
      { title: '입금', field: 'in_amt', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '출금', field: 'out_amt', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '잔액', field: 'balance', width: 130, align: 'right', fmt: 'won', bold: true },
      { title: '적요', field: 'summary', minWidth: 120 },
    ],
    summaryLine: e => `${e.meta.account.name} · 이월 ${fmtWon(e.opening)} / 입금 ${fmtWon(e.sum_in)} / 출금 ${fmtWon(e.sum_out)} / 잔액 ${fmtWon(e.closing)}`,
  },

  // 4. 합계잔액시산표 — 집계형(누적 시점, as_of), 대차평균 배지
  'trial-balance': {
    id: 'trial-balance', title: '합계잔액시산표', endpoint: '/api/trial-balance',
    filters: [
      { key: 'as_of', kind: 'as-of', label: '기준일' },
    ],
    columns: [
      { title: '계정코드', field: 'code', width: 84, align: 'center' },
      { title: '계정명', field: 'name', minWidth: 130 },
      { title: '차변합계', field: 'sum_dr', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '대변합계', field: 'sum_cr', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '차변잔액', field: 'bal_dr', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '대변잔액', field: 'bal_cr', width: 120, align: 'right', fmt: 'won', sum: true },
    ],
    summaryLine: e => `합계 차 ${fmtWon(e.totals.sum_dr)} = 대 ${fmtWon(e.totals.sum_cr)} · 잔액 차 ${fmtWon(e.totals.bal_dr)} = 대 ${fmtWon(e.totals.bal_cr)} ${e.totals.balanced ? '✓ 대차평균' : '⚠ 불일치'}`,
  },

  // 6. 수금현황 — 집계형(rows/summary.by_method)
  'receipt-status': {
    id: 'receipt-status', title: '수금현황', endpoint: '/api/receipt-status',
    filters: [
      { key: 'range', kind: 'date-range' },
      { key: 'method', kind: 'select', label: '수단', options: ['전체', '현금', '보통예금', '받을어음', '카드', '기타'], default: '전체', omitWhen: '전체' },
      { key: 'partner_id', kind: 'partner', label: '거래처', omitWhen: '', helpEndpoint: '/api/partners', width: 150 },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'receipt_no', width: 120 },
      { title: '거래처', field: 'partner_name', minWidth: 140 },
      { title: '수단', field: 'method', width: 80, align: 'center' },
      { title: '금액', field: 'amount', width: 130, align: 'right', fmt: 'won', sum: true },
      { title: '적요', field: 'memo', minWidth: 140 },
    ],
    summaryLine: e => `${e.summary.count}건 · 합계 ${fmtWon(e.summary.total)} · ` +
      e.summary.by_method.map((m: MethodTotal) => `${m.method} ${fmtWon(m.amount)}`).join(' / '),
  },

  // 7. 지급현황 — 수금현황과 동형(kind='지불' 기준, 서버가 구분)
  'payment-status': {
    id: 'payment-status', title: '지급현황', endpoint: '/api/payment-status',
    filters: [
      { key: 'range', kind: 'date-range' },
      { key: 'method', kind: 'select', label: '수단', options: ['전체', '현금', '보통예금', '받을어음', '카드', '기타'], default: '전체', omitWhen: '전체' },
      { key: 'partner_id', kind: 'partner', label: '거래처', omitWhen: '', helpEndpoint: '/api/partners', width: 150 },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'receipt_no', width: 120 },
      { title: '거래처', field: 'partner_name', minWidth: 140 },
      { title: '수단', field: 'method', width: 80, align: 'center' },
      { title: '금액', field: 'amount', width: 130, align: 'right', fmt: 'won', sum: true },
      { title: '적요', field: 'memo', minWidth: 140 },
    ],
    summaryLine: e => `${e.summary.count}건 · 합계 ${fmtWon(e.summary.total)} · ` +
      e.summary.by_method.map((m: MethodTotal) => `${m.method} ${fmtWon(m.amount)}`).join(' / '),
  },

  // 8. 이익현황 — 집계형, 기준(품목/거래처)→group 값 매핑
  'profit-status': {
    id: 'profit-status', title: '이익현황', endpoint: '/api/profit-status',
    filters: [
      { key: 'range', kind: 'date-range' },
      {
        key: 'group', kind: 'select', label: '기준',
        options: ['품목별', '거래처별'], default: '품목별',
        mapValue: { '품목별': 'item', '거래처별': 'partner' },
      },
      { key: 'partner_id', kind: 'partner', label: '거래처', omitWhen: '', helpEndpoint: '/api/partners', width: 150 },
    ],
    columns: [
      { title: '코드', field: 'code', width: 90, align: 'center' },
      { title: '품목/거래처', field: 'name', minWidth: 200 },
      { title: '수량', field: 'qty', width: 90, align: 'right', fmt: 'qty', sum: true },
      { title: '판매액', field: 'sales', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '매출원가', field: 'cost', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '매출이익', field: 'margin', width: 120, align: 'right', fmt: 'won', bold: true, sum: true },
      { title: '이익률', field: 'margin_pct', width: 80, align: 'right', fmt: 'pct' },
    ],
    summaryLine: e => `판매액 ${fmtWon(e.summary.sales)} · 원가 ${fmtWon(e.summary.cost)} · 이익 ${fmtWon(e.summary.margin)} (${e.summary.margin_pct}%)`,
  },
};
