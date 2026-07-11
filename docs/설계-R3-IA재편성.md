# 설계 — R3 IA 재편성 + MyPage + C그룹 (100% 완성 플랜)

> 승인 플랜(`/root/.claude/plans/100-dazzling-pnueli.md`) R3 라운드 상세 설계.
> **범위 4가지**: ① 이카운트식 대메뉴 재편성(서브그룹) ② MyPage 위젯 대시보드 ③ 사원(담당자) 마스터 + 전표 담당자 ④ 판매입력 버튼 행.
> **불변식**: 기존 61개 메뉴 **id 전부 동결**(localStorage 즐겨찾기 `erp_favorites` 보존). 화면 컴포넌트는 props 없이 마운트되므로 **무수정 재배치**. 마이그레이션 번호는 R3=**007** 선점(R4=008, R5=009).
> **서버 작업 최소화**: 신규 로직은 사원 CRUD(마스터 1객체) + `/api/mypage` 1개 + `doc.emp_id` 뿐. 재고불러오기·이익계산·찾기 팝업은 **기존 엔드포인트만** 사용(신규 서버 0).
> **DDL 검증**: `data/erp.sqlite` 사본에 007 적용 → employee 생성·`doc.emp_id` FK 부착·기존 전표 NULL·`foreign_key_check` 0건·잘못된 emp_id FK 거부 확인 완료(§3.1 하단).

---

## 0. 산출물 요약 (파일별 · 서버/클라 겹침 0)

| 담당 | 파일 | 작업 | 신규? |
|---|---|---|---|
| 서버 | **신규** `server/migrations/007_employee.sql` | employee 테이블 + `doc.emp_id` | ✅ |
| 서버 | `server/masters.mjs` | `TABLES`에 `employees` 1객체 추가(~6줄) → CRUD 자동 | |
| 서버 | **신규** `server/mypage.mjs` | `GET /api/mypage` 1개(위젯 통합) | ✅ |
| 서버 | `server/index.mjs` | import 1줄 + `app.route('/api', mypage)` 1줄 | |
| 서버 | `server/vouchers.mjs` | `loadDocDetail` SELECT·POST INSERT·PUT UPDATE에 `emp_id` 3곳 | |
| 클라 | `client/src/menus.tsx` | `MenuDef.subgroup`·`m()` 6번째 인자·`MENU_GROUPS`·`SUBGROUP_ORDER`·61개 재배치 + 사원등록 1개 | |
| 클라 | `client/src/App.tsx` | 서브탭 스트립 + 2단 사이드바(서브그룹 섹션) + 사이트맵 중첩 + 파생 subgroup 상태 | |
| 클라 | `client/src/styles.css` | `.subtabs`·`.side-section`·`.widget.neg`·미수금/달력 위젯 스타일 | |
| 클라 | `client/src/screens/Dashboard.tsx` | `/api/mypage` 1콜 위젯 대시보드로 **전면 교체** | |
| 클라 | `client/src/screens/masters.tsx` | `EmployeeMaster` export 추가(MasterScreen 재사용) | |
| 클라 | `client/src/screens/VoucherScreen.tsx` | 판매 버튼 행 5개 + 담당자 필드 + 3모달 연결 | |
| 클라 | `client/src/components/VoucherForm.tsx` | `VoucherHeader`에 emp 필드 + `showEmp` prop 렌더 | |
| 클라 | **신규** `components/StockPickModal.tsx`·`ProfitCalcModal.tsx`·`DocFindModal.tsx` | 재고불러오기·이익계산·찾기(F3) | ✅ |
| 클라 | `client/src/types.ts` | `Doc.emp_id/emp_name`·`Employee`·`MyPageData` | |

> 서버가 만지는 파일: 007·masters·mypage(신규)·index·vouchers. 클라가 만지는 파일: menus·App·styles·Dashboard·masters(tsx)·VoucherScreen·VoucherForm·모달3·types. **교집합 없음**.

---

## 1. 대메뉴 재편성 — 61개 메뉴 새 배치표 (deliverable ①)

### 1.1 대메뉴(9) · 서브그룹 순서

```ts
// menus.tsx
export const MENU_GROUPS = [
  'MyPage', '재고Ⅰ', '재고Ⅱ', '회계Ⅰ', '회계Ⅱ', '관리', '세무', '그룹웨어', 'Self-Customizing',
];
// 서브그룹을 갖는 대메뉴는 현재 재고Ⅰ 하나. 순서는 이카운트 실화면 그대로.
export const SUBGROUP_ORDER: Record<string, string[]> = {
  '재고Ⅰ': ['기초등록', '영업관리', '구매관리', '생산·외주', '기타이동', '출력물'],
};
```

- **관리 / 세무**: R4·R5 전용. **그룹만 예약**(MENU_GROUPS에 존재, 소속 메뉴 0개). 대메뉴 버튼은 `dim` + `title="R4·R5 예정"`, 클릭 시 no-op(§2.4).
- **재고Ⅱ**: 로트조회 1개(로트/시리얼 고급 재고). R4·R5에서 추가 여지.

### 1.2 배치표 — 현행 61개 전량 (동결 id 그대로)

`대시보드→MyPage`, `영업/구매/생산/재고→재고Ⅰ(6서브그룹)`, `회계→회계Ⅰ`, `자금현황→회계Ⅱ`, `일정→그룹웨어`, `설정→Self-Customizing`.

| # | id (동결) | 메뉴명 | 현 그룹 | **새 대메뉴** | **서브그룹** | 컴포넌트 | phase |
|---|---|---|---|---|---|---|---|
| 1 | `dashboard` | 메인 대시보드 | 대시보드 | **MyPage** | — | Dashboard(교체) | 0 |
| — | `employee` ⭐신규 | 사원등록 | — | **재고Ⅰ** | 기초등록 | EmployeeMaster | 0 |
| 2 | `item` | 품목등록 | 기초등록 | 재고Ⅰ | 기초등록 | ItemMaster | 0 |
| 3 | `partner` | 거래처등록 | 기초등록 | 재고Ⅰ | 기초등록 | PartnerMaster | 0 |
| 4 | `warehouse` | 창고등록 | 기초등록 | 재고Ⅰ | 기초등록 | WarehouseMaster | 0 |
| 5 | `price` | 단가관리 | 기초등록 | 재고Ⅰ | 기초등록 | PriceSpecialScreen | 0 |
| 6 | `project` | 프로젝트등록 | 기초등록 | 재고Ⅰ | 기초등록 | ProjectMaster | 0 |
| 7 | `quote` | 견적서입력/조회 | 영업 | 재고Ⅰ | 영업관리 | QuoteList | 1 |
| 8 | `order` | 주문서입력/조회 | 영업 | 재고Ⅰ | 영업관리 | OrderList | 1 |
| 9 | `sale` | 판매입력 | 영업 | 재고Ⅰ | 영업관리 | SaleInput | 1 |
| 10 | `sale-status` | 판매조회 | 영업 | 재고Ⅰ | 영업관리 | SaleList | 1 |
| 11 | `receipt` | 수금입력 | 영업 | 재고Ⅰ | 영업관리 | ReceiptScreen | 1 |
| 12 | `receivable` | 미수금현황 | 영업 | 재고Ⅰ | 영업관리 | ReceivableScreen | 1 |
| 13 | `statement-print` | 거래명세서인쇄 | 영업 | 재고Ⅰ | 영업관리 | StatementPrint | 1 |
| 14 | `message` | 거래처 메시지 | 영업 | 재고Ⅰ | 영업관리 | MessageScreen | 4 |
| 15 | `po` | 발주서입력/조회 | 구매 | 재고Ⅰ | 구매관리 | PurchaseOrderList | 1 |
| 16 | `purchase` | 구매입력 | 구매 | 재고Ⅰ | 구매관리 | PurchaseInput | 1 |
| 17 | `purchase-status` | 구매조회 | 구매 | 재고Ⅰ | 구매관리 | PurchaseList | 1 |
| 18 | `payment` | 지불입력 | 구매 | 재고Ⅰ | 구매관리 | PaymentScreen | 1 |
| 19 | `payable` | 미지급금현황 | 구매 | 재고Ⅰ | 구매관리 | PayableScreen | 1 |
| 20 | `bean-price` | 생두 단가비교 | 구매 | 재고Ⅰ | 구매관리 | BeanPriceScreen | 4 |
| 21 | `bom` | BOM등록 | 생산 | 재고Ⅰ | 생산·외주 | BomScreen | 2 |
| 22 | `roast-sheet` | 로스팅 입력 | 생산 | 재고Ⅰ | 생산·외주 | RoastInput | 1 |
| 23 | `prod-in` | 생산입고 | 생산 | 재고Ⅰ | 생산·외주 | ProdInScreen | 2 |
| 24 | `prod-status` | 생산현황/수율분석 | 생산 | 재고Ⅰ | 생산·외주 | ProductionStatus | 2 |
| 25 | `mrp` | 소요량계산 | 생산 | 재고Ⅰ | 생산·외주 | MrpScreen | 2 |
| 26 | `move` | 창고이동 | 재고 | 재고Ⅰ | 기타이동 | StockMove | 1 |
| 27 | `self-use` | 자가사용 | 재고 | 재고Ⅰ | 기타이동 | SelfUse | 1 |
| 28 | `defect` | 불량처리 | 재고 | 재고Ⅰ | 기타이동 | Defect | 1 |
| 29 | `adjust` | 재고조정 | 재고 | 재고Ⅰ | 기타이동 | StockAdjust | 1 |
| 30 | `stock-status` | 재고현황 | 재고 | 재고Ⅰ | 출력물 | StockStatus | 1 |
| 31 | `stock-wh` | 창고별재고현황 | 재고 | 재고Ⅰ | 출력물 | StockByWarehouse | 1 |
| 32 | `stock-ledger` | 재고수불부 | 재고 | 재고Ⅰ | 출력물 | StockLedger | 1 |
| 33 | `stock-flow` | 재고변동표 | 재고 | 재고Ⅰ | 출력물 | R('stock-flow') | 6 |
| 34 | `other-moves` | 기타이동현황 | 재고 | 재고Ⅰ | 출력물 | R('other-moves') | 6 |
| 35 | `profit-status` | 이익현황 | 재고 | 재고Ⅰ | 출력물 | R('profit-status') | 5 |
| 36 | `sales-summary` | 판매구매 집계표 | 영업 | 재고Ⅰ | 출력물 | R('sales-summary') | 6 |
| 37 | `order-missing` | 미주문현황 | 영업 | 재고Ⅰ | 출력물 | R('order-missing') | 6 |
| 38 | `quote-status` | 견적서현황 | 영업 | 재고Ⅰ | 출력물 | R('quote-status') | 6 |
| 39 | `order-status` | 주문서현황 | 영업 | 재고Ⅰ | 출력물 | R('order-status') | 6 |
| 40 | `po-status` | 발주서현황 | 구매 | 재고Ⅰ | 출력물 | R('po-status') | 6 |
| 41 | `receipt-status` | 수금현황 | 영업 | 재고Ⅰ | 출력물 | R('receipt-status') | 5 |
| 42 | `payment-status` | 지급현황 | 구매 | 재고Ⅰ | 출력물 | R('payment-status') | 5 |
| 43 | `lot` | 로트조회 | 재고 | **재고Ⅱ** | — | LotScreen | 2 |
| 44 | `vat-book` | 매입매출장(부가세) | 회계 | **회계Ⅰ** | — | VatBook | 3 |
| 45 | `journal` | 분개장 | 회계 | 회계Ⅰ | — | JournalScreen | 3 |
| 46 | `gl-entry` | 일반전표(경비) | 회계 | 회계Ⅰ | — | GlEntryScreen | 3 |
| 47 | `acct-ledger` | 계정별원장 | 회계 | 회계Ⅰ | — | R('acct-ledger') | 5 |
| 48 | `general-ledger` | 총계정원장 | 회계 | 회계Ⅰ | — | R('general-ledger') | 5 |
| 49 | `cashbook` | 현금출납장 | 회계 | 회계Ⅰ | — | R('cashbook') | 5 |
| 50 | `partner-ledger` | 거래처원장 | 회계 | 회계Ⅰ | — | PartnerLedger | 3 |
| 51 | `trial-balance` | 합계잔액시산표 | 회계 | 회계Ⅰ | — | R('trial-balance') | 5 |
| 52 | `income-statement` | 손익계산서 | 회계 | 회계Ⅰ | — | PnlStatement | 5 |
| 53 | `monthly-pl` | 월별손익 | 회계 | 회계Ⅰ | — | MonthlyPL | 3 |
| 54 | `account` | 계정과목 | 기초등록 | 회계Ⅰ | — | AccountMaster | 3 |
| 55 | `cash` | 자금현황 | 회계 | **회계Ⅱ** | — | CashScreen | 3 |
| 56 | `calendar` | 달력(로스팅/납기) | 일정 | **그룹웨어** | — | CalendarScreen | 2 |
| 57 | `memo` | 메모 | 일정 | 그룹웨어 | — | (Placeholder) | 4 |
| 58 | `settings` | 환경설정 | 설정 | **Self-Customizing** | — | SettingsScreen | 0 |
| 59 | `io` | 엑셀 업로드/다운로드 | 설정 | Self-Customizing | — | (Placeholder) | 4 |
| 60 | `backup` | 백업/복원 | 설정 | Self-Customizing | — | (Placeholder) | 4 |
| 61 | `migrate` | 기존앱 데이터 이관 | 설정 | Self-Customizing | — | (Placeholder) | 1 |

**대메뉴별 집계(기존 61)**: MyPage 1 · 재고Ⅰ **41** · 재고Ⅱ 1 · 회계Ⅰ 11 · 회계Ⅱ 1 · 관리 0 · 세무 0 · 그룹웨어 2 · Self-Customizing 4 = **61** ✓ (사원등록 1개 신규 = 62).

**재고Ⅰ 서브그룹별 집계**: 기초등록 5(+사원 1) · 영업관리 8 · 구매관리 6 · 생산·외주 5 · 기타이동 4 · 출력물 13 = 41(+1).

> **배치 근거(이카운트 실화면)**: 입력·거래 화면은 해당 서브그룹(판매입력·수금입력→영업관리), **모든 현황·집계·장부형 보고서는 출력물**(재고현황·집계표·수불부·미주문/견적/주문/발주현황·수금/지급현황·이익현황·재고변동표). 단 `prod-status`(생산현황/수율)는 생산 라인과 붙어 다니는 실무 관행상 **생산·외주** 유지. `account`(계정과목)는 회계 기초라 **회계Ⅰ**. `statement-print`(거래명세서인쇄)는 판매 직후 발행하는 액션이라 **영업관리**.

### 1.3 `menus.tsx` MenuDef·헬퍼 확장

```ts
export interface MenuDef {
  id: string;
  group: string;
  name: string;
  component: ComponentType;
  phase: number;
  implemented: boolean;
  subgroup?: string;   // ← 신규(선택). 재고Ⅰ 소속 메뉴만 값을 가짐
}

// 6번째 인자로 subgroup을 받는다(재고Ⅰ 항목은 항상 component가 있으므로 위치 충돌 없음)
const m = (id, group, name, phase, component?, subgroup?): MenuDef => ({
  id, group, name, phase,
  implemented: !!component,
  component: component ?? ph(name, phase),
  subgroup,
});
```

- MENUS 배열은 **위 배치표 순서대로 재작성**(재고Ⅰ 블록을 6서브그룹 순으로 정렬 → 서브탭/사이드바 순서가 배열 순서로 자연 파생).
- 예: `m('sale', '재고Ⅰ', '판매입력', 1, SaleInput, '영업관리')`, `m('stock-status', '재고Ⅰ', '재고현황', 1, StockStatus, '출력물')`, `m('journal', '회계Ⅰ', '분개장', 3, JournalScreen)`(subgroup 없음), `m('memo', '그룹웨어', '메모', 4)`.
- `findMenu`는 그대로. `phase`/`implemented`는 무변경(즐겨찾기·미구현 표기 로직 재사용).

---

## 2. App.tsx 변경 스펙 (deliverable ②)

현 `App.tsx`는 3단(즐겨찾기바 → 로고/대메뉴바 → [사이드바+콘텐츠]). R3는 **로고/대메뉴바와 본문 사이에 서브탭 스트립**을 끼우고, 사이드바를 **서브그룹 섹션**으로 바꾼다. 변경은 ~50줄, 나머지 그대로.

### 2.1 파생 상태(서브탭) — 단일 진실원 = `activeId` + `subOverride`

```tsx
const menu = findMenu(activeId) ?? MENUS[0];
const activeGroup = menu.group;
const groupItems = useMemo(() => MENUS.filter(x => x.group === activeGroup), [activeGroup]);

// 현재 대메뉴가 갖는 서브그룹 목록(정의 순서 우선, 없으면 배열 등장 순서)
const subgroups = useMemo(() => {
  const present = [...new Set(groupItems.map(x => x.subgroup).filter(Boolean))] as string[];
  const order = SUBGROUP_ORDER[activeGroup];
  return order ? order.filter(s => present.includes(s)) : present;
}, [groupItems, activeGroup]);

// 서브탭 브라우징용 override. 실제 네비게이션(open) 시 null로 리셋 → 활성 메뉴의 subgroup으로 재동기화
const [subOverride, setSubOverride] = useState<string | null>(null);
const activeSubgroup =
  (subOverride && subgroups.includes(subOverride)) ? subOverride
  : (menu.subgroup ?? subgroups[0] ?? null);

// 사이드바에 그릴 항목: 서브그룹이 있으면 활성 서브그룹만, 없으면 그룹 전체(현행 동작)
const sideItems = useMemo(
  () => subgroups.length ? groupItems.filter(x => x.subgroup === activeSubgroup) : groupItems,
  [groupItems, subgroups.length, activeSubgroup],
);
```

`open()`은 `setSubOverride(null)` 한 줄만 추가:
```tsx
const open = useCallback((id: string) => {
  setActiveId(id); setSubOverride(null); setSitemap(false); setQ('');
}, []);
```
→ 즐겨찾기/검색/사이트맵/서브탭 어디서 열든 `activeSubgroup`이 **열린 메뉴의 subgroup으로 자동 정렬**된다. 서브탭만 눌러 목록을 "구경"할 때는 `setSubOverride(sg)`로 콘텐츠 화면은 그대로 두고 사이드바 목록만 바뀐다(이카운트 동일).

### 2.2 서브탭 스트립 (로고/대메뉴바 아래, `.body` 위)

```tsx
{subgroups.length > 0 && (
  <div className="subtabs">
    {subgroups.map(sg => (
      <button
        key={sg}
        className={sg === activeSubgroup ? 'on' : ''}
        onClick={() => setSubOverride(sg)}>
        {sg}
      </button>
    ))}
  </div>
)}
```
- 서브그룹이 없는 대메뉴(회계Ⅰ/회계Ⅱ/재고Ⅱ/그룹웨어/Self-Customizing)는 스트립 자체가 렌더되지 않음 → 현행 레이아웃 유지.

### 2.3 사이드바 2단 — 서브그룹 섹션

```tsx
<aside className="sidebar">
  {subgroups.length > 0 && <div className="side-section">{activeSubgroup}</div>}
  {sideItems.map(x => ( /* 기존 side-item 렌더 그대로 (side-link + star + phase-tag) */ ))}
</aside>
```
- 사이드바는 `groupItems`가 아니라 **`sideItems`**를 순회(딱 한 줄 교체). "좌측 트리 = 서브그룹별 섹션": 상단 `.side-section` 헤더가 현재 서브그룹명을 표기하고, 그 아래 해당 서브그룹 메뉴만 나열. 서브탭으로 섹션을 전환한다.
- `activeId`가 다른 서브그룹의 메뉴여도 `open()`이 subOverride를 리셋하므로 사이드바는 항상 활성 메뉴가 속한 섹션을 보여준다(선택 하이라이트 `side-item.on` 정상 동작).
- star(즐겨찾기)·phase-tag·`side-dot` 로직 **전부 무수정 재사용**.

### 2.4 대메뉴 바 — 빈 그룹(관리/세무) 처리

```tsx
{MENU_GROUPS.map(g => {
  const first = MENUS.find(x => x.group === g);
  return (
    <button key={g}
      className={`${g === activeGroup ? 'on' : ''} ${first ? '' : 'reserved'}`}
      title={first ? undefined : 'R4·R5에서 추가될 메뉴 자리입니다'}
      onClick={() => { if (first) open(first.id); }}>
      {g}
    </button>
  );
})}
```
- 관리/세무는 `first === undefined` → `reserved`(dim) 표시 + 클릭 no-op. `activeGroup`은 실제 메뉴를 열 때만 바뀌므로 빈 그룹이 활성화될 일이 없다(콘텐츠·사이드바 항상 유효).
- 로고(`open('dashboard')`)·환경설정 아이콘(`open('settings')`)은 id 동결이라 무수정.

### 2.5 사이트맵 오버레이 — 서브그룹 중첩

```tsx
{MENU_GROUPS.map(g => {
  const items = MENUS.filter(x => x.group === g);
  const subs = SUBGROUP_ORDER[g]?.filter(s => items.some(x => x.subgroup === s));
  return (
    <div key={g} className="sitemap-group">
      <h3>{g}</h3>
      {!items.length && <span className="sm-reserved">R4·R5 예정</span>}
      {subs?.length
        ? subs.map(sg => (
            <div key={sg} className="sitemap-sub">
              <h4>{sg}</h4>
              {items.filter(x => x.subgroup === sg).map(renderSitemapBtn)}
            </div>
          ))
        : items.map(renderSitemapBtn)}
    </div>
  );
})}
```
- `renderSitemapBtn` = 기존 `<button ... onClick={()=>open(x.id)}>` 그대로(미구현 `dim`·phase-tag 포함). 재고Ⅰ 컬럼만 서브그룹 소제목(`h4`)으로 나뉜다.

### 2.6 즐겨찾기 호환 (변경 없음 = 핵심)

- 저장 키 `erp_favorites`, 저장 단위 = **메뉴 id**. 61개 id 전부 동결 → 기존 사용자의 즐겨찾기 **그대로 유효**, 마이그레이션 불필요.
- favbar의 `findMenu(id)`·`open(id)` 무수정. 즐겨찾기 메뉴가 서브그룹 소속이어도 `open()`이 대메뉴/서브그룹을 자동 동기화(§2.1)하므로 클릭 즉시 올바른 위치로 진입.
- star 토글(`toggleFav`) 무수정.

### 2.7 검색(메뉴검색) — 무수정

`results = MENUS.filter(x => x.name.includes(t) || x.group.includes(t))`. 새 그룹명(재고Ⅰ 등)으로도 검색되며, 필요 시 `|| (x.subgroup ?? '').includes(t)` 한 줄 가산 가능(선택). 선택 시 `open()`이 위치 동기화.

---

## 3. 마이그레이션 007 + API 계약 (deliverable ③)

### 3.1 `server/migrations/007_employee.sql` (사본 검증 완료)

```sql
-- 007: 사원(담당자) 마스터 + 전표 담당자 컬럼 (R3)
-- 규칙(001과 동일): 코드/이름 UNIQUE, active로 사용여부. doc에 담당자 emp_id 추가(기존 전표 NULL 허용).
CREATE TABLE employee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 사원코드
  name TEXT NOT NULL,                        -- 사원명(담당자)
  phone TEXT DEFAULT '',                     -- 연락처
  memo TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,         -- 사용
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- doc.emp_id: 담당자(선택). ADD COLUMN + REFERENCES는 기본값 NULL이라 foreign_keys=ON에서도 허용됨.
-- 기존 전표는 전부 NULL로 채워진다(NULL 허용).
ALTER TABLE doc ADD COLUMN emp_id INTEGER REFERENCES employee(id);
CREATE INDEX idx_doc_emp ON doc (emp_id);
```

**사본 검증 결과**(`data/erp.sqlite` 복사본, `foreign_keys=ON`, 트랜잭션 적용):
- employee 테이블 생성 OK, `doc` 컬럼에 `emp_id` 추가 OK(`PRAGMA foreign_key_list(doc)`에 `employee.id` 등록).
- 기존 전표(현재 0건) 및 신규 NULL 전표 정상, `PRAGMA foreign_key_check` **위반 0건**.
- `emp_id=1`(존재) 전표 저장 → 조인 시 사원명 반환. `emp_id=9999`(미존재) 저장 시도 → **FK로 거부**. NULL 저장 → 허용. → 계약대로 동작.
- `db.mjs`의 `migrate()`가 파일명 오름차순으로 1회 적용(006 다음 007). 별도 코드 불필요.

### 3.2 사원 CRUD — `masters.mjs` `TABLES`에 1객체 추가

```js
// server/masters.mjs — TABLES 맵에 추가(기존 for 루프가 GET/POST/PUT/DELETE 자동 생성)
employees: {
  table: 'employee',
  cols: ['code', 'name', 'phone', 'memo', 'active'],
  required: ['code', 'name'],
  label: '사원',
},
```

자동 생성되는 계약(기존 마스터와 동일 규약):

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/employees?q=&active=1` | `code`/`name` LIKE 검색 + `active=1` 필터, `ORDER BY code`. `SELECT *` → `{id,code,name,phone,memo,active,created_at}[]` |
| POST | `/api/employees` | `code`·`name` 필수, UNIQUE 위반 시 `"사원 코드가 이미 존재합니다."` → 201 |
| PUT | `/api/employees/:id` | 화이트리스트 컬럼만 갱신, 필수값 공백 덮어쓰기 차단 |
| DELETE | `/api/employees/:id` | 삭제. 전표가 참조 중이면 FK로 `"연결된 자료가 있어 처리할 수 없습니다."`(friendlySqlError) |

- CodeHelp(담당자 선택)는 `endpoint="/api/employees"` 그대로 사용(행 `{id,code,name}` 필요조건 충족).

### 3.3 `GET /api/mypage` — 위젯 통합(신규 `server/mypage.mjs`)

한 번의 요청으로 MyPage의 모든 위젯 데이터를 반환. **신규 서버 로직은 이 파일 뿐**이며, 전부 기존 테이블 집계(마이그레이션 불필요, 007과 무관하게 동작).

**요청**: `GET /api/mypage` (파라미터 없음. 기준일 = 서버 `todayISO()`, 이번달 = `substr(today,1,7)`).

**응답**:
```jsonc
{
  "ym": "2026/07",                       // 헤더 표기(YYYY/MM)
  "stock": [                             // 재고현황 위젯: |재고|>0, |qty| 내림차순 상위 8
    { "item_id": 12, "item_code": "P001", "item_name": "하우스블렌드", "spec": "1kg",
      "unit": "kg", "qty": -3.5, "below_safety": true }   // qty<0 → 마이너스 강조
  ],
  "sales": [                            // 판매현황 위젯: 이번달 판매 최근 6건
    { "id": 88, "doc_no": "20260711-2", "io_date": "2026-07-11",
      "item_summary": "하우스블렌드 외 2건", "total_qty": 30, "total_supply": 750000,
      "total_vat": 75000, "total_amount": 825000, "partner_name": "카페온리" }
  ],
  "receivables_top": [                  // 미수금 TOP 위젯: balance>0, 내림차순 상위 5
    { "partner_id": 3, "partner_code": "C003", "partner_name": "블루보틀상봉", "balance": 1320000 }
  ],
  "todos": [],                          // To Do: R5 실데이터. 지금은 [] → 클라 '등록된 데이터가 없습니다'
  "calendar": {                         // 달력 미니: 이번달 활동 있는 날짜만
    "year": 2026, "month": 7,
    "days": { "2026-07-11": { "roast_count": 1, "sale_count": 2, "order_due_count": 0 } }
  }
}
```

**서버 집계(전부 기존 SQL 재사용, `server/mypage.mjs` 인라인)**:
- `stock`: `reports.mjs`의 `/stock/status`와 동일 —
  `SELECT i.id item_id,i.code item_code,i.name item_name,i.spec,i.unit,i.safety_qty,
   COALESCE((SELECT SUM(sl.qty) FROM stock_ledger sl WHERE sl.item_id=i.id AND sl.io_date<=?),0) raw_qty FROM item i`
  → JS: `qty=round1(raw)`, `Math.abs(qty)>0.001` 필터, `|qty|` 내림차순, `slice(0,8)`, `below_safety = safety_qty>0 && qty<safety_qty`.
- `sales`: `vouchers.mjs`의 `/docs` 판매 조회 축약 —
  `SELECT d.id,d.doc_no,d.io_date,p.name partner_name,d.total_qty,d.total_supply,d.total_vat,d.total_amount
   FROM doc d LEFT JOIN partner p ON p.id=d.partner_id
   WHERE d.doc_type='sale' AND d.io_date>=? AND d.io_date<=? ORDER BY d.io_date DESC,d.id DESC LIMIT 6`
  + `item_summary`(vouchers.mjs와 동일 lineNames 서브쿼리: 첫 품목명 `+ 외 N건`).
- `receivables_top`: `receipts.mjs`의 `/receivables` 축약 —
  `SELECT p.id partner_id,p.code partner_code,p.name partner_name,
   COALESCE((SELECT SUM(d.total_amount) FROM doc d WHERE d.doc_type='sale' AND d.partner_id=p.id AND d.io_date<=?),0)
   - COALESCE((SELECT SUM(r.amount) FROM receipt r WHERE r.kind='수금' AND r.partner_id=p.id AND r.io_date<=?),0) balance
   FROM partner p`
  → JS: `balance>0` 필터, 내림차순, `slice(0,5)`.
- `calendar`: `reports.mjs`의 `/calendar`와 동일 3쿼리(roast/sale/order-due, `substr(io_date,1,7)=ym`) → `days` 맵.

**index.mjs 등록(2줄)**:
```js
import { mypage } from './mypage.mjs';   // 상단 import 블록
app.route('/api', mypage);               // app.route 블록(다른 route 옆)
```

### 3.4 `doc.emp_id` — `vouchers.mjs` 3곳 (담당자 저장/로드)

- `loadDocDetail` SELECT에 추가: `d.emp_id, e.name AS emp_name` + `LEFT JOIN employee e ON e.id = d.emp_id`.
- `POST /docs` 파싱: `const empId = Number(body.emp_id) || null;` → INSERT 컬럼/값 목록에 `emp_id` 추가.
- `PUT /docs/:id` UPDATE에 `emp_id=?` 추가(같은 empId 파싱).
- 유효성: emp_id는 **선택**(NULL 허용). 미존재 id는 FK가 방어(friendlySqlError로 400). 판매 외 유형(quote/order/purchase/purchase_order)도 헤더에 담당자가 오면 동일 저장(무해). 로스팅(`saveRoast`)은 emp 미전달 → NULL(무변경).

---

## 4. MyPage 위젯 레이아웃 (deliverable ④)

`screens/Dashboard.tsx`를 **전면 교체**(id `dashboard` 동결, 그룹만 MyPage로 이동). 데이터는 `/api/mypage` **1콜**. 기존 위젯 뼈대(`.mypage`/`.widgets`/`.widget`/`widget-table`/`widget-empty`)를 재사용하고 미수금 TOP·달력 미니 2개를 추가.

### 4.1 그리드 배치(이카운트 MyPage 실화면 구성)

```
.widgets (grid-template-columns: 1fr 0.7fr 1.5fr)
┌─────────────┬───────────┬─────────────────┐
│ 재고현황     │ To Do      │ 판매현황         │  ← 판매현황은 .wide (grid-row: span 2)
│ (상위 8)     │ (빈 상태)  │ (이번달 최근 6)   │
├─────────────┼───────────┤                 │
│ 미수금 TOP   │ 달력 미니   │                 │
│ (상위 5)     │ (이번달)   │                 │
└─────────────┴───────────┴─────────────────┘
```
- 헤더: 기존 `.mypage-head`(`< 2026/07 >` + '일정관리') — `ym`을 `/api/mypage`에서 받아 표기.
- `icons`(⟳ ⋯) 위젯 도구 표기 그대로.

### 4.2 위젯별 사양

| 위젯 | 컬럼/내용 | 빈 상태 문구 |
|---|---|---|
| **재고현황** | 품목코드(`.blue` 링크형)·품목명[규격]·재고수량. **qty<0 → `.neg`(빨강 강조)**, below_safety → 보조 표기 | "등록된 데이터가 없습니다." |
| **판매현황**(.wide) | 일자-No.·품목명[규격]·수량·공급가액·부가세·합계·거래처. `io_date` `YYYY/MM/DD` + `-No`(doc_no 뒤 순번) | "이번달 판매 내역이 없습니다. [재고Ⅰ > 영업관리 > 판매입력]에서 시작하세요." |
| **To Do** | R5 실데이터 예정. 지금은 항상 빈 상태 | "등록된 데이터가 없습니다." |
| **미수금 TOP** | 거래처명·미수 잔액(`fmtWon`, 우측정렬). 상위 5 | "미수금이 없습니다." |
| **달력 미니** | 이번달 요일 그리드. 활동 있는 날(`days[date]`)에 점 마커(로스팅=갈색·판매=파랑·납기=주황). 날짜 셀 hover title에 건수 | (마커 없음) |

- **품목코드 링크**: 현행처럼 `.blue` 링크 스타일(시각적 어포던스). 컴포넌트는 props 없이 마운트되어 앱 네비게이션 핸들을 갖지 않으므로 R3에서는 **비네비게이션(표시 전용)** 유지 — 교차화면 이동은 별도 nav 컨텍스트가 필요해 범위 밖(현행 Dashboard와 동일 취급).
- 데이터 페치: `useEffect`에서 `api.get<MyPageData>('/api/mypage')` 1회 → `setData`. 실패 시 각 위젯 빈 상태로 폴백(현행 `.catch(()=>{})` 패턴).

### 4.3 신규 CSS(`styles.css`, 가산)

```css
.widget-table .neg { color: var(--danger); font-weight: 700; }   /* 마이너스 재고 강조 */
.mini-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; font-size: 11px; }
.mini-cal .mc-day { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; border-radius: 4px; color: #555; }
.mini-cal .mc-day.today { background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.mini-cal .mc-dot { display: flex; gap: 2px; margin-top: 1px; }
.mini-cal .mc-dot i { width: 4px; height: 4px; border-radius: 50%; display: inline-block; }
.mc-dot .d-roast { background: #b5651d; } .mc-dot .d-sale { background: var(--accent); } .mc-dot .d-due { background: var(--gold); }
```
- 나머지(`.widgets`/`.widget`/`.widget.wide`/`.widget.slim`/`widget-table`/`widget-empty`)는 **추가 없이 재사용**. 미수금 TOP은 `.widget-table`(2열) 그대로.

---

## 5. 판매입력 버튼 행 (deliverable ⑤)

`VoucherScreen`(kind='sale')의 `headerActions` 슬롯 = VoucherForm의 `.line-toolbar`(헤더와 그리드 사이 = "그리드 위 버튼 행"). 버튼 5개로 교체. **재사용 우선** — 3개는 기존 로직 개명, 신규 실로직은 재고불러오기·이익계산 2개.

### 5.1 버튼 행 구성 (판매 전용, 좌→우)

| 버튼 | 종류 | 동작 | 연결 |
|---|---|---|---|
| **찾기(F3)** | 검색(reuse) | 전표번호/거래처 검색 팝업(판매조회 이동 아님). 선택 시 그 전표 헤더+라인을 현재 폼으로 불러옴(신규 저장용 템플릿) | `DocFindModal`(신규, 얇음) — 기존 `GET /api/docs?type=sale` |
| **거래내역보기** | 개명 | 기존 '지난 주문 복사' 그대로. 선택 거래처의 최근 판매 라인 복사 | `copyRecent()` 무수정, 라벨만 변경 |
| **재고불러오기** | **신규** | 현재고 있는 품목 다중선택 → 라인 추가 | `StockPickModal`(신규) — 기존 `GET /api/stock/status` |
| **이익계산** | **신규** | 현재 라인 판매액−원가 마진 팝업 | `ProfitCalcModal`(신규) — 기존 `GET /api/items`(price_in) |
| **전표불러오기** | 개명 | 기존 '주문서 불러오기' 그대로(주문서→판매 끌어오기, sourceDocId 연결) | `PullSourceModal` 무수정, 라벨만 변경 |

```tsx
// VoucherScreen headerActions (kind==='sale')
<>
  <button className="btn small" onClick={() => setFindOpen(true)}>찾기(F3)</button>
  <button className="btn small" onClick={copyRecent}>거래내역보기</button>
  <button className="btn small" onClick={() => setStockPickOpen(true)}>재고불러오기</button>
  <button className="btn small" onClick={() => setProfitOpen(true)}>이익계산</button>
  <button className="btn small" onClick={() => setPullOpen(true)}>전표불러오기</button>
</>
// kind==='purchase'는 현행 유지: [발주서 불러오기] 1개
```
- 단축키: F3 → `setFindOpen(true)`(VoucherForm의 F8과 별개 리스너, `e.key==='F3'` 시 `e.preventDefault()`). 팝업 열림 중 재진입 방지 가드.

### 5.2 재고불러오기 — `StockPickModal`(신규 클라)

- 열릴 때 `GET /api/stock/status` → `qty !== 0`인 행만(현재고 있는 품목). `mini-table` + Modal 패턴(PullSourceModal 복제 수준).
- 각 행 체크박스 다중선택(전체선택 헤더 체크 포함). 컬럼: ☑·품목코드·품목명[규격]·단위·현재고(`fmtQty`, qty<0 `.neg`).
- `[추가]` 클릭 → 선택 품목을 **현재 라인에 append**:
  ```tsx
  onAdd(selected) {
    const added = selected.map(s => calcLine({
      item_id: s.item_id, item_code: s.item_code, item_name: s.item_name, unit: s.unit,
      qty: 0, price: priceMap.get(s.item_id) ?? 0, supply: 0, vat: 0, memo: '',
    }, header.tax_mode, vatRound));
    // 비어있는 선행 라인(item_id 없는)은 유지, 새 라인 뒤에 append
    setLines(prev => [...prev.filter(l => l.item_id), ...added, emptyLine()]);
  }
  ```
- 단가: 거래처 특별단가(`priceMap`, VoucherScreen 기존 상태) 우선, 없으면 0(싯가) → 사용자가 수량/단가 입력. `stock/status`는 단가를 주지 않으므로 `price_out`은 참조하지 않는다(문서화된 제약).
- Props: `{ partnerId, onAdd, onClose }`. `taxMode`/`vatRound`/`priceMap`은 VoucherScreen에서 계산해 넘기거나, 모달은 원자료만 반환하고 라인 생성은 VoucherScreen에서 수행(권장: 모달은 선택 목록만 반환).

### 5.3 이익계산 — `ProfitCalcModal`(신규 클라)

- 열릴 때 `GET /api/items` 1회 → `Map(item_id → price_in)`(입고단가 = 원가). **순수 클라, 신규 서버 0**.
- 입력: 현재 `lines`(item_id·qty·supply). 라인별 계산:
  - 판매액 = `l.supply`(공급가액)
  - 원가 = `Math.round(priceInMap.get(l.item_id) ?? 0) * l.qty`
  - 마진 = 판매액 − 원가, 마진율 = `판매액>0 ? 마진/판매액*100 : 0`
- 표시(Modal + mini-table): 품목명 · 수량 · 판매액 · 원가 · 마진(마진<0 `.neg`) · 마진율%. 하단 합계 행(판매액 합·원가 합·마진 합·전체 마진율).
- item_id 없는 빈 라인·qty 0은 제외. 닫기 전용(계산 표시 팝업, 저장 없음).
- Props: `{ lines, onClose }`.

### 5.4 찾기(F3) — `DocFindModal`(신규 클라, 얇음/reuse)

- 열릴 때 `GET /api/docs?type=sale`(기존) → 전체 판매 전표 목록(`item_summary`·`partner_name` 포함). 상단 검색 input으로 **클라 필터**(`doc_no` 또는 `partner_name` 부분일치). `mini-table` 재사용.
- 행 선택 → `onLoad(docId)`: VoucherScreen이 `GET /api/docs/:id`로 헤더+라인을 현재 폼에 세팅(`applyPulled`와 유사하되 `sourceDocId`는 세팅하지 않음 = 체인 아님) + 토스트 "전표 OOO 내용을 불러왔습니다(저장 시 신규 전표로 발행됩니다)". 신규 저장 규칙상 원본과 별개의 새 번호로 저장(이카운트 '찾아서 복제 입력' 관행).
- Props: `{ onLoad, onClose }`. 서버 신규 없음(기존 `/api/docs` 재사용)이라 "신규는 재고불러오기·이익계산 2개" 원칙 유지.

### 5.5 담당자(사원) 필드 — 판매입력 헤더(선택)

- `VoucherForm.VoucherHeader`에 `emp_id: number | null; emp_name: string` 추가. `emptyHeader()`(VoucherScreen)에 `emp_id: null, emp_name: ''`.
- VoucherForm에 `showEmp?: boolean` prop. `showEmp`일 때 `vh-fields`(거래유형 다음, `headerExtra`/적요 앞)에 담당자 CodeHelp 필드 렌더:
  ```tsx
  {showEmp && (
    <label>담당자
      <input className="input lookup" readOnly value={header.emp_name}
        placeholder="선택(선택사항)" onClick={() => setHelp({ kind: 'emp' })} />
    </label>
  )}
  // help.kind==='emp' → <CodeHelp title="담당자" endpoint="/api/employees"
  //   onSelect={r => setHeader({ emp_id: r.id, emp_name: r.name })} onClose={...} />
  ```
- VoucherScreen: `showEmp={kind === 'sale'}`. `save()` body에 `emp_id: header.emp_id` 추가. `loadDoc()`(edit)에서 `emp_id: d.emp_id ?? null, emp_name: d.emp_name ?? ''` 세팅.
- 선택 항목이므로 `validate()`는 담당자를 요구하지 않음. 기존 전표(emp NULL) 로드 시 빈칸.

---

## 6. 구현 분담 (deliverable ⑥ · 겹침 0)

### 6.1 서버 소넷 (5파일, 신규 로직 최소)

1. **신규** `server/migrations/007_employee.sql` — §3.1 그대로(검증본).
2. `server/masters.mjs` — `TABLES`에 `employees` 객체 1개 추가(§3.2). 다른 코드 무수정.
3. **신규** `server/mypage.mjs` — `GET /api/mypage`(§3.3). 4블록 SQL은 reports/receipts/vouchers에서 복제(파일 격리).
4. `server/index.mjs` — `import { mypage }` 1줄 + `app.route('/api', mypage)` 1줄.
5. `server/vouchers.mjs` — `emp_id` 3곳(loadDocDetail SELECT+JOIN / POST INSERT / PUT UPDATE), §3.4.

**자가 검증**: 사본 DB로 007 적용→`foreign_key_check` 0건(완료). 사원 CRUD 왕복(POST/PUT/GET/DELETE). `/api/mypage` JSON 형상. emp_id 저장·edit 재로드 라운드. 원본 무변경 원상복구.

### 6.2 클라 소넷 (menus·App·styles·Dashboard·masters·Voucher·모달3·types)

1. `menus.tsx` — `MenuDef.subgroup`·`m()` 6인자·`MENU_GROUPS`·`SUBGROUP_ORDER`·§1.2 순서로 MENUS 재작성 + `EmployeeMaster` import & `m('employee','재고Ⅰ','사원등록',0,EmployeeMaster,'기초등록')`.
2. `App.tsx` — §2(서브탭 스트립·`sideItems`·`.side-section`·빈 그룹·사이트맵 중첩·파생 subgroup). 화면 컴포넌트 마운트부(`<Comp key={activeId}/>`) 무수정.
3. `styles.css` — `.subtabs`/`.subtabs button(.on)`·`.side-section`·`.groupmenu button.reserved`·`.sitemap-sub h4`·`.sm-reserved`·§4.3 위젯 CSS.
4. `screens/Dashboard.tsx` — §4 전면 교체(`/api/mypage` 1콜).
5. `screens/masters.tsx` — `EmployeeMaster` export(MasterScreen: 코드/이름/연락처/사용, columns+fields+defaults).
6. `screens/VoucherScreen.tsx` — §5 버튼 행 5개·모달 상태 3개·F3 리스너·담당자 저장/로드·body.emp_id.
7. `components/VoucherForm.tsx` — `VoucherHeader` emp 필드·`showEmp` prop·`help.kind==='emp'` CodeHelp.
8. **신규** `components/StockPickModal.tsx`·`ProfitCalcModal.tsx`·`DocFindModal.tsx`(§5.2~5.4, Modal+mini-table 재사용).
9. `types.ts` — `Doc.emp_id?/emp_name?`·`Employee`·`MyPageData`(stock/sales/receivables_top/todos/calendar).

**자가 검증**: `tsc` + `vite build`. 서브탭 전환·사이드바 섹션·즐겨찾기 클릭 위치 동기화·빈 그룹 no-op·사이트맵 중첩·MyPage 위젯 렌더·판매입력 5버튼(재고불러오기 다중추가/이익계산 마진/찾기 로드)·담당자 저장 스모크.

### 6.3 파일 교집합 점검

| | 007 | masters.mjs | mypage.mjs | index.mjs | vouchers.mjs | menus | App | styles | Dashboard | masters.tsx | VoucherScreen | VoucherForm | 모달3 | types |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 서버 | ✅ | ✅ | ✅ | ✅ | ✅ | | | | | | | | | |
| 클라 | | | | | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

교집합 0. (`masters.mjs`=서버 / `masters.tsx`=클라 — 별개 파일.)

---

## 7. 리스크 · 결정 메모

- **서브탭 선택 vs 네비게이션**: `open()`이 `subOverride`를 리셋 → activeId가 단일 진실원. 서브탭은 "목록 구경"(subOverride)만, 실제 화면 전환은 사이드바 클릭. 이카운트 동선과 일치하며 파생 상태라 버그 표면적 최소.
- **빈 그룹(관리/세무)**: 대메뉴 지도(플랜의 "이카운트 메뉴 지도 완성") 유지를 위해 노출하되 dim+no-op. R4/R5가 `m(...,'관리'/'세무',...)` 항목만 추가하면 자동 활성.
- **품목코드 링크 비네비게이션**: 컴포넌트 무props 계약 유지가 R3 재편성의 핵심(화면 61개 무수정). 교차이동은 nav 컨텍스트 도입이 필요 → 범위 밖(현행과 동일).
- **재고불러오기 단가**: `stock/status`에 단가 없음 → 특별단가 있으면 적용, 없으면 0(싯가). 사용자 입력 전제(문서화).
- **찾기(F3) 저장 의미**: 불러온 전표는 신규 번호로 저장(복제 입력). sourceDocId 미연결이라 끌어오기 체인과 무간섭.
- **id 동결 불변식**: 61개 id·`erp_favorites`·phase/implemented 전부 무변경 → 즐겨찾기·미구현표기 회귀 없음.
</content>
</invoke>
