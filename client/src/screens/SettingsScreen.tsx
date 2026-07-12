import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../api';
import type { Settings } from '../types';

interface EcountStatus { configured: boolean; mode?: string; zone?: string; com_code?: string; hint?: string }

// R10-A(§A-2): 기능설정 실물화 — 카테고리 탭(공통/회계/재고/관리/그룹웨어/데이터센터) + 설정 카드.
// 저장은 기존 PUT /api/settings(전 상태 s upsert) 그대로 — 카테고리는 표시(그룹핑) 전용, 서버 변경 없음.
const CATS = ['공통', '회계', '재고', '관리', '그룹웨어', '데이터센터'] as const;
type Cat = typeof CATS[number];

export function SettingsScreen() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [ec, setEc] = useState<EcountStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cat, setCat] = useState<Cat>('공통');

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
      <div className="r10a-cat-tabs">
        {CATS.map(c => (
          <button key={c} className={`r8-pill${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={save}>저장</button>
      </div>

      {cat === '공통' && (
        <div className="r10a-card-grid">
          <div className="r10a-setting-card r10a-card-wide">
            <h4>회사정보</h4>
            <p className="r10a-card-desc">거래명세서/견적서 인쇄에 사용합니다.</p>
            <div className="form-grid">
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
          </div>

          <div className="r10a-setting-card">
            <h4>기본통화</h4>
            <p className="r10a-card-desc">전표·보고서에 사용할 기본 통화입니다.</p>
            <select className="input" value={s.base_currency ?? '원'} onChange={e => set('base_currency', e.target.value)}>
              <option value="원">원(KRW)</option>
            </select>
          </div>

          <div className="r10a-setting-card">
            <h4>표준시</h4>
            <p className="r10a-card-desc">일자·시각 표시 기준 시간대입니다.</p>
            <select className="input" value={s.timezone ?? '서울'} onChange={e => set('timezone', e.target.value)}>
              <option value="서울">서울 (GMT+9)</option>
            </select>
          </div>

          <div className="r10a-setting-card">
            <h4>결제설정</h4>
            <p className="r10a-card-desc">카드결제 대행사(PG) 연동 여부입니다.</p>
            <select className="input" value={s.payment_gateway ?? '사용(KICC)'} onChange={e => set('payment_gateway', e.target.value)}>
              <option value="사용(KICC)">사용(KICC)</option>
              <option value="미사용">미사용</option>
            </select>
          </div>

          <div className="r10a-setting-card r10a-card-wide">
            <h4>이카운트 연동 <span className="hint">(조회 전용)</span></h4>
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
          </div>

          <div className="r10a-setting-card r10a-card-wide">
            <h4>데이터</h4>
            <p className="hint">
              DB 파일: <code>data/erp.sqlite</code> — 이 파일 하나가 전체 데이터입니다. 서버 시작 시마다 <code>data/backup/</code>에 자동 백업(최근 30개)됩니다.<br />
              이카운트 엑셀 이관: 품목/거래처 엑셀을 <code>data/import/</code>에 넣고 <code>node scripts/import-ecount-excel.mjs</code> 실행.
              판매내역(2,052라인) 이관은 Phase 1의 전표 엔진 완성 후 제공됩니다.
            </p>
          </div>
        </div>
      )}

      {cat === '회계' && (
        <div className="r10a-card-grid">
          <div className="r10a-setting-card">
            <h4>부가세율</h4>
            <p className="r10a-card-desc">매출·매입 전표의 부가세 계산율(%)입니다.</p>
            <div className="r10a-card-row">
              <span className="form-label">매출</span>
              <input className="input" type="number" step={1} style={{ width: 70 }}
                value={s.vat_sale_rate ?? '10'} onChange={e => set('vat_sale_rate', e.target.value)} />
              <span className="form-label">매입</span>
              <input className="input" type="number" step={1} style={{ width: 70 }}
                value={s.vat_purchase_rate ?? '10'} onChange={e => set('vat_purchase_rate', e.target.value)} />
            </div>
          </div>

          <div className="r10a-setting-card">
            <h4>부가세 원미만 처리</h4>
            <p className="r10a-card-desc">전표 저장 시 실제 계산에 적용되는 값입니다.</p>
            <select className="input" value={s.vat_round ?? 'floor'} onChange={e => set('vat_round', e.target.value)}>
              <option value="floor">절사 (기본)</option>
              <option value="round">반올림</option>
            </select>
          </div>

          <div className="r10a-setting-card">
            <h4>전표입력방식</h4>
            <p className="r10a-card-desc">표시 전용 — 이후 라운드에서 동작에 반영됩니다.</p>
            <select className="input" value={s.entry_mode ?? '이동/조회 우선적용'} onChange={e => set('entry_mode', e.target.value)}>
              <option value="이동/조회 우선적용">이동/조회 우선적용</option>
              <option value="신규입력 우선적용">신규입력 우선적용</option>
            </select>
          </div>

          <div className="r10a-setting-card">
            <h4>전표상태관리유형</h4>
            <p className="r10a-card-desc">표시 전용 — 결재 상태 관리는 연동 예정입니다.</p>
            <select className="input" value={s.doc_status_type ?? '유형1. 확인처리가능+신규(확인)+수정(유지)'} onChange={e => set('doc_status_type', e.target.value)}>
              <option value="유형1. 확인처리가능+신규(확인)+수정(유지)">유형1. 확인처리가능+신규(확인)+수정(유지)</option>
              <option value="유형2. 확인처리불가">유형2. 확인처리불가</option>
            </select>
          </div>

          <div className="r10a-setting-card">
            <h4>권한적용범위(전표상태)</h4>
            <p className="r10a-card-desc">표시 전용 — 권한 관리는 연동 예정입니다.</p>
            <select className="input" value={s.doc_status_scope ?? '미확인/확인'} onChange={e => set('doc_status_scope', e.target.value)}>
              <option value="미확인/확인">미확인/확인</option>
              <option value="전체">전체</option>
            </select>
          </div>

          <div className="r10a-setting-card">
            <h4>결재방표시</h4>
            <p className="r10a-card-desc">표시 전용 — 전자결재는 연동 예정입니다.</p>
            <select className="input" value={s.approval_box_display ?? '표시안함'} onChange={e => set('approval_box_display', e.target.value)}>
              <option value="표시안함">표시안함</option>
              <option value="표시">표시</option>
            </select>
          </div>
        </div>
      )}

      {cat === '재고' && (
        <div className="r10a-card-grid">
          <div className="r10a-setting-card">
            <h4>로스터 1배치 배출량(kg)</h4>
            <p className="r10a-card-desc">로스팅시트의 배치 수 = 품목별 주문합계 ÷ 이 값 (올림)</p>
            <input className="input" type="number" step={0.5} value={s.batch_kg ?? '5'}
              onChange={e => set('batch_kg', e.target.value)} />
          </div>

          <div className="r10a-setting-card">
            <h4>마이너스 재고 경고</h4>
            <p className="r10a-card-desc">재고가 0 미만이 되는 전표 저장 시 경고 표시 여부입니다.</p>
            <select className="input" value={s.neg_stock_warn ?? '사용'} onChange={e => set('neg_stock_warn', e.target.value)}>
              <option value="사용">사용</option>
              <option value="미사용">미사용</option>
            </select>
          </div>
        </div>
      )}

      {cat === '관리' && (
        <div className="r10a-card-grid">
          <div className="r10a-setting-card">
            <h4>급여 자동분개</h4>
            <p className="r10a-card-desc">급여대장 확정 시 회계 전표 자동 생성 — 연동 예정입니다.</p>
            <select className="input" value={s.payroll_auto_gl ?? '미사용'} onChange={e => set('payroll_auto_gl', e.target.value)}>
              <option value="미사용">미사용</option>
              <option value="사용">사용</option>
            </select>
          </div>
        </div>
      )}

      {cat === '그룹웨어' && (
        <div className="r10a-card-grid">
          <div className="r10a-setting-card">
            <h4>결재선 기본값</h4>
            <p className="r10a-card-desc">전자결재 기안 시 자동 적용될 결재선 — 연동 예정입니다.</p>
            <select className="input" value={s.approval_line_default ?? '미설정'} onChange={e => set('approval_line_default', e.target.value)}>
              <option value="미설정">미설정</option>
            </select>
          </div>
        </div>
      )}

      {cat === '데이터센터' && (
        <div className="r10a-card-grid">
          <div className="r10a-setting-card">
            <h4>수집데이터 자동반영</h4>
            <p className="r10a-card-desc">거래명세서/견적서/발주서 수집 데이터를 전표에 자동 반영 — 연동 예정입니다.</p>
            <select className="input" value={s.datacenter_auto ?? '미사용'} onChange={e => set('datacenter_auto', e.target.value)}>
              <option value="미사용">미사용</option>
              <option value="사용">사용</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
