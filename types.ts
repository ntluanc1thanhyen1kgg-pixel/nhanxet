
export enum ModuleType {
  VNEDU_UPLOAD = 'VNEDU_UPLOAD',
  SUBJECT_COMMENTS = 'SUBJECT_COMMENTS',
  NLPC_UPLOAD = 'NLPC_UPLOAD' // Name kept for compatibility, now serves as NLPC_GENERATOR
}

export interface ExcelMerge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface SubjectScore {
  score?: number; // 0-10
  grade?: 'HTT' | 'HT' | 'CHT'; // For non-score subjects
}

export interface NLPC_Ratings {
  'Tự phục vụ'?: 'Tốt' | 'Đạt' | 'CCG';
  'Hợp tác'?: 'Tốt' | 'Đạt' | 'CCG';
  'Tự học'?: 'Tốt' | 'Đạt' | 'CCG';
  'Chăm học'?: 'Tốt' | 'Đạt' | 'CCG';
  'Trách nhiệm'?: 'Tốt' | 'Đạt' | 'CCG';
  'Giao tiếp'?: 'Tốt' | 'Đạt' | 'CCG';
}

export interface NLPCDetail {
  name: string;
  level: 'Tốt' | 'Đạt' | 'CCG';
}

export interface Student {
  id: string;
  studentCode?: string; 
  name: string;
  className: string;
  subjects: Record<string, SubjectScore>;
  
  // -- NLPC Data --
  // Levels selected by user (Default: Đạt or Tốt)
  nlpcLevels?: {
    nlChung: 'Tốt' | 'Đạt' | 'CCG';
    nlDacThu: 'Tốt' | 'Đạt' | 'CCG';
    phamChat: 'Tốt' | 'Đạt' | 'CCG';
    hbs: 'Tốt' | 'Đạt' | 'CCG'; // NEW: Học Bạ Số Level
    hbsRaw?: string; // NEW: Raw text from Excel for HBS column (e.g. "Hoàn thành xuất sắc")
    // Detailed breakdown found in Excel
    details?: {
        nlChung: NLPCDetail[];
        nlDacThu: NLPCDetail[];
        phamChat: NLPCDetail[];
    }
  };
  
  // Generated Comments
  subjectComments: Record<string, string>;
  
  // Specific NLPC Comments
  commentNLChung?: string;
  commentNLDacThu?: string;
  commentPhamChat?: string;
  commentHBS?: string; // NEW: Comment for Digital School Record

  // Legacy fields (optional)
  nlpcRatings?: NLPC_Ratings;
  nlpcComment?: string;
  qualityComment?: string;
  fullData?: Record<string, any>;
}

export interface CommentTemplate {
  gradeLevel: number; 
  subject: string;
  range: '9-10' | '7-8' | '5-6' | '<5' | 'HTT' | 'HT' | 'CHT';
  templates: string[];
}

export interface NLPCTemplate {
  category: 'NL_CHUNG' | 'NL_DACTHU' | 'PHAM_CHAT' | 'HBS'; // Added HBS
  gradeLevel: number;
  level: 'Tốt' | 'Đạt' | 'CCG';
  templates: string[];
}

export interface UserSettings {
  lastActiveModule?: ModuleType;
  lastSelectedGrade?: number;
}

export interface ClassData {
    className: string;
    gradeLevel: number;
    students: Student[];
    rawExcelData: any[][]; // Store original grid
    rawExcelMerges: ExcelMerge[]; // Store cell merges
    lastModified: number;
}

export interface BackupData {
    version: number;
    classes: Record<string, ClassData>;
    templates: CommentTemplate[];
    nlpcTemplates?: NLPCTemplate[]; // NEW: Support for NLPC Template backup
    settings?: UserSettings; 
    createdAt: string;
}

export interface AppState {
  students: Student[];
  templates: CommentTemplate[];
  activeModule: ModuleType;
  isProcessing: boolean;
}