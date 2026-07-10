export interface Item {
  id: number;
  code: string;
  name: string;
  spec: string;
  unit: string;
  item_type: '원재료' | '부자재' | '제품' | '상품';
  price_in: number;
  price_out: number;
  safety_qty: number;
  use_lot: 0 | 1;
  is_set: 0 | 1;
  barcode: string;
  memo: string;
  active: 0 | 1;
}

export interface Partner {
  id: number;
  code: string;
  name: string;
  biz_no: string;
  ceo: string;
  phone: string;
  email: string;
  address: string;
  partner_type: '매출' | '매입' | '매출+매입';
  pay_cycle: '당일' | '월별';
  memo: string;
  active: 0 | 1;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  wh_type: '창고' | '공장';
  memo: string;
  active: 0 | 1;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  memo: string;
  active: 0 | 1;
}

export interface PriceSpecial {
  id: number;
  partner_id: number;
  item_id: number;
  price: number;
  memo: string;
  partner_code: string;
  partner_name: string;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_price_out: number;
}

export type Settings = Record<string, string>;
