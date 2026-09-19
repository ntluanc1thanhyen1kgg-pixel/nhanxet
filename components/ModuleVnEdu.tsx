import React, { useMemo } from 'react';
import { Student, ExcelMerge } from '../types';
import { FileSpreadsheet, AlertCircle, Grid3X3, ArrowRightLeft } from 'lucide-react';

interface Props {
  students: Student[];
  rawExcelData?: any[][];
  rawExcelMerges?: ExcelMerge[];
}

export const ModuleVnEdu: React.FC<Props> = ({ students, rawExcelData = [], rawExcelMerges = [] }) => {
  const hasRawData = rawExcelData && rawExcelData.length > 0;

  // Determine the max columns to render properly
  const maxCols = useMemo(() => {
    if (!hasRawData) return 0;
    let max = 0;
    for (const row of rawExcelData) {
        if (row && row.length > max) max = row.length;
    }
    return max;
  }, [rawExcelData, hasRawData]);

  // Pre-calculate merge map for performance
  const mergeLookup = useMemo(() => {
      const lookup = new Map<string, { isMain: boolean, rowSpan?: number, colSpan?: number }>();
      for (const merge of rawExcelMerges) {
          const { s, e } = merge;
          for (let r = s.r; r <= e.r; r++) {
              for (let c = s.c; c <= e.c; c++) {
                  const key = `${r},${c}`;
                  if (r === s.r && c === s.c) {
                      lookup.set(key, { isMain: true, rowSpan: e.r - s.r + 1, colSpan: e.c - s.c + 1 });
                  } else {
                      lookup.set(key, { isMain: false });
                  }
              }
          }
      }
      return lookup;
  }, [rawExcelMerges]);

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white rounded-lg border border-gray-200 m-1 border-dashed p-8">
        <FileSpreadsheet size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium">Chưa có dữ liệu hiển thị</p>
        <p className="text-sm">Vui lòng tải lên file Excel từ menu bên trái.</p>
      </div>
    );
  }

  // Generate column indices [0, 1, 2, ..., maxCols - 1]
  const columns = Array.from({ length: maxCols }, (_, i) => i);

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
        <div>
           <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
             <Grid3X3 size={20} className="text-green-600"/>
             Bảng Điểm Gốc (VNedu)
           </h2>
           <p className="text-xs text-gray-500">
             {hasRawData 
               ? `Hiển thị ${rawExcelData.length} dòng x ${maxCols} cột từ file Excel.` 
               : "Chế độ xem tóm tắt (Dữ liệu mẫu)"}
           </p>
        </div>
        {!hasRawData && (
          <div className="text-orange-600 text-xs flex items-center gap-1 bg-orange-50 px-2 py-1 rounded border border-orange-100">
            <AlertCircle size={12}/> Đang xem dữ liệu mẫu
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto relative bg-gray-100 p-1">
        <table 
            className="border-collapse text-sm bg-white shadow-sm table-fixed" 
            style={{ 
                minWidth: 'max-content',
                // Removed contentVisibility to ensure full rendering stability
            }}
        >
          <tbody>
            {hasRawData ? (
              rawExcelData.map((row, rIndex) => (
                <tr key={rIndex} className="hover:bg-yellow-50 transition-colors">
                  {/* Row Index Number - Sticky Left */}
                  <td className="sticky left-0 z-10 w-10 text-center bg-gray-100 border border-gray-300 text-xs text-gray-500 select-none font-mono shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    {rIndex + 1}
                  </td>
                  
                  {columns.map((cIndex) => {
                    const cellValue = row ? row[cIndex] : undefined;
                    const mergeKey = `${rIndex},${cIndex}`;
                    const mergeInfo = mergeLookup.get(mergeKey);
                    
                    // If this cell is part of a merge but not the main cell, skip rendering
                    if (mergeInfo && !mergeInfo.isMain) return null;

                    const isMergedStart = mergeInfo && mergeInfo.isMain;
                    
                    return (
                      <td 
                        key={cIndex} 
                        className={`border border-gray-300 px-2 py-1 text-gray-700 min-w-[80px] whitespace-pre-line break-words align-top ${
                            isMergedStart 
                            ? "bg-blue-100 text-blue-900 font-bold text-center align-middle shadow-sm border-blue-300 z-0" 
                            : ""
                        }`}
                        rowSpan={isMergedStart ? mergeInfo.rowSpan : undefined}
                        colSpan={isMergedStart ? mergeInfo.colSpan : undefined}
                        title={String(cellValue || "")}
                      >
                        {cellValue !== undefined && cellValue !== null ? String(cellValue) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              // Fallback for Mock Data (Simple Table)
              students.map((student, idx) => (
                 <tr key={student.id} className="border-b border-gray-200">
                    <td className="p-4 bg-gray-50 border-r">{idx + 1}</td>
                    <td className="p-4 font-medium">{student.name}</td>
                    <td className="p-4 text-gray-500">{student.className}</td>
                    <td className="p-4 text-gray-400 text-xs italic">Dữ liệu mẫu - Vui lòng tải file thật để xem chi tiết.</td>
                 </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Footer Hint */}
      {hasRawData && (
        <div className="bg-gray-50 border-t border-gray-200 p-1.5 flex justify-center text-[10px] text-gray-400 items-center gap-1">
           <ArrowRightLeft size={10} /> Sử dụng thanh cuộn ngang để xem hết các cột dữ liệu.
        </div>
      )}
    </div>
  );
};