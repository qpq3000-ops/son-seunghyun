import { useCallback, useEffect, useState } from 'react';
import { VoucherForm, VoucherHeader, VoucherLine, emptyLine, calcLine } from '../components/VoucherForm';
import { PullSourceModal } from '../components/PullSourceModal';
import { StockPickModal } from '../components/StockPickModal';
import { ProfitCalcModal } from '../components/ProfitCalcModal';
import { DocFindModal } from '../components/DocFindModal';
import { PrintDoc, PrintCompany } from '../components/PrintDoc';
import { Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { todayISO } from '../format';
import type { Doc, StockRow } from '../types';

// 판매입력/구매입력 — 이카운트의 전표 입력 화면. kind로 판매/구매를 나누고
// mode로 신규입력/수정을 겸용한다(수정은 VoucherList의 행 더블클릭에서 진입).
// Phase 1.5: 주문서/발주서 [끌어오기] 버튼(PullSourceModal)과 판매수정의 [인쇄](거래명세서) 추가.
// R3(설계-R3-IA재편성.md §5): 판매입력 버튼 행 5개(찾기/거래내역보기/재고불러오기/이익계산/전표불러오기) + 담당자 필드.

type Kind = 'sale' | 'purchase';

interface RecentSaleLine {
  item_id: number; item_code: string; item_name: string; unit: string;
  qty: number; price: number; remarks: string;
}
interface RecentSaleResp { found: boolean; doc_no?: string; io_date?: string; lines?: RecentSaleLine[] }

function emptyHeader(): VoucherHeader {
  return {
    date: todayISO(),
    partner_id: null, partner_name: '',
    warehouse_id: null, warehouse_name: '',
    tax_mode: '과세',
    memo: '',
    emp_id: null, emp_name: '',
  };
}

interface Props {
  kind: Kind;
  mode?: 'create' | 'edit';
  docId?: number;
  onSaved?: () => void;    // 수정 저장 성공(목록 복귀 + 재조회는 호출부 책임)
  onDeleted?: () => void;  // 삭제 성공
  onCancel?: () => void;   // [목록으로]
}

export function VoucherScreen({ kind, mode = 'create', docId, onSaved, onDeleted, onCancel }: Props) {
  const toast = useToast();
  const [header, setHeaderState] = useState<VoucherHeader>(emptyHeader());
  const [lines, setLines] = useState<VoucherLine[]>([emptyLine(), emptyLine(), emptyLine()]);
  const [vatRound, setVatRound] = useState<'floor' | 'round'>('floor');
  const [saving, setSaving] = useState(false);
  const [priceMap, setPriceMap] = useState<Map<number, number>>(new Map());
  const [confirmDel, setConfirmDel] = useState(false);
  const [loadedNo, setLoadedNo] = useState<string | null>(null);
  const [sourceDocId, setSourceDocId] = useState<number | null>(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [stockPickOpen, setStockPickOpen] = useState(false);
  const [profitOpen, setProfitOpen] = useState(false);
  const [printData, setPrintData] = useState<{ company: PrintCompany; doc: Doc } | null>(null);
  const [companyTab, setCompanyTab] = useState('');   // 조건 저장탭 파랑 pill 라벨(설계-R12-시각100.md §4.4)

  // 서버와 동일한 부가세 반올림 규칙을 미리보기에도 적용(설계 0장: 클라 계산식은 서버와 비트단위 일치)
  useEffect(() => {
    api.get<Record<string, string>>('/api/settings')
      .then(s => { setVatRound(s.vat_round === 'round' ? 'round' : 'floor'); setCompanyTab(s.company_name ?? ''); })
      .catch(() => {});
  }, []);

  // 거래처 선택 시 특별단가 로드 → 특별단가 → 품목 출고단가 → 0(싯가) 순으로 자동적용
  useEffect(() => {
    if (!header.partner_id) { setPriceMap(new Map()); return; }
    let alive = true;
    api.get<{ item_id: number; price: number }[]>(`/api/price-special?partner_id=${header.partner_id}`)
      .then(rows => { if (alive) setPriceMap(new Map(rows.map(r => [r.item_id, r.price]))); })
      .catch(() => { if (alive) setPriceMap(new Map()); });
    return () => { alive = false; };
  }, [header.partner_id]);

  // 전잔(이카운트 판매입력 헤더) — 거래처 선택 시 미수 잔액 조회. 후잔은 VoucherForm이 전잔+합계로 계산.
  const [prevBalance, setPrevBalance] = useState<number | null>(null);
  useEffect(() => {
    if (kind !== 'sale' || !header.partner_id) { setPrevBalance(kind === 'sale' ? 0 : null); return; }
    let alive = true;
    api.get<{ partner_id: number; balance: number }[]>('/api/receivables')
      .then(rows => { if (alive) setPrevBalance(rows.find(r => r.partner_id === header.partner_id)?.balance ?? 0); })
      .catch(() => { if (alive) setPrevBalance(0); });
    return () => { alive = false; };
  }, [kind, header.partner_id]);

  const priceResolver = useCallback(
    (itemId: number, priceOut: number) => priceMap.get(itemId) ?? priceOut ?? 0,
    [priceMap],
  );

  const loadDoc = useCallback(async (id: number) => {
    try {
      const d = await api.get<Doc>(`/api/docs/${id}`);
      setHeaderState({
        date: d.io_date,
        partner_id: d.partner_id, partner_name: d.partner_name ?? '',
        warehouse_id: d.warehouse_id, warehouse_name: d.warehouse_name ?? '',
        tax_mode: d.tax_mode, memo: d.memo,
        emp_id: d.emp_id ?? null, emp_name: d.emp_name ?? '',
      });
      setLines(d.lines.length ? d.lines.map(l => ({
        item_id: l.item_id, item_code: l.item_code ?? '', item_name: l.item_name ?? '',
        unit: l.unit ?? 'kg', qty: l.qty, price: l.price,
        supply: l.supply_amt, vat: l.vat_amt, memo: l.remarks,
      })) : [emptyLine()]);
      setLoadedNo(d.doc_no);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (mode === 'edit' && docId) loadDoc(docId);
    // loadDoc은 toast 컨텍스트 객체(다른 탭의 토스트에도 매번 새 참조)에 의존하므로
    // deps에 넣으면 무관한 토스트에도 재조회되어 입력 중인 내용을 덮어쓸 수 있다 → id 변경시에만 로딩
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, docId]);

  const validate = (): string | null => {
    if (!header.date) return '일자를 입력하세요.';
    if (!header.partner_id) return '거래처를 선택하세요.';
    if (!header.warehouse_id) return '창고를 선택하세요.';
    if (!lines.some(l => l.item_id && l.qty > 0)) return '품목 라인을 1개 이상 입력하세요.';
    return null;
  };

  const save = async () => {
    const msg = validate();
    if (msg) { toast.show(msg, 'error'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: kind,
        io_date: header.date,
        partner_id: header.partner_id,
        warehouse_id: header.warehouse_id,
        tax_mode: header.tax_mode,
        project_id: null,
        memo: header.memo,
        emp_id: header.emp_id,
        lines: lines.filter(l => l.item_id && l.qty > 0).map(l => ({
          item_id: l.item_id, qty: l.qty, price: l.price, remarks: l.memo,
        })),
      };
      if (sourceDocId) body.source_doc_id = sourceDocId;
      const res = mode === 'edit' && docId
        ? await api.put<Doc>(`/api/docs/${docId}`, body)
        : await api.post<Doc>('/api/docs', body);
      (res.warnings ?? []).forEach(w => toast.show(w, 'error'));
      toast.show(`저장되었습니다. (전표 ${res.doc_no})`);
      if (mode === 'edit') {
        onSaved?.();
      } else {
        // 라인만 초기화, 헤더(일자/거래처/창고/거래유형)는 유지 → 연속입력. 끌어온 원본 연결도 리셋.
        setLines([emptyLine(), emptyLine(), emptyLine()]);
        setSourceDocId(null);
      }
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!docId) return;
    try {
      await api.del(`/api/docs/${docId}`);
      toast.show('삭제되었습니다.');
      setConfirmDel(false);
      onDeleted?.();
    } catch (e) {
      toast.show((e as Error).message, 'error');
      setConfirmDel(false);
    }
  };

  const copyRecent = async () => {
    if (!header.partner_id) { toast.show('거래처를 먼저 선택하세요.', 'error'); return; }
    try {
      const r = await api.get<RecentSaleResp>(`/api/docs/recent-sale?partner_id=${header.partner_id}`);
      if (!r.found || !r.lines?.length) { toast.show('최근 판매 내역이 없습니다.', 'error'); return; }
      setLines(r.lines.map(l => calcLine({
        item_id: l.item_id, item_code: l.item_code, item_name: l.item_name,
        unit: l.unit, qty: l.qty, price: l.price, supply: 0, vat: 0, memo: l.remarks ?? '',
      }, header.tax_mode, vatRound)));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  // 이카운트 판매입력 버튼: 정렬(품목코드순) · 검증(저장 전 유효성) · 거래별부가세계산(합계 요약)
  const sortLines = () => {
    const sorted = [...lines].sort((a, b) => {
      if (!a.item_id) return 1; if (!b.item_id) return -1;   // 빈 라인은 뒤로
      return a.item_code.localeCompare(b.item_code);
    });
    setLines(sorted);
    toast.show('품목코드 순으로 정렬했습니다.');
  };
  const verify = () => {
    const msg = validate();
    if (msg) { toast.show(`검증: ${msg}`, 'error'); return; }
    const n = lines.filter(l => l.item_id && l.qty > 0).length;
    toast.show(`검증 완료 — 품목 ${n}건, 저장 가능한 전표입니다.`);
  };
  const vatSummary = () => {
    const sup = lines.reduce((a, l) => a + l.supply, 0);
    const vat = lines.reduce((a, l) => a + l.vat, 0);
    toast.show(`거래별 부가세 — 공급가액 ${sup.toLocaleString('ko-KR')} · 부가세 ${vat.toLocaleString('ko-KR')} · 합계 ${(sup + vat).toLocaleString('ko-KR')}원`);
  };

  // 다시작성(설계-R12-시각100.md §4.4) — UI 전용 라인 초기화. 저장·전잔/후잔·자동분개 미개입.
  const resetLines = () => { setLines([emptyLine(), emptyLine(), emptyLine()]); setSourceDocId(null); };

  // 주문서/발주서 끌어오기(설계 4.4) — target은 저장하려는 전표 종류와 동일한 값('sale'|'purchase')
  const applyPulled = async (id: number) => {
    try {
      const d = await api.get<Doc>(`/api/docs/${id}`);
      setHeaderState(h => ({
        ...h,
        partner_id: h.partner_id ?? d.partner_id,
        partner_name: h.partner_id ? h.partner_name : (d.partner_name ?? ''),
        warehouse_id: d.warehouse_id,
        warehouse_name: d.warehouse_name ?? '',
        tax_mode: d.tax_mode,
      }));
      setLines(d.lines.length ? d.lines.map(l => ({
        item_id: l.item_id, item_code: l.item_code ?? '', item_name: l.item_name ?? '',
        unit: l.unit ?? 'kg', qty: l.qty, price: l.price,
        supply: l.supply_amt, vat: l.vat_amt, memo: l.remarks,
      })) : [emptyLine()]);
      setSourceDocId(id);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  // 찾기(F3, 설계 R3 §5.4) — 기존 판매 전표를 신규 입력의 템플릿으로 불러온다(sourceDocId 미연결 = 체인 아님).
  const loadFromFind = async (id: number) => {
    try {
      const d = await api.get<Doc>(`/api/docs/${id}`);
      setHeaderState({
        date: d.io_date,
        partner_id: d.partner_id, partner_name: d.partner_name ?? '',
        warehouse_id: d.warehouse_id, warehouse_name: d.warehouse_name ?? '',
        tax_mode: d.tax_mode, memo: d.memo,
        emp_id: d.emp_id ?? null, emp_name: d.emp_name ?? '',
      });
      setLines(d.lines.length ? d.lines.map(l => ({
        item_id: l.item_id, item_code: l.item_code ?? '', item_name: l.item_name ?? '',
        unit: l.unit ?? 'kg', qty: l.qty, price: l.price,
        supply: l.supply_amt, vat: l.vat_amt, memo: l.remarks,
      })) : [emptyLine()]);
      setSourceDocId(null);
      toast.show(`전표 ${d.doc_no} 내용을 불러왔습니다(저장 시 신규 전표로 발행됩니다).`);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  // 재고불러오기(설계 R3 §5.2) — 선택 품목을 현재 라인에 append. 빈 선행 라인은 유지, 새 라인 뒤에 append.
  const addFromStock = (selected: StockRow[]) => {
    const added = selected.map(s => calcLine({
      item_id: s.item_id, item_code: s.item_code, item_name: s.item_name, unit: s.unit,
      qty: 0, price: priceMap.get(s.item_id) ?? 0, supply: 0, vat: 0, memo: '',
    }, header.tax_mode, vatRound));
    setLines(prev => [...prev.filter(l => l.item_id), ...added, emptyLine()]);
  };

  // 판매입력 전용 단축키: F3 → 찾기 팝업(VoucherForm의 F8 저장과 별개 리스너)
  useEffect(() => {
    if (kind !== 'sale') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        if (!findOpen && !stockPickOpen && !profitOpen && !pullOpen) setFindOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, findOpen, stockPickOpen, profitOpen, pullOpen]);

  // 거래명세서 인쇄(설계 4.7) — 판매수정 화면에서만 노출
  const doPrint = async () => {
    if (!docId) return;
    try {
      const [settings, d] = await Promise.all([
        api.get<Record<string, string>>('/api/settings'),
        api.get<Doc>(`/api/docs/${docId}`),
      ]);
      setPrintData({
        company: {
          name: settings.company_name ?? '', ceo: settings.company_ceo ?? '',
          biz_no: settings.company_biz_no ?? '', address: settings.company_address ?? '',
          phone: settings.company_phone ?? '',
        },
        doc: d,
      });
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printData]);

  const title = kind === 'sale' ? '판매입력' : '구매입력';

  return (
    <div className="screen">
      {kind === 'sale' && mode === 'create' && (
        <div className="r12-savetabs">
          <button className="r12-savetab on" title="저장된 검색조건 탭">{companyTab || '기본'} ▼</button>
          <button className="r12-savetab-add" disabled title="조건 저장 탭 추가는 연동 예정입니다">+</button>
        </div>
      )}
      <VoucherForm
        title={mode === 'edit' ? `${title} 수정${loadedNo ? ` (전표 ${loadedNo})` : ''}` : title}
        header={header}
        lines={lines}
        vatRound={vatRound}
        onChange={(h, l) => { setHeaderState(h); setLines(l); }}
        onSave={save}
        saving={saving}
        priceResolver={priceResolver}
        warehouseLabel={kind === 'purchase' ? '입고창고' : '창고'}
        saveLabel={mode === 'edit' ? '저장(F8)' : '저장(F8)'}
        showEmp={kind === 'sale'}
        prevBalance={prevBalance}
        headerActions={
          kind === 'sale' ? (
            <div className="r11a-toolbar">
              <button className="btn small" onClick={() => setFindOpen(true)}>찾기(F3)</button>
              <button className="btn small" onClick={sortLines}>정렬</button>
              <button className="btn small" onClick={copyRecent}>거래내역보기(판매)▼</button>
              <button className="btn small" disabled title="연동 예정입니다">My품목▼</button>
              <button className="btn small" disabled title="연동 예정입니다">소요</button>
              <button className="btn small" disabled title="연동 예정입니다">주문</button>
              <button className="btn small" disabled title="연동 예정입니다">구매</button>
              <button className="btn small" disabled title="연동 예정입니다">보류</button>
              <button className="btn small" disabled title="연동 예정입니다">할인</button>
              <button className="btn small" onClick={() => setStockPickOpen(true)}>재고불러오기</button>
              <button className="btn small" disabled title="연동 예정입니다">바코드</button>
              <button className="btn small" disabled title="연동 예정입니다">전표바코드</button>
              <button className="btn small" onClick={verify}>검증</button>
              <button className="btn small" onClick={() => setProfitOpen(true)}>이익계산</button>
              <button className="btn small" onClick={() => setPullOpen(true)}>전표불러오기</button>
              <button className="btn small" onClick={vatSummary}>거래별부가세계산</button>
            </div>
          ) : (
            <button className="btn small" onClick={() => setPullOpen(true)}>발주서 불러오기</button>
          )
        }
        footerActions={
          mode === 'edit' ? (
            <>
              <button className="btn" onClick={onCancel}>목록으로</button>
              {kind === 'sale' && <button className="btn" onClick={doPrint}>인쇄</button>}
              <button className="btn danger" onClick={() => setConfirmDel(true)}>삭제</button>
            </>
          ) : kind === 'sale' ? (
            <>
              <button className="btn small" disabled title="연동 예정입니다">저장/전표(F7)</button>
              <button className="btn small" disabled title="회계전표연결은 연동 예정입니다">회계전표연결</button>
              <button className="btn small" onClick={resetLines}>다시작성</button>
              <button className="btn small" disabled title="현금수금은 연동 예정입니다">현금수금▲</button>
              <button className="btn small" disabled title="연동 예정입니다">리스트</button>
              <button className="btn small" disabled title="연동 예정입니다">웹자료올리기</button>
            </>
          ) : undefined
        }
      />
      {confirmDel && (
        <Confirm text="이 전표를 삭제할까요?" onNo={() => setConfirmDel(false)} onYes={doDelete} />
      )}
      {pullOpen && (
        <PullSourceModal
          target={kind}
          partnerId={header.partner_id}
          onPick={applyPulled}
          onClose={() => setPullOpen(false)}
        />
      )}
      {findOpen && (
        <DocFindModal onLoad={loadFromFind} onClose={() => setFindOpen(false)} />
      )}
      {stockPickOpen && (
        <StockPickModal
          partnerId={header.partner_id}
          onAdd={addFromStock}
          onClose={() => setStockPickOpen(false)}
        />
      )}
      {profitOpen && (
        <ProfitCalcModal lines={lines} onClose={() => setProfitOpen(false)} />
      )}
      {printData && <PrintDoc variant="거래명세서" company={printData.company} doc={printData.doc} />}
    </div>
  );
}

export const SaleInput = () => <VoucherScreen kind="sale" />;
export const PurchaseInput = () => <VoucherScreen kind="purchase" />;
