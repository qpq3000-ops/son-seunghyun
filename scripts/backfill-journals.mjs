// 분개 백필 수동 실행 래퍼 — 기동 시 자동으로 실행되므로 평상시엔 필요 없다.
// 사용: node scripts/backfill-journals.mjs
import { backfillJournals } from '../server/accounting.mjs';

const count = backfillJournals();
console.log(`[분개 백필] 신규 생성 ${count}건`);
