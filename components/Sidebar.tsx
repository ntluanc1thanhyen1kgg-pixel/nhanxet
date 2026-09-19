import React, { useRef } from 'react';
import { ModuleType } from '../types';
import { auth } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { 
  Upload, BookOpen, UserCheck, FileSpreadsheet, FileText, CheckCircle, 
  Library, RotateCcw, Save, Download, UploadCloud, LogOut 
} from 'lucide-react';

interface SidebarProps {
  activeModule: ModuleType;
  setActiveModule: (m: ModuleType) => void;
  onUploadVnEdu: (file: File) => void;
  onSelectGrade: (grade: number) => void;
  onUploadNLPC: (file: File) => void;
  onResetData: () => void;
  hasStudents: boolean;
  hasTemplates: boolean;
  hasNLPC: boolean;
  selectedGrade: number;

  // New Props for Multi-Class & Backup
  savedClasses: string[];
  currentClassName: string;
  onLoadClass: (name: string) => void;
  onDeleteClass: (name: string) => void;
  onBackupData: () => void;
  onRestoreData: (file: File) => void;
  onManualSave: () => void; 
}

interface MenuItemProps {
  module: ModuleType;
  icon: React.ElementType;
  title: string;
  onClick?: (file: File) => void; // Optional now
  isUploaded: boolean;
  activeModule: ModuleType;
  setActiveModule: (m: ModuleType) => void;
  // Specific for Templates
  onSelectGrade?: (grade: number) => void;
  selectedGrade?: number;
}

const MenuItem: React.FC<MenuItemProps> = ({ 
  module, 
  icon: Icon, 
  title, 
  onClick, 
  isUploaded, 
  activeModule, 
  setActiveModule,
  onSelectGrade,
  selectedGrade
}) => {
  const isActive = activeModule === module;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAcceptTypes = () => {
    switch (module) {
      case ModuleType.VNEDU_UPLOAD: return ".xlsx,.xls";
      default: return "*";
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onClick) {
      onClick(files[0]);
      e.target.value = '';
    }
  };
  
  // Check if this module requires Grade Selection (Subject Comments OR NLPC Generator)
  const isGradeSelectorModule = module === ModuleType.SUBJECT_COMMENTS || module === ModuleType.NLPC_UPLOAD;

  return (
    <div className={`mb-4 border rounded-lg overflow-hidden transition-all ${isActive ? 'border-blue-500 ring-1 ring-blue-500 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <button
        onClick={() => setActiveModule(module)}
        type="button"
        className={`w-full flex items-center justify-between p-4 text-left font-medium ${isActive ? 'text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
      >
        <div className="flex items-center gap-3">
          <Icon size={20} />
          <span>{title}</span>
        </div>
        {isUploaded && <CheckCircle size={16} className="text-green-500" />}
      </button>

      {isActive && (
        <div className="p-4 bg-blue-50 border-t border-blue-100 animate-fadeIn">
          <p className="text-sm text-gray-600 mb-3">
            {module === ModuleType.VNEDU_UPLOAD && "Tải lên bảng tổng hợp điểm từ VNedu (Excel)."}
            {module === ModuleType.SUBJECT_COMMENTS && "Chọn mẫu nhận xét môn học theo khối lớp."}
            {module === ModuleType.NLPC_UPLOAD && "Chọn mẫu nhận xét Năng lực & Phẩm chất theo khối lớp và mức độ."}
          </p>
          
          {isGradeSelectorModule && onSelectGrade ? (
            <div className="bg-white p-3 rounded-md border border-blue-200 shadow-sm">
              <label className="block text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
                <Library size={12} />
                CHỌN KHỐI LỚP (BỘ MẪU)
              </label>
              <select 
                value={selectedGrade}
                onChange={(e) => onSelectGrade(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={1}>Khối 1</option>
                <option value={2}>Khối 2</option>
                <option value={3}>Khối 3</option>
                <option value={4}>Khối 4</option>
                <option value={5}>Khối 5</option>
              </select>
              <div className="mt-2 text-[10px] text-gray-500 italic">
                * Đã tải mẫu chuẩn TT27 cho khối {selectedGrade}
              </div>
            </div>
          ) : (
             // Standard File Upload Button for Module 1
            onClick && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept={getAcceptTypes()}
                  onChange={handleFileChange}
                />

                <button
                  onClick={handleButtonClick}
                  type="button"
                  className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors cursor-pointer shadow-sm active:transform active:scale-95"
                >
                  <Upload size={16} />
                  Thêm Lớp Mới (Upload)
                </button>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  setActiveModule,
  onUploadVnEdu,
  onSelectGrade,
  onUploadNLPC,
  onResetData,
  hasStudents,
  hasTemplates,
  hasNLPC,
  selectedGrade,
  savedClasses,
  currentClassName,
  onLoadClass,
  onDeleteClass,
  onBackupData,
  onRestoreData,
  onManualSave,
}) => {
    const backupInputRef = useRef<HTMLInputElement>(null);

    return (
    <div className="w-full md:w-80 bg-white border-r border-gray-200 md:h-screen h-auto flex flex-col shadow-lg z-10 shrink-0">
      <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileSpreadsheet size={24} />
          NHẬN XÉT HỌC BẠ SỐ
        </h1>
        <p className="text-blue-100 text-xs mt-1 opacity-90">Hệ thống trợ lý AI TT27</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        
        {/* REMOVED: Class Management UI Block */}

        <MenuItem
          module={ModuleType.VNEDU_UPLOAD}
          icon={FileText}
          title="1. Bảng Điểm VNedu"
          onClick={onUploadVnEdu}
          isUploaded={hasStudents}
          activeModule={activeModule}
          setActiveModule={setActiveModule}
        />
        <MenuItem
          module={ModuleType.SUBJECT_COMMENTS}
          icon={BookOpen}
          title="2. Nhận Xét Môn Học"
          onSelectGrade={onSelectGrade}
          selectedGrade={selectedGrade}
          isUploaded={hasTemplates}
          activeModule={activeModule}
          setActiveModule={setActiveModule}
        />
        <MenuItem
          module={ModuleType.NLPC_UPLOAD}
          icon={UserCheck}
          title="3. Năng Lực - Phẩm Chất"
          onSelectGrade={onSelectGrade}
          selectedGrade={selectedGrade}
          isUploaded={hasNLPC}
          activeModule={activeModule}
          setActiveModule={setActiveModule}
        />
      </div>

      {/* SECTION: SYSTEM / BACKUP */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col gap-2">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hệ Thống & Sao Lưu</h4>
        
        {/* MANUAL UPDATE BUTTON */}
        {hasStudents && (
             <button
                onClick={onManualSave}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-md shadow-sm transition-all mb-1 active:scale-95"
                title="Lưu lại toàn bộ thay đổi vừa thực hiện vào bộ nhớ"
            >
                <Save size={16} /> CẬP NHẬT DỮ LIỆU
            </button>
        )}

        {/* ROW: Download/Upload File */}
        <div className="grid grid-cols-2 gap-2 mt-1">
             {/* BACKUP BUTTON */}
            <button 
                onClick={onBackupData}
                disabled={!hasStudents}
                className={`flex flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-medium rounded-md border transition-colors ${
                  !hasStudents 
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-sm'
                }`}
                title="Tải file chứa toàn bộ dữ liệu (Lớp + Mẫu câu) về máy tính"
            >
                <Download size={18} /> Lưu về máy
            </button>

            {/* RESTORE BUTTON */}
            <button 
                onClick={() => backupInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-medium text-teal-700 bg-white border border-teal-300 hover:bg-teal-50 rounded-md transition-colors shadow-sm"
                title="Nạp file dữ liệu đã lưu từ máy khác (Gộp thêm dữ liệu)"
            >
                <UploadCloud size={18} /> Nạp file
            </button>
            <input 
                type="file" 
                ref={backupInputRef} 
                className="hidden" 
                accept=".json"
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        onRestoreData(e.target.files[0]);
                        // Reset value to allow selecting the same file again if needed
                        e.target.value = '';
                    }
                }}
            />
        </div>
        
        {/* RESET DATA BUTTON */}
        <button
            onClick={onResetData}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-2 text-red-600 hover:bg-red-50 text-xs rounded-md transition-colors border border-transparent hover:border-red-200"
        >
            <RotateCcw size={14} /> Khôi phục cài đặt gốc
        </button>

        <button
            onClick={() => signOut(auth)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 text-xs rounded-md transition-colors"
        >
            <LogOut size={14} /> Đăng xuất
        </button>

        <p className="text-[10px] text-gray-400 italic text-center mt-1">
           Hệ thống đã bật chế độ lưu trữ Firebase.
        </p>
      </div>
    </div>
  );
};