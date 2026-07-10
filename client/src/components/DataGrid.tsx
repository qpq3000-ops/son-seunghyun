import { useEffect, useRef } from 'react';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import type { ColumnDefinition, RowComponent, Options } from 'tabulator-tables';
import * as XLSX from 'xlsx';
import 'tabulator-tables/dist/css/tabulator_simple.min.css';

// Tabulator 엑셀 다운로드 의존성 주입
(window as unknown as { XLSX: typeof XLSX }).XLSX = XLSX;

interface Props<T> {
  columns: ColumnDefinition[];
  data: T[];
  height?: number | string;
  onRowDblClick?: (row: T) => void;
  onRowClick?: (row: T) => void;
  options?: Partial<Options>;
  /** 그리드 인스턴스 노출 (엑셀 다운로드 버튼 등에서 사용) */
  gridRef?: (t: Tabulator | null) => void;
}

export function DataGrid<T>({ columns, data, height = '100%', onRowDblClick, onRowClick, options, gridRef }: Props<T>) {
  const elRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<Tabulator | null>(null);
  const builtRef = useRef(false);
  const dataRef = useRef<T[]>(data);
  dataRef.current = data;

  useEffect(() => {
    if (!elRef.current) return;
    builtRef.current = false;
    const t = new Tabulator(elRef.current, {
      data: dataRef.current as object[],
      columns,
      layout: 'fitDataFill',
      height,
      placeholder: '자료가 없습니다',
      columnDefaults: { headerHozAlign: 'center', vertAlign: 'middle' },
      ...options,
    });
    t.on('tableBuilt', () => { builtRef.current = true; });
    if (onRowDblClick) t.on('rowDblClick', (_e: UIEvent, row: RowComponent) => onRowDblClick(row.getData() as T));
    if (onRowClick) t.on('rowClick', (_e: UIEvent, row: RowComponent) => onRowClick(row.getData() as T));
    tabRef.current = t;
    gridRef?.(t);
    return () => { gridRef?.(null); builtRef.current = false; t.destroy(); tabRef.current = null; };
    // columns/options 변경은 화면 단위에서 key 변경으로 재생성한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = tabRef.current;
    if (!t) return;
    if (builtRef.current) {
      t.setData(data as object[]);
    } else {
      t.on('tableBuilt', () => t.setData(dataRef.current as object[]));
    }
  }, [data]);

  return <div ref={elRef} className="datagrid" />;
}

export type { ColumnDefinition };
