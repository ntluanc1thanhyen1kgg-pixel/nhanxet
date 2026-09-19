import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Student, CommentTemplate } from '../types';
import { Download, Save, Book, Calculator, Languages, Music, Palette, Trophy, Activity, Library, FileText, Monitor, Wrench, Trash2, Tent, Plus } from 'lucide-react';
import { utils, writeFile } from 'xlsx';

interface Props {
  students: Student[];
  onGenerate: (subject: string) => void;
  onUpdateComment: (studentId: string, subject: string, comment: string) => void;
  isProcessing: boolean;
  templates?: CommentTemplate[];
  onDeleteTemplate?: (subject: string, range: string, content: string) => void;
  onAddTemplate?: (subject: string, range: string, content: string) => void; // NEW PROP
}

// Helper to pick an icon based on subject name
const getSubjectIcon = (subjectName: string) => {
  const s = subjectName.toLowerCase();
  if (s.includes('toán')) return <Calculator size={18} />;
  if (s.includes('tiếng việt') || s.includes('văn')) return <Book size={18} />;
  if (s.includes('anh') || s.includes('ngoại ngữ')) return <Languages size={18} />;
  if (s.includes('nhạc') || s.includes('hát') || s === 'an') return <Music size={18} />;
  if (s.includes('mỹ thuật') || s.includes('vẽ') || s === 'mt') return <Palette size={18} />;
  // GDTC
  if (s.includes('thể dục') || s.includes('giáo dục thể chất') || s === 'gdtc' || s === 'td' || s === 'thể thao') return <Activity size={18} />;
  // HĐTN (New)
  if (s.includes('trải nghiệm') || s.includes('hđtn') || s === 'hđtn&hn') return <Tent size={18} />;
  
  if (s.includes('đạo đức') || s.includes('lịch sử') || s.includes('khoa học') || s.includes('địa lý') || s === 'ls&đl' || s === 'ls-đl' || s === 'tn&xh') return <Trophy size={18} />;
  if (s.includes('tin học') || s.includes('máy tính') || s === 'th-cn' || s.includes('tin')) return <Monitor size={18} />;
  if (s.includes('công nghệ') || s.includes('kỹ thuật') || s === 'cn' || s === 'kt') return <Wrench size={18} />;
  return <Book size={18} />;
};

// Helper for Alias Matching (Subject Name Matching)
const isSubjectMatch = (templateSubject: string, selectedSubject: string) => {
    const tSub = templateSubject.toLowerCase().trim();
    const sSub = selectedSubject.toLowerCase().trim();
    
    // 1. Direct match
    if (tSub === sSub) return true;
    
    // 2. Explicit Aliases
    if (tSub === 'giáo dục thể chất' && (sSub === 'gdtc' || sSub === 'thể dục' || sSub.includes('thể dục') || sSub.includes('thể chất') || sSub === 'td' || sSub === 'thể thao')) return true;
    if (tSub === 'tin học' && (sSub === 'th-cn' || sSub === 'tin' || sSub.includes('tin học') || sSub.includes('máy tính'))) return true;
    if (tSub === 'công nghệ' && (sSub === 'cn' || sSub === 'kỹ thuật' || sSub.includes('công nghệ'))) return true;
    if (tSub === 'lịch sử và địa lý' && (sSub === 'ls&đl' || sSub === 'ls-đl' || sSub.includes('lịch sử') || sSub.includes('địa lý'))) return true;
    if (tSub === 'tự nhiên và xã hội' && (sSub === 'tn&xh' || sSub === 'tnxh' || sSub.includes('tự nhiên'))) return true;
    if (tSub === 'hoạt động trải nghiệm' && (sSub === 'hđtn' || sSub === 'hđtn&hn' || sSub.includes('trải nghiệm') || sSub === 'tn')) return true;
    if (tSub === 'tiếng anh' && (sSub.includes('anh') || sSub === 'av' || sSub === 'nn' || sSub === 'ngoại ngữ')) return true;
    if (tSub === 'âm nhạc' && (sSub === 'an' || sSub === 'nhạc')) return true;
    if (tSub === 'mỹ thuật' && (sSub === 'mỹ thuật' || sSub === 'mt' || sSub === 'vẽ')) return true;
    if (tSub === 'đạo đức' && (sSub === 'đđ' || sSub === 'gdcd')) return true;
    if (tSub === 'khoa học' && (sSub === 'kh')) return true;

    return false;
};

// --- MEMOIZED ROW COMPONENT ---
interface SubjectRowProps {
    index: number;
    student: Student;
    selectedSubject: string;
    onUpdateComment: (studentId: string, subject: string, comment: string) => void;
}

const SubjectRow = React.memo(({ index, student, selectedSubject, onUpdateComment }: SubjectRowProps) => {
    // Safe access with fallback object to prevent crash
    const subData = student.subjects[selectedSubject];
    const parentComment = student.subjectComments[selectedSubject] || "";
    
    // --- LOCAL STATE FOR RELIABLE EDITING ---
    const [localComment, setLocalComment] = useState(parentComment);

    // Sync local state when parent props change (e.g. AI Generation)
    useEffect(() => {
        setLocalComment(parentComment);
    }, [parentComment]);

    // Push changes to parent on Blur
    const handleBlur = () => {
        if (localComment !== parentComment) {
            onUpdateComment(student.id, selectedSubject, localComment);
        }
    };

    // --- Logic xử lý hiển thị điểm/xếp loại ---
    const score = subData?.score; 
    const grade = subData?.grade; 
    
    let ratingLabel = '-';
    let ratingColor = 'text-gray-400 bg-gray-100';

    if (score !== undefined) {
      if (score >= 7) { ratingLabel = 'HTT'; ratingColor = 'text-green-700 bg-green-100 border-green-200'; }
      else if (score >= 5) { ratingLabel = 'HT'; ratingColor = 'text-blue-700 bg-blue-100 border-blue-200'; }
      else { ratingLabel = 'CHT'; ratingColor = 'text-red-700 bg-red-100 border-red-200'; }
    } else if (grade) {
      ratingLabel = grade;
      if (ratingLabel === 'HTT') ratingColor = 'text-green-700 bg-green-100 border-green-200';
      else if (ratingLabel === 'HT' || ratingLabel === 'Đ' || ratingLabel === 'Đạt') { ratingLabel = 'HT'; ratingColor = 'text-blue-700 bg-blue-100 border-blue-200'; }
      else { ratingLabel = 'CHT'; ratingColor = 'text-red-700 bg-red-100 border-red-200'; }
    }

    let scoreColor = 'text-gray-900';
    if (score !== undefined) {
      if (score >= 9) scoreColor = 'text-green-600';
      else if (score < 5) scoreColor = 'text-red-600';
    }

    return (
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.name}</td>
        
        <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-100 bg-gray-50/30">
          {score !== undefined ? (
              <span className={`text-xl font-extrabold ${scoreColor}`}>{score}</span>
          ) : (
              <span className="text-gray-300">-</span>
          )}
        </td>

        <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-100 bg-gray-50/30">
          <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold border ${ratingColor}`}>
              {ratingLabel}
          </span>
        </td>

        <td className="px-6 py-4 text-sm text-gray-700">
          <div className="relative">
            <textarea 
              className="w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm p-3 bg-white shadow-sm transition-all resize-y min-h-[60px]"
              rows={2}
              value={localComment}
              onChange={(e) => setLocalComment(e.target.value)}
              onBlur={handleBlur}
              placeholder={`Nhập nhận xét cho ${student.name}...`}
            />
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-center">
          <button 
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all" 
            title="Lưu (Tự động lưu khi nhập xong)"
            onMouseDown={(e) => {
                 e.preventDefault(); // Prevent blur stealing focus logic
                 handleBlur();
            }}
          >
            <Save size={18} />
          </button>
        </td>
      </tr>
    );
}, (prev, next) => {
    return (
        prev.student === next.student && 
        prev.selectedSubject === next.selectedSubject &&
        prev.index === next.index
    );
});
// ------------------------------

export const ModuleSubjects: React.FC<Props> = ({ students, onGenerate, onUpdateComment, isProcessing, templates = [], onDeleteTemplate, onAddTemplate }) => {
  const subjects = useMemo(() => {
    const allKeys = new Set<string>();
    students.forEach(s => {
      Object.keys(s.subjects).forEach(key => allKeys.add(key));
    });
    return Array.from(allKeys); 
  }, [students]);

  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [showTemplateLibrary, setShowTemplateLibrary] = useState<boolean>(false);
  
  // New Template State
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [newTemplateRange, setNewTemplateRange] = useState('9-10'); // Default

  useEffect(() => {
    if (subjects.length > 0) {
      if (!selectedSubject || !subjects.includes(selectedSubject)) {
        setSelectedSubject(subjects[0]);
      }
    }
  }, [subjects, selectedSubject]);

  const currentSubjectTemplates = useMemo(() => {
      if (!selectedSubject) return [];
      return templates.filter(t => isSubjectMatch(t.subject, selectedSubject));
  }, [templates, selectedSubject]);

  const handleAddNewTemplate = () => {
      if (!newTemplateContent.trim() || !onAddTemplate) return;
      onAddTemplate(selectedSubject, newTemplateRange, newTemplateContent.trim());
      setNewTemplateContent('');
  };

  const handleExportExcel = () => {
    if (students.length === 0) return;

    const exportData = students.map((student, index) => {
      const subData = student.subjects[selectedSubject];
      const comment = student.subjectComments[selectedSubject] || "";
      
      let scoreDisplay = "";
      let ratingDisplay = "";

      if (subData?.score !== undefined) {
          scoreDisplay = String(subData.score);
          if (subData.score >= 7) ratingDisplay = 'HTT';
          else if (subData.score >= 5) ratingDisplay = 'HT';
          else ratingDisplay = 'CHT';
      } else if (subData?.grade) {
          ratingDisplay = subData.grade;
      }

      return {
        "STT": index + 1,
        "Mã học sinh": student.studentCode || "",
        "Họ và tên": student.name,
        [`Điểm ${selectedSubject}`]: scoreDisplay,
        [`Mức đạt ${selectedSubject}`]: ratingDisplay,
        [`Nhận xét ${selectedSubject}`]: comment
      };
    });

    const ws = utils.json_to_sheet(exportData);
    const wscols = [{ wch: 5 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 50 }];
    ws['!cols'] = wscols;

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Nhận Xét");
    const safeSubjectName = selectedSubject.replace(/[^a-z0-9]/gi, '_');
    writeFile(wb, `VNedu_Import_${safeSubjectName}.xlsx`);
  };

  if (students.length === 0) return <div className="p-8 text-center text-gray-500">Vui lòng upload dữ liệu học sinh trước.</div>;

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 overflow-hidden relative">
      <div className="w-full md:w-64 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Danh Sách Môn</h3>
          <p className="text-xs text-gray-500 mt-1">Chọn môn để viết nhận xét</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {subjects.map(subject => {
            const isActive = selectedSubject === subject;
            const hasAnyScore = students.some(s => s.subjects[subject]?.score !== undefined);

            return (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-md text-sm transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium border border-blue-100' 
                    : 'text-gray-700 hover:bg-gray-100 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>
                    {getSubjectIcon(subject)}
                  </span>
                  <span className="text-left break-words leading-tight">{subject}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-1 shrink-0 ${hasAnyScore ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                  {hasAnyScore ? 'Điểm' : 'X.Loại'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden relative">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              {getSubjectIcon(selectedSubject)}
              {selectedSubject}
            </h2>
            <p className="text-sm text-gray-500">Nhập liệu và tạo nhận xét cho môn học này.</p>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto items-center">
             <button
                onClick={() => setShowTemplateLibrary(!showTemplateLibrary)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors mr-2 ${showTemplateLibrary ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
             >
                <Library size={16} />
                <span className="hidden lg:inline">Thư viện mẫu</span>
             </button>

             <button
               onClick={() => onGenerate(selectedSubject)}
               disabled={isProcessing || !selectedSubject}
               className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white transition-all ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-sm'}`}
             >
               <FileText size={16} className={isProcessing ? "animate-spin" : ""} />
               {isProcessing ? "Đang tạo..." : "Tạo từ mẫu"}
             </button>
             <button 
                onClick={handleExportExcel}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-green-600 text-green-700 rounded-md hover:bg-green-50 transition-colors"
             >
               <Download size={16} /> <span className="hidden sm:inline">Xuất Excel</span>
             </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12 border-b">STT</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48 border-b">Họ Tên</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24 border-b bg-gray-100 border-r border-gray-200">Điểm KTĐK</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24 border-b bg-gray-100 border-r border-gray-200">Mức Đạt</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Nhận Xét (Có thể chỉnh sửa)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16 border-b">Lưu</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students.map((student, idx) => (
                      <SubjectRow 
                        key={student.id} 
                        index={idx} 
                        student={student} 
                        selectedSubject={selectedSubject} 
                        onUpdateComment={onUpdateComment} 
                      />
                  ))}
                </tbody>
              </table>
            </div>

            {showTemplateLibrary && (
                <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto flex flex-col shrink-0 shadow-inner">
                    <div className="p-3 border-b border-gray-200 bg-white sticky top-0 z-10">
                        <h4 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                            <Library size={14}/> Mẫu câu tham khảo
                        </h4>
                        <p className="text-xs text-gray-500">Môn: {selectedSubject}</p>
                    </div>

                    {/* NEW: Add Template Form */}
                    {onAddTemplate && (
                        <div className="p-3 bg-blue-50 border-b border-blue-100">
                             <h5 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                                <Plus size={12}/> Thêm mẫu mới
                             </h5>
                             <div className="space-y-2">
                                <select 
                                    className="w-full text-xs p-1.5 border border-blue-200 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                                    value={newTemplateRange}
                                    onChange={(e) => setNewTemplateRange(e.target.value)}
                                >
                                    <option value="9-10">9-10 (HTT / Xuất sắc)</option>
                                    <option value="7-8">7-8 (HT / Tốt)</option>
                                    <option value="5-6">5-6 (HT / Trung bình)</option>
                                    <option value="<5">&lt;5 (CHT / Yếu)</option>
                                </select>
                                <textarea 
                                    className="w-full text-xs p-2 border border-blue-200 rounded focus:ring-1 focus:ring-blue-500 min-h-[50px] resize-y"
                                    placeholder="Nhập nội dung mẫu câu (Mỗi câu một dòng)..."
                                    value={newTemplateContent}
                                    onChange={(e) => setNewTemplateContent(e.target.value)}
                                />
                                <button 
                                    onClick={handleAddNewTemplate}
                                    disabled={!newTemplateContent.trim()}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded disabled:opacity-50"
                                >
                                    Lưu tất cả mẫu này
                                </button>
                             </div>
                        </div>
                    )}

                    <div className="p-2 space-y-4">
                        {currentSubjectTemplates.length === 0 ? (
                            <div className="text-center text-gray-400 text-xs py-4 px-2">
                                <p>Chưa tìm thấy mẫu phù hợp.</p>
                                <p className="mt-1 opacity-75">Hãy thử kiểm tra lại tên môn hoặc chọn Khối lớp khác.</p>
                            </div>
                        ) : (
                            currentSubjectTemplates.map((tpl, i) => (
                                <div key={i} className="bg-white p-3 rounded border border-gray-200 shadow-sm">
                                    <div className={`text-xs font-bold mb-2 inline-block px-2 py-0.5 rounded ${
                                        tpl.range === '9-10' || tpl.range === 'HTT' ? 'bg-green-100 text-green-800' :
                                        tpl.range === '7-8' || tpl.range === 'HT' ? 'bg-blue-100 text-blue-800' :
                                        'bg-orange-100 text-orange-800'
                                    }`}>
                                        Mức độ: {tpl.range}
                                    </div>
                                    <ul className="text-xs text-gray-600 space-y-2 pl-1">
                                        {tpl.templates.map((txt, idx) => (
                                            <li 
                                                key={idx} 
                                                className="group flex items-start justify-between gap-2 p-2 rounded hover:bg-gray-50 transition-colors cursor-pointer border border-transparent hover:border-gray-200" 
                                            >
                                                <span 
                                                    className="flex-1"
                                                    title="Bấm để sao chép"
                                                    onClick={() => navigator.clipboard.writeText(txt)}
                                                >
                                                    {txt}
                                                </span>
                                                {onDeleteTemplate && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteTemplate(tpl.subject, tpl.range, txt);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                                                        title="Xóa mẫu câu này"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};