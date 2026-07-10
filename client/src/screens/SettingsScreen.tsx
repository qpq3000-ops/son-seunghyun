import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../api';
import type { Settings } from '../types';

// 환경설정: 회사정보(인쇄용) + 재고/부가세 동작 옵션
export function SettingsScreen() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);

  useEffect(() => {
    api.get<Settings>('/api/settings').then(setS).catch(e => toast.show(e.message, 'error'));
  }, [toast]);

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

      <h3 style={{ marginTop: 28 }}>데이터</h3>
      <p className="hint">
        DB 파일: <code>data/erp.sqlite</code> — 이 파일 하나가 전체 데이터입니다. 서버 시작 시마다 <code>data/backup/</code>에 자동 백업(최근 30개)됩니다.<br />
        기존 로스팅 주문관리 앱(JSON 백업) 이관은 Phase 1에서 [설정 &gt; 데이터 이관] 메뉴로 제공됩니다.
      </p>
    </div>
  );
}
