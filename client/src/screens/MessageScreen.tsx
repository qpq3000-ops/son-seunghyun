import { useCallback, useEffect, useState } from 'react';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, fmtWon, todayISO, wonToKorean } from '../format';
import type { MessagePartner, Settings } from '../types';

// 거래처 메시지 (설계-잔여메뉴.md 4.6) — 기간 내 판매 전표를 거래처별로 묶어 안내문을 생성한다.
// 템플릿(주문확인/택배안내) 2종은 이 화면에서 직접 settings에 저장/조회한다(신규 API 아님, 기존 /api/settings 재사용).

type TplKind = 'confirm' | 'ship';

const DEFAULT_CONFIRM = '안녕하세요 {거래처명}님, 주문 확인드립니다.\n{내역}\n합계 {합계}원({합계한글}원정) 입니다. 감사합니다.';
const DEFAULT_SHIP = '{거래처명}님, 주문하신 원두 발송했습니다.\n{내역}\n택배 도착까지 1~2일 소요됩니다. 감사합니다.';

function substitute(tpl: string, r: MessagePartner): string {
  const detail = r.lines.map(l => `${l.item_name} ${fmtQty(l.qty)}${l.unit}`).join('\n');
  return tpl
    .replace(/\{거래처명\}/g, r.partner_name)
    .replace(/\{내역\}/g, detail)
    .replace(/\{합계\}/g, fmtWon(r.total))
    .replace(/\{합계한글\}/g, wonToKorean(r.total));
}

export function MessageScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [help, setHelp] = useState(false);
  const [results, setResults] = useState<MessagePartner[]>([]);
  const [searched, setSearched] = useState(false);

  const [confirmTpl, setConfirmTpl] = useState(DEFAULT_CONFIRM);
  const [shipTpl, setShipTpl] = useState(DEFAULT_SHIP);
  const [tplOpen, setTplOpen] = useState(false);
  const [editKind, setEditKind] = useState<TplKind>('confirm');
  const [savingTpl, setSavingTpl] = useState(false);

  const [activeKind, setActiveKind] = useState<TplKind>('confirm');
  const [bodies, setBodies] = useState<Record<number, string>>({});

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setConfirmTpl(s.msg_tpl_confirm || DEFAULT_CONFIRM);
      setShipTpl(s.msg_tpl_ship || DEFAULT_SHIP);
    }).catch(() => {});
  }, []);

  const generate = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ from, to });
      if (partnerId) qs.set('partner_id', String(partnerId));
      setResults(await api.get<MessagePartner[]>(`/api/message?${qs.toString()}`));
      setSearched(true);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, partnerId, toast]);

  useEffect(() => { generate(); }, [generate]);

  useEffect(() => {
    const tpl = activeKind === 'confirm' ? confirmTpl : shipTpl;
    const next: Record<number, string> = {};
    results.forEach(r => { next[r.partner_id] = substitute(tpl, r); });
    setBodies(next);
    // 결과·활성 템플릿 종류·저장된 템플릿 본문이 바뀔 때만 재계산한다(카드별 직접 수정은 그 사이에만 유지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, activeKind]);

  const saveTpl = async (kind: TplKind) => {
    setSavingTpl(true);
    try {
      const key = kind === 'confirm' ? 'msg_tpl_confirm' : 'msg_tpl_ship';
      const val = kind === 'confirm' ? confirmTpl : shipTpl;
      await api.put('/api/settings', { [key]: val });
      toast.show('템플릿이 저장되었습니다.');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSavingTpl(false);
    }
  };

  const copy = async (pid: number) => {
    try {
      await navigator.clipboard.writeText(bodies[pid] ?? '');
      toast.show('클립보드에 복사되었습니다.');
    } catch {
      toast.show('복사에 실패했습니다.', 'error');
    }
  };

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <input className="input lookup" style={{ width: 160 }} readOnly value={partnerName}
            placeholder="거래처(전체)" onClick={() => setHelp(true)} />
          {partnerName && (
            <button className="icon-btn" title="거래처 선택 해제" onClick={() => { setPartnerId(null); setPartnerName(''); }}>✕</button>
          )}
          <button className="btn r8-primary" onClick={generate}>생성</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setTplOpen(o => !o)}>{tplOpen ? '템플릿 편집 닫기' : '템플릿 편집'}</button>
        </div>
      </div>

      {tplOpen && (
        <div className="msg-templates">
          <div className="msg-tabs">
            <button className={`btn small ${editKind === 'confirm' ? 'primary' : ''}`} onClick={() => setEditKind('confirm')}>주문확인</button>
            <button className={`btn small ${editKind === 'ship' ? 'primary' : ''}`} onClick={() => setEditKind('ship')}>택배안내</button>
          </div>
          <p className="field-hint">치환 가능 항목: {'{거래처명} {내역} {합계} {합계한글}'}</p>
          {editKind === 'confirm' ? (
            <textarea className="input" rows={4} value={confirmTpl} onChange={e => setConfirmTpl(e.target.value)} />
          ) : (
            <textarea className="input" rows={4} value={shipTpl} onChange={e => setShipTpl(e.target.value)} />
          )}
          <div className="voucher-actions" style={{ marginTop: 8 }}>
            <button className="btn r8-primary" disabled={savingTpl} onClick={() => saveTpl(editKind)}>
              {savingTpl ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      <div className="search-group" style={{ margin: '10px 0' }}>
        <span>카드 본문</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="radio" checked={activeKind === 'confirm'} onChange={() => setActiveKind('confirm')} /> 주문확인
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="radio" checked={activeKind === 'ship'} onChange={() => setActiveKind('ship')} /> 택배안내
        </label>
      </div>

      {searched && !results.length && <p className="hint">기간 내 판매 내역이 없습니다</p>}

      <div className="msg-cards">
        {results.map(r => (
          <div key={r.partner_id} className="msg-card">
            <h4>{r.partner_name} <span className="hint" style={{ margin: 0 }}>· 합계 {fmtWon(r.total)}원</span></h4>
            <textarea value={bodies[r.partner_id] ?? ''} onChange={e => setBodies(b => ({ ...b, [r.partner_id]: e.target.value }))} />
            <div className="msg-actions">
              <button className="btn small" onClick={() => copy(r.partner_id)}>복사</button>
            </div>
          </div>
        ))}
      </div>

      {help && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(false)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
    </div>
  );
}
