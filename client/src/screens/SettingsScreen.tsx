import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../api';
import type { Settings } from '../types';

interface EcountStatus { configured: boolean; mode?: string; zone?: string; com_code?: string; hint?: string }

// 환경설정: 회사정보(인쇄용) + 재고/부가세 동작 옵션 + 이카운트 연동
export function SettingsScreen() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [ec, setEc] = useState<EcountStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.get<Settings>('/api/settings').then(setS).catch(e => toast.show(e.message, 'error'));
    api.get<EcountStatus>('/api/ecount/status').then(setEc).catch(() => setEc(null));
  }, [toast]);

  const syncItems = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ ok: boolean; synced: number }>('/api/ecount/sync-items', {});
      toast.show(`이카운트 품목 ${r.synced}건을 가져왔습니다.`);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (!s) return <div className="screen"><p className="hint">불러오는 중...</p></div>;

  const set = (key: string, value: string) => setS({ ...s, [key]: value });

  const save = async () => {
    try {
      await api.put('/api/settings', s);
      toast.show('환경설정이 저장되었습니다.');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  return (
    <div className="screen settings">
      <h3>회사 정보 <span className="hint">(거래명세서/견적서 인쇄에 사용)</span></h3>
      <div className="form-grid" style={{ maxWidth: 720 }}>
        <label><span className="form-label">상호</span>
          <input className="input" value={s.company_name ?? ''} onChange={e => set('company_name', e.target.value)} /></label>
        <label><span className="form-label">대표자</span>
          <input className="input" value={s.company_ceo ?? ''} onChange={e => set('company_ceo', e.target.value)} /></label>
        <label><span className="form-label">사업자번호</span>
          <input className="input" value={s.company_biz_no ?? ''} onChange={e => set('company_biz_no', e.target.value)} /></label>
        <label><span className="form-label">전화번호</span>
          <input className="input" value={s.company_phone ?? ''} onChange={e => set('company_phone', e.target.value)} /></label>
        <label className="span2"><span className="form-label">주소</span>
          <input className="input" value={s.company_address ?? ''} onChange={e => set('company_address', e.target.value)} /></label>
        <label className="span2"><span className="form-label">입금계좌·안내문구 (거래명세서 하단에 표시)</span>
          <textarea className="input" rows={3} placeholder={'예)\n예금주명: ○○○\n계좌번호: (은행) 000-0000-0000\n*귀하의 사업에 번영과 발전을 기원합니다.'}
            value={s.bank_account_info ?? ''} onChange={e => set('bank_account_info', e.target.value)} /></label>
      </div>

      <h3>업무 설정</h3>
      <div className="form-grid" style={{ maxWidth: 720 }}>
        <label><span className="form-label">로스터 1배치 배출량(kg)</span>
          <input className="input" type="number" step={0.5} value={s.batch_kg ?? '5'}
            onChange={e => set('batch_kg', e.target.value)} />
          <span className="field-hint">로스팅시트의 배치 수 = 품목별 주문합계 ÷ 이 값 (올림)</span></label>
        <label><span className="form-label">부가세 원미만 처리</span>
          <select className="input" value={s.vat_round ?? 'floor'} onChange={e => set('vat_round', e.target.value)}>
            <option value="floor">절사 (기본)</option>
            <option value="round">반올림</option>
          </select></label>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={save}>저장</button>
      </div>

      <h3 style={{ marginTop: 28 }}>이카운트 연동 (조회 전용)</h3>
      {ec?.configured ? (
        <div>
          <p className="hint">
            접속정보 확인됨 — 회사코드 {ec.com_code}, {ec.mode} 모드, ZONE {ec.zone}.<br />
            ※ 이카운트에 등록된 공인 IP의 PC에서 실행했을 때만 호출이 성공합니다.
          </p>
          <button className="btn" disabled={syncing} onClick={syncItems}>
            {syncing ? '가져오는 중...' : '이카운트에서 품목 가져오기'}
          </button>
        </div>
      ) : (
        <p className="hint">
          접속정보 없음 — <code>data/ecount.config.json</code> 파일에 COM_CODE / USER_ID / API_CERT_KEY / MODE를 넣으면
          품목 동기화·재고 대사 기능이 켜집니다. (인증키는 커밋/공유 금지)
        </p>
      )}

      <h3 style={{ marginTop: 28 }}>데이터</h3>
      <p className="hint">
        DB 파일: <code>data/erp.sqlite</code> — 이 파일 하나가 전체 데이터입니다. 서버 시작 시마다 <code>data/backup/</code>에 자동 백업(최근 30개)됩니다.<br />
        이카운트 엑셀 이관: 품목/거래처 엑셀을 <code>data/import/</code>에 넣고 <code>node scripts/import-ecount-excel.mjs</code> 실행.
        판매내역(2,052라인) 이관은 Phase 1의 전표 엔진 완성 후 제공됩니다.
      </p>
    </div>
  );
}
