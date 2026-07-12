import { useCallback, useEffect, useState } from 'react';
import { VoucherForm, VoucherHeader, VoucherLine, emptyLine } from '../components/VoucherForm';
import { PullSourceModal } from '../components/PullSourceModal';
import { PrintDoc, PrintCompany } from '../components/PrintDoc';
import { Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { todayISO } from '../format';
import type { Doc } from '../types';

// 견적서/주문서/발주서 입력·수정 — 판매입력(VoucherScreen)과 동일한 VoucherForm 기반이지만
// 원장을 발생시키지 않는 3종 전표(quote/order/purchase_order)를 다룬다(설계 4.1).
// 진행상태(status)·납기일자(time_date)·끌어오기(source_doc_id)가 판매/구매와 다른 점.

type Kind = 'quote' | 'order' | 'purchase_order';

const TITLE: Record<Kind, string> = { quote: '견적서', order: '주문서', purchase_order: '발주서' };

// 견적서/주문서 입력 그리드 툴바(실물 §12.1) — 전부 동작 없는 stub(연동 예정). R11-A.
const R11A_STUB_TOOLBAR = [
  '찾기(F3)', '정렬', '거래내역보기(견적)▲', 'My품목▲', '할인', '재고불러오기',
  '생성한전표', '바코드', '검증', '이익계산', '전표불러오기',
];

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
  mode?: 'create' | 'edit';
  docId?: number;
  onSaved?: () => void;    // 수정 저장 성공(목록 복귀 + 재조회는 호출부 책임)
  onDeleted?: () => void;  // 삭제 성공
  onCancel?: () => void;   // [목록으로]
}

function DocChainScreen({ kind, mode = 'create', docId, onSaved, onDeleted, onCancel }: Props & { kind: Kind }) {
  const toast = useToast();
  const [header, setHeaderState] = useState<VoucherHeader>(emptyHeader());
  const [lines, setLines] = useState<VoucherLine[]>([emptyLine()]);
  const [timeDate, setTimeDate] = useState('');
  const [vatRound, setVatRound] = useState<'floor' | 'round'>('floor');
  const [saving, setSaving] = useState(false);
  const [priceMap, setPriceMap] = useState<Map<number, number>>(new Map());
  const [confirmDel, setConfirmDel] = useState(false);
  const [loadedNo, setLoadedNo] = useState<string | null>(null);
  const [sourceDocId, setSourceDocId] = useState<number | null>(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [printData, setPrintData] = useState<{ company: PrintCompany; doc: Doc } | null>(null);
  // R11-A: 견적/주문 헤더의 실물 참고필드 — quote/order 스키마에 없어 컴포넌트 state로만 보관, 서버 미전송(설계 3.2/3.3).
  const [refNote, setRefNote] = useState('');         // 참조
  const [paymentTerm, setPaymentTerm] = useState(''); // 결제조건
  const [validUntil, setValidUntil] = useState('');   // 유효기간(견적 전용)
  const [searchContent, setSearchContent] = useState(''); // 검색창내용(주문 전용)

  // 서버와 동일한 부가세 반올림 규칙을 미리보기에도 적용(설계 0장)
  useEffect(() => {
    api.get<Record<string, string>>('/api/settings')
      .then(s => setVatRound(s.vat_round === 'round' ? 'round' : 'floor'))
      .catch(() => {});
  }, []);

  // 거래처 선택 시 특별단가 로드(발주는 특별단가 대신 품목 입/출고단가를 그대로 사용해도 무방 — 설계 4.1)
  useEffect(() => {
    if (!header.partner_id) { setPriceMap(new Map()); return; }
    let alive = true;
    api.get<{ item_id: number; price: number }[]>(`/api/price-special?partner_id=${header.partner_id}`)
      .then(rows => { if (alive) setPriceMap(new Map(rows.map(r => [r.item_id, r.price]))); })
      .catch(() => { if (alive) setPriceMap(new Map()); });
    return () => { alive = false; };
  }, [header.partner_id]);

  const priceResolver = useCallback(
    (itemId: number, priceOut: number) => priceMap.get(itemId) ?? priceOut ?? 0,
    [priceMap],
  );

  const docToForm = (d: Doc) => ({
    header: {
      date: d.io_date,
      partner_id: d.partner_id, partner_name: d.partner_name ?? '',
      warehouse_id: d.warehouse_id, warehouse_name: d.warehouse_name ?? '',
      tax_mode: d.tax_mode, memo: d.memo,
      emp_id: d.emp_id ?? null, emp_name: d.emp_name ?? '',
    } as VoucherHeader,
    lines: d.lines.length ? d.lines.map(l => ({
      item_id: l.item_id, item_code: l.item_code ?? '', item_name: l.item_name ?? '',
      unit: l.unit ?? 'kg', qty: l.qty, price: l.price,
      supply: l.supply_amt, vat: l.vat_amt, memo: l.remarks,
    })) : [emptyLine()],
  });

  const loadDoc = useCallback(async (id: number) => {
    try {
      const d = await api.get<Doc>(`/api/docs/${id}`);
      const { header: h, lines: l } = docToForm(d);
      setHeaderState(h);
      setLines(l);
      setTimeDate(d.time_date ?? '');
      setSourceDocId(d.source_doc_id ?? null);
      setLoadedNo(d.doc_no);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    if (mode === 'edit' && docId) loadDoc(docId);
    // loadDoc은 toast 컨텍스트 참조로 매번 새로 생성되므로 id 변경시에만 로딩(VoucherScreen과 동일 이유)
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
        lines: lines.filter(l => l.item_id && l.qty > 0).map(l => ({
          item_id: l.item_id, qty: l.qty, price: l.price, remarks: l.memo,
        })),
      };
      if (kind !== 'quote') body.time_date = timeDate || null;
      if (sourceDocId) body.source_doc_id = sourceDocId;
      const res = mode === 'edit' && docId
        ? await api.put<Doc>(`/api/docs/${docId}`, body)
        : await api.post<Doc>('/api/docs', body);
      (res.warnings ?? []).forEach(w => toast.show(w, 'error'));
      toast.show(`저장되었습니다. (전표 ${res.doc_no})`);
      if (mode === 'edit') {
        onSaved?.();
      } else {
        // 라인만 초기화, 헤더는 유지 → 연속입력. 끌어온 원본 연결도 리셋(설계 4.1)
        setLines([emptyLine()]);
        setSourceDocId(null);
        // R11-A: 참고용 헤더 필드(서버 미전송)도 저장 시 리셋(설계 3.2)
        setRefNote('');
        setPaymentTerm('');
        setValidUntil('');
        setSearchContent('');
      }
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 다시작성(§12.1/§12.2 하단바) — 헤더·라인·참고필드 전부 초기화(실동작). 끌어온 원본 연결도 해제.
  const resetForm = () => {
    setHeaderState(emptyHeader());
    setLines([emptyLine()]);
    setTimeDate('');
    setSourceDocId(null);
    setRefNote('');
    setPaymentTerm('');
    setValidUntil('');
    setSearchContent('');
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

  const applyPulled = async (id: number) => {
    try {
      const d = await api.get<Doc>(`/api/docs/${id}`);
      const { header: h, lines: l } = docToForm(d);
      setHeaderState(prev => ({
        ...h,
        // 거래처가 폼에 이미 있으면 유지, 없으면 원본 거래처로 세팅(설계 4.3)
        partner_id: prev.partner_id ?? h.partner_id,
        partner_name: prev.partner_id ? prev.partner_name : h.partner_name,
      }));
      setLines(l);
      setSourceDocId(id);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

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

  const title = TITLE[kind];

  return (
    <div className="screen">
      <VoucherForm
        title={mode === 'edit' ? `${title} 수정${loadedNo ? ` (전표 ${loadedNo})` : ''}` : `${title} 입력`}
        header={header}
        lines={lines}
        vatRound={vatRound}
        onChange={(h, l) => { setHeaderState(h); setLines(l); }}
        onSave={save}
        saving={saving}
        priceResolver={priceResolver}
        warehouseLabel={kind === 'purchase_order' ? '입고창고' : '창고'}
        saveLabel={mode === 'edit' ? '저장(F8)' : '저장(F8)'}
        headerActions={
          kind === 'quote' ? (
            <div className="r11a-toolbar" style={{ width: '100%' }}>
              {R11A_STUB_TOOLBAR.map(label => (
                <button key={label} className="btn small" disabled title="연동 예정입니다">{label}</button>
              ))}
            </div>
          ) : kind === 'order' ? (
            <>
              <button className="btn r8-primary" disabled title="생산입고 연계는 연동 예정입니다">생산입고 ▼</button>
              <div className="r11a-toolbar" style={{ flex: 1, minWidth: 0 }}>
                <button className="btn small" onClick={() => setPullOpen(true)}>견적</button>
                {R11A_STUB_TOOLBAR.map(label => (
                  <button key={label} className="btn small" disabled title="연동 예정입니다">{label}</button>
                ))}
              </div>
            </>
          ) : undefined
        }
        headerExtra={
          kind === 'quote' ? (
            <>
              <label title="참고용(저장 미반영)">통화
                <select className="input" disabled title="참고용(저장 미반영)"><option>내자</option></select>
              </label>
              <label title="참고용(저장 미반영)">참조
                <input className="input" value={refNote} onChange={e => setRefNote(e.target.value)} />
              </label>
              <label title="참고용(저장 미반영)">결제조건
                <input className="input" value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} />
              </label>
              <label title="참고용(저장 미반영)">유효기간
                <input className="input" type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </label>
              <label title="참고용(저장 미반영)">첨부
                <button className="btn small" disabled title="연동 예정입니다">+</button>
              </label>
            </>
          ) : kind === 'order' ? (
            <>
              <label>납기일자
                <input className="input" type="date" value={timeDate} onChange={e => setTimeDate(e.target.value)} />
              </label>
              <label title="참고용(저장 미반영)">검색창내용
                <input className="input" value={searchContent} onChange={e => setSearchContent(e.target.value)} />
              </label>
              <label title="참고용(저장 미반영)">참조
                <input className="input" value={refNote} onChange={e => setRefNote(e.target.value)} />
              </label>
              <label title="참고용(저장 미반영)">결제조건
                <input className="input" value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} />
              </label>
              <label title="참고용(저장 미반영)">첨부
                <button className="btn small" disabled title="연동 예정입니다">+</button>
              </label>
            </>
          ) : (
            <label>납기일자
              <input className="input" type="date" value={timeDate} onChange={e => setTimeDate(e.target.value)} />
            </label>
          )
        }
        footerActions={
          mode === 'edit' ? (
            <>
              <button className="btn" onClick={onCancel}>목록으로</button>
              {kind === 'quote' && <button className="btn" onClick={doPrint}>인쇄</button>}
              <button className="btn danger" onClick={() => setConfirmDel(true)}>삭제</button>
            </>
          ) : (kind === 'quote' || kind === 'order') ? (
            <>
              <button className="btn" disabled title="연동 예정입니다">✈</button>
              <button className="btn" disabled title="연동 예정입니다">저장/전표(F7)</button>
              <button className="btn" onClick={resetForm}>다시작성</button>
              <button className="btn" onClick={onCancel}>리스트</button>
              <button className="btn" disabled title="연동 예정입니다">웹자료올리기</button>
            </>
          ) : undefined
        }
      />
      {confirmDel && (
        <Confirm text="이 전표를 삭제할까요?" onNo={() => setConfirmDel(false)} onYes={doDelete} />
      )}
      {pullOpen && (
        <PullSourceModal
          target="order"
          partnerId={header.partner_id}
          onPick={applyPulled}
          onClose={() => setPullOpen(false)}
        />
      )}
      {printData && <PrintDoc variant="견적서" company={printData.company} doc={printData.doc} />}
    </div>
  );
}

export const QuoteInput = (props: Props) => <DocChainScreen kind="quote" {...props} />;
export const OrderInput = (props: Props) => <DocChainScreen kind="order" {...props} />;
export const PurchaseOrderInput = (props: Props) => <DocChainScreen kind="purchase_order" {...props} />;
