// 그리드형 보고서 정의 7종 — 설계-R1-보고서엔진.md §3.5.
// ReportScreen(공통 컴포넌트) + 이 정의만으로 화면이 완성된다. 손익계산서(서식형)는 PnlStatement.tsx.
import { fmtWon, fmtQty } from '../format';
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
    summaryLine: e => `차변합계 ${fmtWon(e.summary.sum_dr)} / 대변합계 ${fmtWon(e.summary.sum_cr)} ${e.summary.sum_dr === e.summary.sum_cr ? '(일치)' : '※ 불일치'}`,
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
    summaryLine: e => `합계 차 ${fmtWon(e.totals.sum_dr)} = 대 ${fmtWon(e.totals.sum_cr)} · 잔액 차 ${fmtWon(e.totals.bal_dr)} = 대 ${fmtWon(e.totals.bal_cr)} ${e.totals.balanced ? '(대차평균)' : '※ 불일치'}`,
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

  // ── R2: 영업·재고 현황 7종 (설계-R2-영업재고현황.md §3.2) ──

  // 9. 미주문현황 ⭐ — 집계형, 기간 내 주문 없는 매출 거래처
  'order-missing': {
    id: 'order-missing', title: '미주문현황', endpoint: '/api/order-missing',
    filters: [
      { key: 'range', kind: 'date-range' },
      {
        key: 'basis', kind: 'select', label: '기준',
        options: ['주문서 기준', '주문·판매 기준'], default: '주문서 기준',
        mapValue: { '주문서 기준': 'order', '주문·판매 기준': 'order_sale' },
      },
    ],
    columns: [
      { title: '거래처코드', field: 'code', width: 110, align: 'center' },
      { title: '거래처명', field: 'name', minWidth: 200 },
      { title: '입금주기', field: 'pay_cycle', width: 80, align: 'center' },
      { title: '마지막주문일', field: 'last_order', width: 120, align: 'center' },
      { title: '마지막판매일', field: 'last_sale', width: 120, align: 'center' },
      { title: '미주문일수', field: 'days_since', width: 90, align: 'right' },
    ],
    summaryLine: e => `미주문 ${e.summary.count}개 거래처 (${e.summary.basis} 기준)`,
  },

  // 10. 견적서현황 — 라인 단위 집계형
  'quote-status': {
    id: 'quote-status', title: '견적서현황', endpoint: '/api/quote-status',
    filters: [
      { key: 'range', kind: 'date-range' },
      { key: 'partner_id', kind: 'partner', label: '거래처', omitWhen: '', helpEndpoint: '/api/partners', width: 150 },
      { key: 'item_id', kind: 'item', label: '품목', omitWhen: '', helpEndpoint: '/api/items', width: 180 },
      { key: 'status', kind: 'select', label: '상태', options: ['전체', '대기', '완료'], default: '전체', omitWhen: '전체' },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'doc_no', width: 120 },
      { title: '거래처', field: 'partner_name', minWidth: 140 },
      { title: '품목코드', field: 'item_code', width: 84, align: 'center' },
      { title: '품목명', field: 'item_name', minWidth: 180 },
      { title: '수량', field: 'qty', width: 80, align: 'right', fmt: 'qty', sum: true },
      { title: '단가', field: 'price', width: 90, align: 'right', fmt: 'won' },
      { title: '공급가액', field: 'supply_amt', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '부가세', field: 'vat_amt', width: 100, align: 'right', fmt: 'won', sum: true },
      { title: '합계', field: 'amount', width: 110, align: 'right', fmt: 'won', bold: true, sum: true },
      { title: '상태', field: 'status', width: 60, align: 'center' },
    ],
    summaryLine: e => `${e.summary.count}건 · 수량 ${fmtQty(e.summary.qty)} · 공급 ${fmtWon(e.summary.supply)} · 합계 ${fmtWon(e.summary.total)}`,
  },

  // 11. 주문서현황 — 견적서현황 + 납기일자 컬럼
  'order-status': {
    id: 'order-status', title: '주문서현황', endpoint: '/api/order-status',
    filters: [
      { key: 'range', kind: 'date-range' },
      { key: 'partner_id', kind: 'partner', label: '거래처', omitWhen: '', helpEndpoint: '/api/partners', width: 150 },
      { key: 'item_id', kind: 'item', label: '품목', omitWhen: '', helpEndpoint: '/api/items', width: 180 },
      { key: 'status', kind: 'select', label: '상태', options: ['전체', '대기', '완료'], default: '전체', omitWhen: '전체' },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'doc_no', width: 120 },
      { title: '거래처', field: 'partner_name', minWidth: 140 },
      { title: '품목코드', field: 'item_code', width: 84, align: 'center' },
      { title: '품목명', field: 'item_name', minWidth: 180 },
      { title: '수량', field: 'qty', width: 80, align: 'right', fmt: 'qty', sum: true },
      { title: '단가', field: 'price', width: 90, align: 'right', fmt: 'won' },
      { title: '공급가액', field: 'supply_amt', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '부가세', field: 'vat_amt', width: 100, align: 'right', fmt: 'won', sum: true },
      { title: '합계', field: 'amount', width: 110, align: 'right', fmt: 'won', bold: true, sum: true },
      { title: '상태', field: 'status', width: 60, align: 'center' },
      { title: '납기일자', field: 'time_date', width: 100, align: 'center' },
    ],
    summaryLine: e => `${e.summary.count}건 · 수량 ${fmtQty(e.summary.qty)} · 공급 ${fmtWon(e.summary.supply)} · 합계 ${fmtWon(e.summary.total)}`,
  },

  // 12. 발주서현황 — 주문서현황과 동형(거래처=매입처)
  'po-status': {
    id: 'po-status', title: '발주서현황', endpoint: '/api/po-status',
    filters: [
      { key: 'range', kind: 'date-range' },
      { key: 'partner_id', kind: 'partner', label: '거래처', omitWhen: '', helpEndpoint: '/api/partners', width: 150 },
      { key: 'item_id', kind: 'item', label: '품목', omitWhen: '', helpEndpoint: '/api/items', width: 180 },
      { key: 'status', kind: 'select', label: '상태', options: ['전체', '대기', '완료'], default: '전체', omitWhen: '전체' },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'doc_no', width: 120 },
      { title: '거래처', field: 'partner_name', minWidth: 140 },
      { title: '품목코드', field: 'item_code', width: 84, align: 'center' },
      { title: '품목명', field: 'item_name', minWidth: 180 },
      { title: '수량', field: 'qty', width: 80, align: 'right', fmt: 'qty', sum: true },
      { title: '단가', field: 'price', width: 90, align: 'right', fmt: 'won' },
      { title: '공급가액', field: 'supply_amt', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '부가세', field: 'vat_amt', width: 100, align: 'right', fmt: 'won', sum: true },
      { title: '합계', field: 'amount', width: 110, align: 'right', fmt: 'won', bold: true, sum: true },
      { title: '상태', field: 'status', width: 60, align: 'center' },
      { title: '납기일자', field: 'time_date', width: 100, align: 'center' },
    ],
    summaryLine: e => `${e.summary.count}건 · 수량 ${fmtQty(e.summary.qty)} · 공급 ${fmtWon(e.summary.supply)} · 합계 ${fmtWon(e.summary.total)}`,
  },

  // 13. 판매구매 집계표 — group×tx 8조합, 컬럼 고정 → 단일 정의
  'sales-summary': {
    id: 'sales-summary', title: '판매구매 집계표', endpoint: '/api/sales-purchase-summary',
    filters: [
      { key: 'range', kind: 'date-range' },
      {
        key: 'tx', kind: 'select', label: '구분', options: ['판매', '구매'], default: '판매',
        mapValue: { '판매': 'sale', '구매': 'purchase' },
      },
      {
        key: 'group', kind: 'select', label: '기준', options: ['일별', '월별', '거래처별', '품목별'], default: '일별',
        mapValue: { '일별': 'day', '월별': 'month', '거래처별': 'partner', '품목별': 'item' },
      },
    ],
    columns: [
      { title: '코드', field: 'code', width: 110, align: 'center' },
      { title: '기준', field: 'label', minWidth: 200 },
      { title: '수량', field: 'qty', width: 90, align: 'right', fmt: 'qty', sum: true },
      { title: '공급가액', field: 'supply', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '부가세', field: 'vat', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '합계', field: 'total', width: 130, align: 'right', fmt: 'won', bold: true, sum: true },
    ],
    summaryLine: e => `${e.summary.count}건 · 수량 ${fmtQty(e.summary.qty)} · 공급 ${fmtWon(e.summary.supply)} · 부가세 ${fmtWon(e.summary.vat)} · 합계 ${fmtWon(e.summary.total)}`,
  },

  // 14. 기타이동현황 — stock_ledger grain
  'other-moves': {
    id: 'other-moves', title: '기타이동현황', endpoint: '/api/other-moves',
    filters: [
      { key: 'range', kind: 'date-range' },
      {
        key: 'type', kind: 'select', label: '유형',
        options: ['전체', '창고이동', '자가사용', '불량처리', '재고조정'], default: '전체', omitWhen: '전체',
        mapValue: { '창고이동': 'move', '자가사용': 'self_use', '불량처리': 'defect', '재고조정': 'adjust' },
      },
    ],
    columns: [
      { title: '일자', field: 'io_date', width: 100 },
      { title: '전표번호', field: 'doc_no', width: 120 },
      { title: '유형', field: 'type', width: 80, align: 'center' },
      { title: '품목코드', field: 'item_code', width: 84, align: 'center' },
      { title: '품목명', field: 'item_name', minWidth: 180 },
      { title: '창고', field: 'warehouse_name', width: 110 },
      { title: '입출고', field: 'io_type', width: 80, align: 'center' },
      { title: '수량', field: 'qty', width: 90, align: 'right', fmt: 'qty', sum: true },
      { title: '적요', field: 'memo', minWidth: 160 },
    ],
    summaryLine: e => `${e.summary.count}건 · 순증감 ${fmtQty(e.summary.net_qty)}kg`,
  },

  // 15. 재고변동표 — 수불부의 전 품목 버전(합계행 없음)
  // real 옵션 예시(설계-R8-실물매칭.md §4.3): ReportScreen 실물 헤더/하단바 엔진을 재사용해봄(선택 적용)
  'stock-flow': {
    id: 'stock-flow', title: '재고변동표', endpoint: '/api/stock-flow',
    real: { centerTitle: '재고변동표', companyLine: true, negativeField: 'closing' },
    filters: [
      { key: 'range', kind: 'date-range' },
      {
        key: 'item_type', kind: 'select', label: '품목구분',
        options: ['전체', '원재료', '부자재', '제품', '상품'], default: '전체', omitWhen: '전체',
      },
      {
        key: 'show', kind: 'select', label: '표시',
        options: ['변동·잔량만', '전체 품목'], default: '변동·잔량만',
        mapValue: { '변동·잔량만': 'active', '전체 품목': 'all' },
      },
    ],
    columns: [
      { title: '품목코드', field: 'code', width: 84, align: 'center' },
      { title: '품목명', field: 'name', minWidth: 200 },
      { title: '규격', field: 'spec', width: 90 },
      { title: '단위', field: 'unit', width: 56, align: 'center' },
      { title: '이월', field: 'opening', width: 90, align: 'right', fmt: 'qty' },
      { title: '입고', field: 'in_qty', width: 90, align: 'right', fmt: 'qty' },
      { title: '출고', field: 'out_qty', width: 90, align: 'right', fmt: 'qty' },
      { title: '잔량', field: 'closing', width: 100, align: 'right', fmt: 'qty', bold: true },
    ],
    summaryLine: e => `${e.summary.count}개 품목`,
  },

  // ── R10-B: 회계Ⅰ 출력물 신규 def 2종 (설계-R10-커버리지.md §B-3①) ──
  // sales-summary(판매구매 집계표)를 tx 고정 + group 기본값만 바꿔 복제한 실물 메뉴.

  // 16. 월별매출집계표 — tx='판매'(sale) 고정, group 기본 '월별'
  'ar-monthly-summary': {
    id: 'ar-monthly-summary', title: '월별매출집계표', endpoint: '/api/sales-purchase-summary',
    filters: [
      { key: 'range', kind: 'date-range' },
      {
        key: 'tx', kind: 'select', label: '구분', options: ['판매'], default: '판매',
        mapValue: { '판매': 'sale' },
      },
      {
        key: 'group', kind: 'select', label: '기준', options: ['월별', '일별', '거래처별', '품목별'], default: '월별',
        mapValue: { '월별': 'month', '일별': 'day', '거래처별': 'partner', '품목별': 'item' },
      },
    ],
    columns: [
      { title: '코드', field: 'code', width: 110, align: 'center' },
      { title: '기준', field: 'label', minWidth: 200 },
      { title: '수량', field: 'qty', width: 90, align: 'right', fmt: 'qty', sum: true },
      { title: '공급가액', field: 'supply', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '부가세', field: 'vat', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '합계', field: 'total', width: 130, align: 'right', fmt: 'won', bold: true, sum: true },
    ],
    summaryLine: e => `${e.summary.count}건 · 수량 ${fmtQty(e.summary.qty)} · 공급 ${fmtWon(e.summary.supply)} · 부가세 ${fmtWon(e.summary.vat)} · 합계 ${fmtWon(e.summary.total)}`,
  },

  // 17. 월별매입집계표 — tx='구매'(purchase) 고정, group 기본 '월별'
  'ap-monthly-summary': {
    id: 'ap-monthly-summary', title: '월별매입집계표', endpoint: '/api/sales-purchase-summary',
    filters: [
      { key: 'range', kind: 'date-range' },
      {
        key: 'tx', kind: 'select', label: '구분', options: ['구매'], default: '구매',
        mapValue: { '구매': 'purchase' },
      },
      {
        key: 'group', kind: 'select', label: '기준', options: ['월별', '일별', '거래처별', '품목별'], default: '월별',
        mapValue: { '월별': 'month', '일별': 'day', '거래처별': 'partner', '품목별': 'item' },
      },
    ],
    columns: [
      { title: '코드', field: 'code', width: 110, align: 'center' },
      { title: '기준', field: 'label', minWidth: 200 },
      { title: '수량', field: 'qty', width: 90, align: 'right', fmt: 'qty', sum: true },
      { title: '공급가액', field: 'supply', width: 120, align: 'right', fmt: 'won', sum: true },
      { title: '부가세', field: 'vat', width: 110, align: 'right', fmt: 'won', sum: true },
      { title: '합계', field: 'total', width: 130, align: 'right', fmt: 'won', bold: true, sum: true },
    ],
    summaryLine: e => `${e.summary.count}건 · 수량 ${fmtQty(e.summary.qty)} · 공급 ${fmtWon(e.summary.supply)} · 부가세 ${fmtWon(e.summary.vat)} · 합계 ${fmtWon(e.summary.total)}`,
  },
};
