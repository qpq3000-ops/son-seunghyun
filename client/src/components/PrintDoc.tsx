import { fmtQty, fmtWon } from '../format';
import type { Doc } from '../types';

// 거래명세서/견적서 인쇄 양식 — 브라우저 인쇄(@media print) 방식(설계 4.7). 화면에는 숨겨져 있다가
// window.print() 호출 시에만 보인다(styles.css의 .print-only 규칙).

export interface PrintCompany {
  name: string;
  ceo: string;
  biz_no: string;
  address: string;
  phone: string;
}

interface Props {
  variant: '거래명세서' | '견적서';
  company: PrintCompany;
  doc: Doc;
}

export function PrintDoc({ variant, company, doc }: Props) {
  const dateLabel = variant === '견적서' ? '견적일자' : '일자';

  return (
    <div className="print-only">
      <div className="print-sheet">
        <div className="print-head">
          <div className="print-title">{variant}</div>
          <div className="print-meta">{dateLabel} {doc.io_date} / 전표번호 {doc.doc_no}</div>
        </div>

        <div className="print-parties">
          <div className="print-party">
            <div className="print-party-title">공급자</div>
            <table className="print-party-table">
              <tbody>
                <tr><th>등록번호</th><td>{company.biz_no}</td></tr>
                <tr><th>상호</th><td>{company.name}</td></tr>
                <tr><th>대표자</th><td>{company.ceo}</td></tr>
                <tr><th>주소</th><td>{company.address}</td></tr>
                <tr><th>전화</th><td>{company.phone}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="print-party">
            <div className="print-party-title">공급받는자</div>
            <table className="print-party-table">
              <tbody>
                <tr><th>등록번호</th><td>{doc.partner_biz_no ?? ''}</td></tr>
                <tr><th>상호</th><td>{doc.partner_name ?? ''}</td></tr>
                <tr><th>대표자</th><td>{doc.partner_ceo ?? ''}</td></tr>
                <tr><th>주소</th><td>{doc.partner_address ?? ''}</td></tr>
                <tr><th>전화</th><td>{doc.partner_phone ?? ''}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <table className="print-items">
          <thead>
            <tr>
              <th style={{ width: 32 }}>No</th>
              <th>품명</th>
              <th style={{ width: 80 }}>규격</th>
              <th style={{ width: 70 }}>수량</th>
              <th style={{ width: 90 }}>단가</th>
              <th style={{ width: 100 }}>공급가액</th>
              <th style={{ width: 90 }}>부가세</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td className="num">{i + 1}</td>
                <td>{l.item_name}</td>
                <td>{l.spec ?? ''}</td>
                <td className="num">{fmtQty(l.qty)}</td>
                <td className="num">{fmtWon(l.price)}</td>
                <td className="num">{fmtWon(l.supply_amt)}</td>
                <td className="num">{fmtWon(l.vat_amt)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="num">공급가액계 / 부가세계</td>
              <td className="num"><b>{fmtWon(doc.total_supply)}</b></td>
              <td className="num"><b>{fmtWon(doc.total_vat)}</b></td>
            </tr>
            <tr>
              <td colSpan={7} className="num">총액 <b>{fmtWon(doc.total_amount)}</b>원</td>
            </tr>
          </tfoot>
        </table>

        <p className="print-memo">비고: {doc.memo}</p>

        {variant === '거래명세서' ? (
          <div className="print-sign">인수자 ________________ (서명)</div>
        ) : (
          <p className="print-memo">유효기간 / 결제조건: </p>
        )}
      </div>
    </div>
  );
}
