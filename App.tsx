import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ModuleVnEdu } from './components/ModuleVnEdu';
import { ModuleSubjects } from './components/ModuleSubjects';
import { ModuleNLPC } from './components/ModuleNLPC';
import { Login } from './components/Login';
import { Student, ModuleType, CommentTemplate, ExcelMerge, SubjectScore, NLPCDetail, BackupData, ClassData, NLPCTemplate } from './types';
import { mockStudents, MOCK_NLPC_TEMPLATES } from './services/mockData';
import { LocalDatabase } from './services/localDatabase'; // Import Database Service
import { generateSubjectCommentFromTemplate } from './services/geminiService';
import { auth, firebaseStorage } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { read, utils } from 'xlsx';

const DB_KEY = 'tt27_database_v3'; // Bump version for new data structure
const SETTINGS_KEY = 'tt27_user_settings'; // Key for user preferences
const NLPC_DB_KEY = 'tt27_nlpc_templates_v1'; // Key for NLPC templates

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Load initial settings from localStorage
  const getInitialSettings = () => {
      try {
          const stored = localStorage.getItem(SETTINGS_KEY);
          if (stored) {
              return JSON.parse(stored);
          }
      } catch (e) {
          console.error("Failed to parse settings", e);
      }
      return {};
  };

  const initialSettings = getInitialSettings();

  const [activeModule, setActiveModule] = useState<ModuleType>(
      initialSettings.lastActiveModule || ModuleType.VNEDU_UPLOAD
  );
  
  // --- MULTI-CLASS STATE ---
  const [savedClasses, setSavedClasses] = useState<Record<string, ClassData>>({});
  const [currentClassName, setCurrentClassName] = useState<string>('');
  // ------------------------

  const [students, setStudents] = useState<Student[]>([]);
  
  // --- REF PATTERN: Ensures we always have access to the LATEST data in event handlers ---
  const studentsRef = useRef<Student[]>([]);
  useEffect(() => {
      studentsRef.current = students;
  }, [students]);
  // ------------------------------------------------------------------------------------

  const [selectedGrade, setSelectedGrade] = useState<number>(
      initialSettings.lastSelectedGrade || 4
  );
  
  // --- TEMPLATE STATE MANAGEMENT ---
  const [templateDb, setTemplateDb] = useState<CommentTemplate[]>(() => LocalDatabase.getAllTemplates());
  const [templates, setTemplates] = useState<CommentTemplate[]>([]);

  // --- NEW: NLPC TEMPLATE STATE MANAGEMENT ---
  const [nlpcTemplates, setNlpcTemplates] = useState<NLPCTemplate[]>(() => {
      try {
          const saved = localStorage.getItem(NLPC_DB_KEY);
          if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
      } catch (e) { console.error(e); }
      return MOCK_NLPC_TEMPLATES;
  });

  // Save NLPC templates when changed
  const nlpcTemplatesRef = useRef<NLPCTemplate[]>([]); // Ref to hold latest NLPC templates for backup
  useEffect(() => {
      nlpcTemplatesRef.current = nlpcTemplates;
      localStorage.setItem(NLPC_DB_KEY, JSON.stringify(nlpcTemplates));
  }, [nlpcTemplates]);

  // --- REF PATTERN FOR TEMPLATES ---
  const templateDbRef = useRef<CommentTemplate[]>([]);
  useEffect(() => {
      templateDbRef.current = templateDb;
  }, [templateDb]);
  // --------------------------------

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // State for Module 1 (VNedu View)
  const [rawVnEduData, setRawVnEduData] = useState<any[][]>([]);
  const [rawVnEduMerges, setRawVnEduMerges] = useState<ExcelMerge[]>([]);

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 1. Initialize Data on Mount (Classes only)
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
        setIsProcessing(true);
        try {
            // Load Classes
            const fbClasses = await firebaseStorage.getAllClasses();
            setSavedClasses(fbClasses);

            // Auto-load the most recently modified class
            const classNames = Object.keys(fbClasses);
            if (classNames.length > 0) {
                const lastActive = classNames.reduce((a, b) => fbClasses[a].lastModified > fbClasses[b].lastModified ? a : b);
                const cls = fbClasses[lastActive];
                setCurrentClassName(lastActive);
                setStudents(cls.students);
                setSelectedGrade(cls.gradeLevel);
                setRawVnEduData(cls.rawExcelData || []);
                setRawVnEduMerges(cls.rawExcelMerges || []);
            }

            // Load Templates
            const fbTemplates = await firebaseStorage.getAllTemplates();
            if (fbTemplates.length > 0) {
                setTemplateDb(fbTemplates);
            } else {
                // Seed Firebase with local templates if cloud is empty
                const localTemplates = LocalDatabase.getAllTemplates();
                if (localTemplates.length > 0) {
                    firebaseStorage.saveTemplates(localTemplates);
                    setTemplateDb(localTemplates);
                }
            }

            // Load NLPC
            const fbNlpc = await firebaseStorage.getAllNLPC();
            if (fbNlpc.length > 0) {
                setNlpcTemplates(fbNlpc);
            } else {
                // Seed Firebase with default NLPC templates if cloud is empty
                firebaseStorage.saveNLPC(MOCK_NLPC_TEMPLATES);
                setNlpcTemplates(MOCK_NLPC_TEMPLATES);
            }

            // Load Settings
            const fbSettings = await firebaseStorage.getSettings(user.uid);
            if (fbSettings) {
                if (fbSettings.lastActiveModule) setActiveModule(fbSettings.lastActiveModule as ModuleType);
                if (fbSettings.lastSelectedGrade) setSelectedGrade(fbSettings.lastSelectedGrade);
            }
        } catch (e) {
            console.error("Firebase load failed", e);
            // Fallback to local
            const savedDb = localStorage.getItem(DB_KEY);
            if (savedDb) setSavedClasses(JSON.parse(savedDb));
        } finally {
            setIsProcessing(false);
        }
    };

    loadData();
  }, [user]);

  // Effect to save user settings whenever they change
  useEffect(() => {
      if (!user) return;
      const settings = {
          lastActiveModule: activeModule,
          lastSelectedGrade: selectedGrade
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      firebaseStorage.saveSettings(user.uid, settings);
  }, [activeModule, selectedGrade, user]);

  // 2. Sync templateDb -> templates (View)
  useEffect(() => {
      setTemplates(templateDb.filter(t => t.gradeLevel === selectedGrade));
  }, [selectedGrade, templateDb]);

  // 3. Auto-save templates
  useEffect(() => {
      if (templateDb.length > 0 && user) {
          LocalDatabase.saveTemplates(templateDb);
          firebaseStorage.saveTemplates(templateDb);
      }
  }, [templateDb, user]);

  // 4. Auto-save NLPC templates
  useEffect(() => {
    if (nlpcTemplates.length > 0 && user) {
        firebaseStorage.saveNLPC(nlpcTemplates);
    }
  }, [nlpcTemplates, user]);

  // --- CLASS MANAGEMENT FUNCTIONS ---
  
  const loadClass = (name: string, dbSource = savedClasses) => {
      const cls = dbSource[name];
      if (cls) {
          setCurrentClassName(name);
          setStudents(cls.students);
          setSelectedGrade(cls.gradeLevel);
          // Restore Raw View
          setRawVnEduData(cls.rawExcelData || []);
          setRawVnEduMerges(cls.rawExcelMerges || []);
      }
  };

  const handleDeleteClass = (name: string) => {
      if (confirm(`Bạn có chắc chắn muốn xóa lớp ${name} không?`)) {
          const newDb = { ...savedClasses };
          delete newDb[name];
          setSavedClasses(newDb);
          localStorage.setItem(DB_KEY, JSON.stringify(newDb));
          if (user) firebaseStorage.deleteClass(name);
          
          if (currentClassName === name) {
              setStudents([]);
              setRawVnEduData([]);
              setRawVnEduMerges([]);
              setCurrentClassName('');
          }
      }
  };

  // --- MANUAL SAVE (ROBUST VERSION WITH REF) ---
  const handleManualSave = () => {
      // Use Ref to get data immediately (bypassing render cycles)
      const currentLiveStudents = studentsRef.current;

      if (!currentClassName || currentLiveStudents.length === 0) {
          alert("Chưa có dữ liệu lớp học để cập nhật.");
          return;
      }

      // Explicitly construct the fully updated class object based on visible data
      const updatedClassData: ClassData = {
          className: currentClassName,
          gradeLevel: selectedGrade,
          students: currentLiveStudents, // LIVE DATA
          rawExcelData: rawVnEduData,
          rawExcelMerges: rawVnEduMerges,
          lastModified: Date.now()
      };

      // Create new DB object
      const updatedClasses = {
          ...savedClasses,
          [currentClassName]: updatedClassData
      };

      try {
          // Write to Browser Storage
          localStorage.setItem(DB_KEY, JSON.stringify(updatedClasses));
          
          // Write to Firebase
          if (user) {
            firebaseStorage.saveClass(currentClassName, updatedClassData);
            firebaseStorage.saveSettings(user.uid, {
                lastActiveModule: activeModule,
                lastSelectedGrade: selectedGrade
            });
          }

          // Update React State to reflect that what is saved matches what is seen
          setSavedClasses(updatedClasses);

          // Save settings too
          const settings = {
              lastActiveModule: activeModule,
              lastSelectedGrade: selectedGrade
          };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

          alert(`✅ Đã CẬP NHẬT DỮ LIỆU vào bộ nhớ trình duyệt!\n\nLớp: ${currentClassName}\nSố học sinh: ${currentLiveStudents.length}\n\nBây giờ bạn có thể bấm "Lưu về máy" để tải file JSON an toàn.`);
      } catch (e) {
          console.error(e);
          alert("❌ Lỗi khi lưu vào bộ nhớ trình duyệt (Có thể do bộ nhớ đầy). Vui lòng thử 'Lưu về máy' ngay.");
      }
  };

  // --- BACKUP & RESTORE ---

  const prepareBackupData = (): string => {
      // CRITICAL FIX: Use refs to grab the absolute latest state variables
      const liveStudents = studentsRef.current;
      const liveTemplates = templateDbRef.current;
      const liveNlpcTemplates = nlpcTemplatesRef.current; // Get latest NLPC templates

      // 1. Get the latest data for the CURRENT class directly from LIVE state
      const currentClassSnapshot = currentClassName ? {
          [currentClassName]: {
              className: currentClassName,
              gradeLevel: selectedGrade,
              students: liveStudents,
              rawExcelData: rawVnEduData,
              rawExcelMerges: rawVnEduMerges,
              lastModified: Date.now()
          }
      } : {};

      // 2. Merge with other classes
      const finalClasses = { ...savedClasses, ...currentClassSnapshot };

      const backupData: BackupData = {
          version: 3,
          classes: finalClasses,
          templates: liveTemplates,
          nlpcTemplates: liveNlpcTemplates, // Include NLPC templates in backup
          settings: {
              lastActiveModule: activeModule,
              lastSelectedGrade: selectedGrade
          },
          createdAt: new Date().toISOString()
      };
      
      return JSON.stringify(backupData, null, 2);
  };

  const handleBackupData = () => {
      // Force a tiny delay to allow any pending 'onBlur' events to fire and update the Ref
      setTimeout(() => {
          const dataStr = prepareBackupData();
          const blob = new Blob([dataStr], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
          const clsNameSafe = currentClassName ? currentClassName.replace(/[^a-z0-9]/gi, '_') : 'Backup';
          link.download = `TT27_Backup_${clsNameSafe}_${dateStr}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }, 50);
  };

  const processRestoreData = (content: string) => {
      try {
          const parsed = JSON.parse(content) as BackupData;
          
          if (typeof parsed === 'object' && parsed !== null) {
              let incomingClasses: Record<string, ClassData> = {};
              let incomingTemplates: CommentTemplate[] = [];
              let incomingNlpcTemplates: NLPCTemplate[] = [];

              if (parsed.classes) {
                  incomingClasses = parsed.classes;
                  incomingTemplates = parsed.templates || [];
                  incomingNlpcTemplates = parsed.nlpcTemplates || [];
              } else {
                  incomingClasses = parsed as any;
              }

              let shouldMerge = true;
              if (Object.keys(savedClasses).length > 0) {
                  shouldMerge = confirm(
                      "Bạn muốn xử lý dữ liệu như thế nào?\n\n" +
                      "OK (Khuyên dùng): GỘP DỮ LIỆU. Giữ lại các nhận xét bạn đang làm, chỉ thêm dữ liệu mới từ file.\n" +
                      "Cancel: THAY THẾ. Xóa hết dữ liệu hiện tại và dùng hoàn toàn dữ liệu từ file backup."
                  );
              }

              let finalClasses: Record<string, ClassData> = {};

              if (shouldMerge) {
                  finalClasses = { ...savedClasses };
                  
                  // Merge Subject Templates
                  if (incomingTemplates.length > 0) {
                      const mergedTemplateDb = LocalDatabase.mergeTemplates(incomingTemplates, templateDb);
                      setTemplateDb(mergedTemplateDb);
                  }

                  // Merge NLPC Templates
                  if (incomingNlpcTemplates.length > 0) {
                      const mergedNlpc = LocalDatabase.mergeNLPCTemplates(incomingNlpcTemplates, nlpcTemplates);
                      setNlpcTemplates(mergedNlpc);
                  }

                  Object.entries(incomingClasses).forEach(([clsName, incClass]) => {
                      if (finalClasses[clsName]) {
                          const localClass = finalClasses[clsName];
                          const localStudentMap = new Map<string, Student>();
                          localClass.students.forEach(s => localStudentMap.set(s.studentCode || s.name, s));

                          const mergedStudents = incClass.students.map(backupS => {
                              const key = backupS.studentCode || backupS.name;
                              const localS = localStudentMap.get(key);

                              if (localS) {
                                  return {
                                      ...backupS,
                                      id: localS.id,
                                      subjectComments: { ...backupS.subjectComments, ...localS.subjectComments },
                                      nlpcLevels: localS.nlpcLevels || backupS.nlpcLevels,
                                      commentNLChung: localS.commentNLChung || backupS.commentNLChung,
                                      commentNLDacThu: localS.commentNLDacThu || backupS.commentNLDacThu,
                                      commentPhamChat: localS.commentPhamChat || backupS.commentPhamChat,
                                      commentHBS: localS.commentHBS || backupS.commentHBS,
                                  };
                              }
                              return backupS; 
                          });

                          finalClasses[clsName] = {
                              ...localClass,
                              students: mergedStudents,
                              lastModified: Date.now() 
                          };

                      } else {
                          finalClasses[clsName] = incClass;
                      }
                  });
                  alert(`✅ Đã GỘP dữ liệu thành công!`);

              } else {
                  // REPLACE MODE
                  finalClasses = incomingClasses;
                  if (incomingTemplates.length > 0) {
                      setTemplateDb(incomingTemplates);
                      LocalDatabase.saveTemplates(incomingTemplates);
                  }
                  if (incomingNlpcTemplates.length > 0) {
                      setNlpcTemplates(incomingNlpcTemplates);
                  }
                  alert(`✅ Đã thay thế dữ liệu thành công!`);
              }

              setSavedClasses(finalClasses);
              localStorage.setItem(DB_KEY, JSON.stringify(finalClasses));

              if (parsed.settings) {
                  if (parsed.settings.lastSelectedGrade) setSelectedGrade(parsed.settings.lastSelectedGrade);
                  if (parsed.settings.lastActiveModule) setActiveModule(parsed.settings.lastActiveModule);
              }

              const finalKeys = Object.keys(finalClasses);
              if (finalKeys.length > 0) {
                  if (currentClassName && finalClasses[currentClassName]) {
                      loadClass(currentClassName, finalClasses);
                  } else {
                      loadClass(finalKeys[0], finalClasses);
                  }
              } else {
                  setStudents([]);
                  setRawVnEduData([]);
                  setRawVnEduMerges([]);
                  setCurrentClassName('');
              }
          }
      } catch (err) {
          alert("❌ Lỗi: File không đúng định dạng.");
          console.error(err);
      }
  };

  const handleRestoreData = (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          const content = e.target?.result as string;
          processRestoreData(content);
      };
      reader.readAsText(file);
  };

  // ---------------------------------

  const handleSelectGrade = (grade: number) => {
      setSelectedGrade(grade);
      if (currentClassName) {
          setSavedClasses(prev => ({
              ...prev,
              [currentClassName]: {
                  ...prev[currentClassName],
                  gradeLevel: grade
              }
          }));
      }
  };

  // --- SUBJECT TEMPLATE MANAGEMENT FUNCTIONS ---
  const handleDeleteTemplate = (subject: string, range: string, contentToDelete: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa mẫu nhận xét này khỏi thư viện?")) {
      const newDb = templateDb.map(t => {
        if (t.gradeLevel === selectedGrade && t.subject === subject && t.range === range) {
          return {
            ...t,
            templates: t.templates.filter(s => s !== contentToDelete)
          };
        }
        return t;
      });
      setTemplateDb(newDb);
    }
  };
  
  // Add Custom Subject Template (Updated for Bulk Add)
  const handleAddTemplate = (subject: string, range: string, content: string) => {
      // Split content by newlines to allow bulk adding
      const newTemplatesToAdd = content
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => s.replace(/^[-*+•]\s*/, '')); // Remove bullet points

      if (newTemplatesToAdd.length === 0) return;

      const newDb = [...templateDb];
      const existingIndex = newDb.findIndex(t => 
          t.gradeLevel === selectedGrade && 
          t.subject.toLowerCase() === subject.toLowerCase() && 
          t.range === range
      );

      if (existingIndex > -1) {
          // Add to existing group (prepend to top)
          const updatedGroup = {
              ...newDb[existingIndex],
              templates: [...newTemplatesToAdd, ...newDb[existingIndex].templates]
          };
          newDb[existingIndex] = updatedGroup;
      } else {
          // Create new group
          newDb.push({
              gradeLevel: selectedGrade,
              subject: subject,
              range: range as any,
              templates: newTemplatesToAdd
          });
      }
      setTemplateDb(newDb);
      alert(`Đã thêm ${newTemplatesToAdd.length} câu vào thư viện mẫu.`);
  };

  // --- NEW: NLPC TEMPLATE MANAGEMENT FUNCTIONS ---
  const handleAddNLPCTemplate = (category: string, level: string, content: string) => {
      // SPLIT CONTENT BY NEWLINES to allow bulk adding
      const newTemplatesToAdd = content
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => s.replace(/^[-*+•]\s*/, '')); // Remove bullet points if copied from lists

      if (newTemplatesToAdd.length === 0) return;

      const newDb = [...nlpcTemplates];
      const existingIndex = newDb.findIndex(t => 
          t.gradeLevel === selectedGrade && 
          t.category === category && 
          t.level === level
      );

      if (existingIndex > -1) {
          const updatedGroup = {
              ...newDb[existingIndex],
              templates: [...newTemplatesToAdd, ...newDb[existingIndex].templates] // Prepend all new lines
          };
          newDb[existingIndex] = updatedGroup;
      } else {
           newDb.push({
              gradeLevel: selectedGrade,
              category: category as any,
              level: level as any,
              templates: newTemplatesToAdd
          });
      }
      setNlpcTemplates(newDb);
      alert(`Đã thêm ${newTemplatesToAdd.length} mẫu câu vào thư viện.`);
  };

  const handleDeleteNLPCTemplate = (category: string, level: string, content: string) => {
      if (confirm("Bạn có chắc chắn muốn xóa mẫu NLPC này?")) {
          const newDb = nlpcTemplates.map(t => {
              if (t.gradeLevel === selectedGrade && t.category === category && t.level === level) {
                  return {
                      ...t,
                      templates: t.templates.filter(s => s !== content)
                  };
              }
              return t;
          });
          setNlpcTemplates(newDb);
      }
  };
  // ----------------------------------------------

  // Helper functions for Excel parsing
  const normalizeNLPCLevel = (val: any): 'Tốt' | 'Đạt' | 'CCG' | null => {
      if (!val) return null;
      const v = String(val).trim().toUpperCase();
      if (v === '' || v === '-') return null;
      if (['T', 'TỐT', 'A', 'HTT', 'HOÀN THÀNH TỐT'].includes(v)) return 'Tốt';
      if (['Đ', 'ĐẠT', 'H', 'HT', 'P', 'HOÀN THÀNH'].includes(v)) return 'Đạt';
      if (['C', 'CCG', 'CHT', 'F', 'CHƯA ĐẠT', 'CẦN CỐ GẮNG'].includes(v)) return 'CCG';
      return null;
  };

  const normalizeHBSLevel = (val: any): 'Tốt' | 'Đạt' | 'CCG' | null => {
      if (!val) return null;
      const v = String(val).trim().toUpperCase(); 
      if (v === '') return null;
      const totKeywords = ['HTXS', 'HOÀN THÀNH XUẤT SẮC', 'HTT', 'HOÀN THÀNH TỐT', 'XUẤT SẮC', 'TIÊU BIỂU', 'GIỎI', 'KHEN THƯỞNG', 'T', 'TỐT', 'A+', 'A'];
      if (totKeywords.some(k => v === k || v.includes(k))) return 'Tốt';
      const ccgKeywords = ['CHƯA', 'CHT', 'CẦN CỐ GẮNG', 'YẾU', 'RÈN LUYỆN', 'C', 'CCG', 'KHL', 'KÉM', 'Ở LẠI'];
      if (ccgKeywords.some(k => v === k || v.includes(k))) return 'CCG';
      const datKeywords = ['HOÀN THÀNH', 'ĐẠT', 'H', 'HT', 'Đ', 'TB', 'TRUNG BÌNH', 'K', 'KHÁ', 'LÊN LỚP', 'HTCT'];
      if (datKeywords.some(k => v === k || v.includes(k))) return 'Đạt';
      return null; 
  };

  // Updated parseVnEduFile
  const parseVnEduFile = async (file: File): Promise<{ students: Student[], rawData: any[][], merges: ExcelMerge[] } | null> => {
     try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const merges: ExcelMerge[] = worksheet['!merges'] || [];
      const rawData: any[][] = utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      const jsonData = rawData;
      if (jsonData.length < 2) return null;
      
      let headerRowIndex = -1;
      let nameColIndex = -1;
      let studentCodeColIndex = -1;
      
      // 1. Locate Header Row
      for(let i = 0; i < Math.min(jsonData.length, 20); i++) {
         const row = jsonData[i];
         const idxName = row.findIndex((cell: any) => cell && typeof cell === 'string' && (cell.toLowerCase().includes('họ và tên') || cell.toLowerCase().includes('họ tên')));
         const idxCode = row.findIndex((cell: any) => cell && typeof cell === 'string' && (cell.toLowerCase().includes('mã học sinh') || cell.toLowerCase().includes('mã hs') || cell.toLowerCase() === 'mhs'));

         if (idxName !== -1) {
            headerRowIndex = i;
            nameColIndex = idxName;
            if (idxCode !== -1) studentCodeColIndex = idxCode;
            break;
         }
      }

      if (headerRowIndex === -1) {
         alert("Không tìm thấy cột 'Họ và tên' trong file. Vui lòng kiểm tra lại file VNedu.");
         return null;
      }
      
      // Handle merged header for Name
      const nameMerge = merges.find(m => m.s.r === headerRowIndex && m.s.c === nameColIndex);
      if (nameMerge && nameMerge.e.r > headerRowIndex) headerRowIndex = nameMerge.e.r;

      const getValueAt = (r: number, c: number) => {
         const merge = merges.find(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);
         return merge ? jsonData[merge.s.r][merge.s.c] : jsonData[r]?.[c];
      };

      const getColumnDataType = (colIndex: number): 'NUMBER' | 'TEXT' | 'EMPTY' => {
          let numCount = 0;
          let textCount = 0;
          const limit = Math.min(jsonData.length, headerRowIndex + 50);
          for (let i = headerRowIndex + 1; i < limit; i++) {
             const val = jsonData[i][colIndex];
             if (val === undefined || val === null || String(val).trim() === '') continue;
             if (typeof val === 'number') numCount++;
             else if (typeof val === 'string') {
                 if (/^[\d,.]+$/.test(val.trim())) numCount++; else textCount++;
             }
          }
          if (numCount > 0 && numCount >= textCount) return 'NUMBER';
          if (textCount > 0) return 'TEXT';
          return 'EMPTY';
      };

      // 2. Identify Columns
      const EXCLUDED_KEYWORDS = ['stt', 'ngày sinh', 'năm sinh', 'nữ', 'nam', 'dân tộc', 'ghi chú', 'lớp', 'học sinh khuyết tật', 'trạng thái', 'đội viên', 'mã hs', 'mã học sinh', 'chỗ ở', 'điện thoại', 'phụ huynh', 'nghề nghiệp'];
      
      const nlpcMap = new Map<number, { category: 'nlChung'|'nlDacThu'|'phamChat', name: string }>();
      const subjectCommentMap = new Map<number, string>(); 
      const nlpcCommentMap = new Map<number, 'nlChung'|'nlDacThu'|'phamChat'|'hbs'>();

      const subjectCandidates: { name: string, index: number, subHeader: string }[] = [];
      let hbsColIndex = -1;

      const headerRow = jsonData[headerRowIndex];
      let bestHbsCol = -1;
      let maxHbsScore = 0;

      for (let c = nameColIndex + 1; c < headerRow.length; c++) {
          const currentHeader = String(headerRow[c] || "").trim();
          const currentHeaderLower = currentHeader.toLowerCase();
          
          let parentHeader = "";
          if (headerRowIndex > 0) {
              const val = getValueAt(headerRowIndex - 1, c);
              if (val && typeof val === 'string') parentHeader = val.trim();
          }
          const parentHeaderLower = parentHeader.toLowerCase();

          // A. Check if this is a COMMENT column
          const isCommentCol = currentHeaderLower.includes('nhận xét') || currentHeaderLower === 'nx';
          if (isCommentCol) {
              if (parentHeaderLower.includes('năng lực chung') || currentHeaderLower.includes('năng lực chung')) {
                  nlpcCommentMap.set(c, 'nlChung'); continue;
              }
              if (parentHeaderLower.includes('phẩm chất') || currentHeaderLower.includes('phẩm chất')) {
                  nlpcCommentMap.set(c, 'phamChat'); continue;
              }
              if (parentHeaderLower.includes('đặc thù') || currentHeaderLower.includes('đặc thù')) {
                  nlpcCommentMap.set(c, 'nlDacThu'); continue;
              }
              if (parentHeaderLower.includes('học bạ số') || currentHeaderLower.includes('hbs') || parentHeaderLower.includes('xếp loại giáo dục')) {
                  nlpcCommentMap.set(c, 'hbs'); continue;
              }

              let targetSubject = parentHeader;
              if ((!targetSubject || targetSubject.toLowerCase().includes('môn')) && currentHeaderLower.includes('môn')) {
                   targetSubject = currentHeader.replace(/nhận xét|môn|nx|về/gi, '').trim();
              }
              
              if (targetSubject && targetSubject.length > 0 && !EXCLUDED_KEYWORDS.some(k => targetSubject.toLowerCase().includes(k))) {
                   const cleanedSubject = targetSubject.replace(/^(Môn|KTĐK|ĐK|Điểm|TBM|Tổng kết|Kiểm tra)\s*/i, "").trim();
                   subjectCommentMap.set(c, cleanedSubject);
                   continue;
              }
          }

          // B. Detect HBS Column
          if (['xếp loại', 'mức đạt', 'danh hiệu', 'khen thưởng', 'thành tích', 'kết quả giáo dục', 'xếp loại giáo dục'].some(k => currentHeaderLower.includes(k) || parentHeaderLower.includes(k))) {
              const nonSubjectKeywords = ['tổng hợp', 'khen thưởng', 'danh hiệu', 'thành tích', 'kết quả', 'năng lực', 'phẩm chất', 'học bạ', 'giáo dục', 'thi đua', 'cuối năm', 'cả năm'];
              
              let isSubjectSpecific = false;
              if (parentHeaderLower.length > 0) {
                   if (!nonSubjectKeywords.some(k => parentHeaderLower.includes(k))) {
                       isSubjectSpecific = true;
                   }
                   if (parentHeaderLower.includes('môn')) isSubjectSpecific = true;
              }

              if (!isSubjectSpecific) {
                   let score = 0;
                   const combinedName = (parentHeaderLower + " " + currentHeaderLower).trim();
                   if (combinedName.includes('khen thưởng')) score += 10;
                   if (combinedName.includes('danh hiệu')) score += 8;
                   if (combinedName.includes('xếp loại giáo dục')) score += 9;
                   if (combinedName.includes('kết quả giáo dục')) score += 9;
                   if (getColumnDataType(c) === 'TEXT') score += 5;

                   if (score > maxHbsScore) {
                       maxHbsScore = score;
                       bestHbsCol = c;
                   }
                   continue;
              }
          }

          // C. Detect NLPC Columns
          let nlpcCategory: 'nlChung'|'nlDacThu'|'phamChat' | null = null;
          if (parentHeaderLower.includes('năng lực chung') || parentHeaderLower === 'nl chung') nlpcCategory = 'nlChung';
          else if (parentHeaderLower.includes('phẩm chất') || parentHeaderLower === 'pc') nlpcCategory = 'phamChat';
          else if (parentHeaderLower.includes('năng lực đặc thù') || parentHeaderLower === 'nl đặc thù') nlpcCategory = 'nlDacThu';
          
          if (!nlpcCategory) {
               if (currentHeaderLower.includes('năng lực chung')) nlpcCategory = 'nlChung';
               else if (currentHeaderLower.includes('phẩm chất')) nlpcCategory = 'phamChat';
               else if (currentHeaderLower.includes('năng lực đặc thù')) nlpcCategory = 'nlDacThu';
          }

          if (nlpcCategory) {
              if (!currentHeaderLower.includes('nhận xét') && !currentHeaderLower.includes('nx')) {
                  let skillName = currentHeader;
                  const sLower = skillName.toLowerCase();
                  if (sLower.includes('mức đạt') || sLower.includes('xếp loại') || sLower === 'chung' || sLower === 'tổng hợp') {
                      skillName = "Chung"; 
                  }
                  
                  if (getColumnDataType(c) !== 'EMPTY') {
                      nlpcMap.set(c, { category: nlpcCategory, name: skillName });
                  }
              }
              continue; 
          }

          // D. Detect Subjects
          if (EXCLUDED_KEYWORDS.some(x => currentHeaderLower.includes(x))) continue;
          if (currentHeaderLower === 'nx' || currentHeaderLower.includes('nhận xét')) continue; 

          let subjectName = currentHeader;
          if (parentHeader.length > 0) {
              if (!parentHeaderLower.includes('xếp loại') && !parentHeaderLower.includes('danh hiệu') && !parentHeaderLower.includes('khen thưởng') && !parentHeaderLower.includes('tổng hợp') && !parentHeaderLower.includes('kết quả')) subjectName = parentHeader;
          }
          const originalName = subjectName;
          subjectName = subjectName.replace(/\s+/g, ' ').replace(/^(Môn|KTĐK|ĐK|Điểm|TBM|Tổng kết|Kiểm tra)\s*/i, "").trim();
          if (subjectName.length === 0 && originalName.length > 0) subjectName = originalName; 
          
          const subjectNameLower = subjectName.toLowerCase();
          if (EXCLUDED_KEYWORDS.some(x => subjectNameLower.includes(x))) continue;
          const isNumeric = /^\d+$/.test(subjectName);
          if (subjectName && !isNumeric && subjectName.toLowerCase() !== 'stt' && subjectName.length > 1) {
              subjectCandidates.push({ name: subjectName, index: c, subHeader: currentHeader });
          }
      }

      if (bestHbsCol !== -1) hbsColIndex = bestHbsCol;

      const subjectCols: { name: string, index: number }[] = [];
      const distinctSubjects = Array.from(new Set(subjectCandidates.map(c => c.name)));
      
      distinctSubjects.forEach(subject => {
          const cols = subjectCandidates.filter(c => c.name === subject);
          const nonEmptyCols = cols.filter(c => getColumnDataType(c.index) !== 'EMPTY');
          if (nonEmptyCols.length === 0) return;
          const numericCols = nonEmptyCols.filter(c => getColumnDataType(c.index) === 'NUMBER');
          const textCols = nonEmptyCols.filter(c => getColumnDataType(c.index) === 'TEXT');
          let selectedCol = null;
          
          if (numericCols.length > 0) {
              const scored = numericCols.map(col => {
                  let points = 0;
                  const h = col.subHeader.toLowerCase();
                  if (['cuối kỳ', 'cuối kì', 'ck', 'thi', 'điểm thi', 'tổng hợp', 'đtb', 'hk1', 'hk2', 'cn'].some(k => h.includes(k) || h === k)) points += 100;
                  else if (['ktđk', 'đk', 'đ.kiểm tra'].some(k => h.includes(k))) points += 95;
                  else if (['tbm', 'tb', 'tổng kết'].some(k => h.includes(k))) points += 90;
                  points += col.index * 0.001;
                  return { col, points };
              });
              scored.sort((a, b) => b.points - a.points);
              selectedCol = scored[0].col;
          } else {
               const scored = textCols.map(col => {
                  let points = 0;
                  const h = col.subHeader.toLowerCase();
                  if (['xếp loại', 'xl', 'mức đạt'].some(k => h.includes(k))) points += 100;
                  else if (['nhận xét', 'nx'].some(k => h.includes(k))) points -= 100; 
                  points += col.index * 0.001;
                  return { col, points };
               });
               const validScored = scored.filter(s => s.points > -50);
               validScored.sort((a, b) => b.points - a.points);
               if (validScored.length > 0) selectedCol = validScored[0].col;
               else {
                   const nonCommentCols = textCols.filter(c => !c.subHeader.toLowerCase().includes('nhận xét') && !c.subHeader.toLowerCase().includes('nx'));
                   if (nonCommentCols.length > 0) selectedCol = nonCommentCols[nonCommentCols.length - 1];
               }
          }
          if (selectedCol) subjectCols.push({ name: subject, index: selectedCol.index });
      });

      // 3. Process Rows
      const studentsData: Student[] = [];
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
         const row = jsonData[i];
         const name = row[nameColIndex];
         if (!name || typeof name !== 'string' || name.trim() === '') continue;
         if (name.toLowerCase().includes('kí duyệt') || name.toLowerCase().includes('giáo viên') || name.toLowerCase().includes('hiệu trưởng')) continue;
         
         let studentCode = '';
         if (studentCodeColIndex !== -1) studentCode = String(row[studentCodeColIndex] || "").trim();
         
         const subjects: Record<string, SubjectScore> = {};
         const readSubjectComments: Record<string, string> = {};

         subjectCols.forEach(col => {
            const val = row[col.index];
            if (val !== undefined && val !== null && val !== '') {
               if (typeof val === 'number') subjects[col.name] = { score: val };
               else if (typeof val === 'string') {
                  const v = val.trim().toUpperCase();
                  if (['T', 'H', 'C', 'HTT', 'HT', 'CHT', 'Đ', 'ĐẠT', 'CĐ', 'CHƯA ĐẠT'].some(k => v === k) || v.includes('HOÀN THÀNH') || v.includes('ĐẠT') || v.includes('CHƯA')) {
                      let grade: any = 'HT';
                      if (v === 'T' || v === 'HTT' || v.includes('XUẤT SẮC') || v.includes('TỐT')) grade = 'HTT';
                      else if (v === 'H' || v === 'HT' || v === 'Đ' || v === 'ĐẠT' || v.includes('HOÀN THÀNH')) grade = 'HT';
                      else grade = 'CHT';
                      subjects[col.name] = { grade };
                  } else {
                      const normalizedVal = v.replace(',', '.');
                      const num = parseFloat(normalizedVal);
                      if (!isNaN(num)) subjects[col.name] = { score: num };
                  }
               }
            }
         });

         subjectCommentMap.forEach((subjectName, colIndex) => {
             const comment = row[colIndex];
             if (comment && typeof comment === 'string' && comment.trim() !== '') {
                 const existingKey = Object.keys(subjects).find(k => k === subjectName || k.includes(subjectName) || subjectName.includes(k));
                 if (existingKey) {
                     readSubjectComments[existingKey] = comment.trim();
                 } else {
                     readSubjectComments[subjectName] = comment.trim();
                     if (!subjects[subjectName]) subjects[subjectName] = {}; 
                 }
             }
         });

         const details = { nlChung: [] as NLPCDetail[], nlDacThu: [] as NLPCDetail[], phamChat: [] as NLPCDetail[] };
         nlpcMap.forEach((info, colIndex) => {
             const rawVal = row[colIndex];
             const level = normalizeNLPCLevel(rawVal);
             if (level) {
                 details[info.category].push({ name: info.name, level });
             }
         });

         let commNLChung = '', commNLDacThu = '', commPhamChat = '', commHBS = '';
         nlpcCommentMap.forEach((category, colIndex) => {
             const val = row[colIndex];
             if (val && typeof val === 'string' && val.trim() !== '') {
                 if (category === 'nlChung') commNLChung = val.trim();
                 if (category === 'nlDacThu') commNLDacThu = val.trim();
                 if (category === 'phamChat') commPhamChat = val.trim();
                 if (category === 'hbs') commHBS = val.trim();
             }
         });

         const calculateSummary = (dets: NLPCDetail[]): 'Tốt'|'Đạt'|'CCG' => {
             const explicitSummary = dets.find(d => d.name === 'Chung');
             if (explicitSummary && explicitSummary.level) return explicitSummary.level;
             if (dets.length === 0) return 'Đạt';
             if (dets.some(d => d.level === 'CCG')) return 'CCG';
             const countTot = dets.filter(d => d.level === 'Tốt').length;
             if (countTot === dets.length && countTot > 0) return 'Tốt';
             return 'Đạt';
         };

         const nlC = calculateSummary(details.nlChung);
         const nlDT = calculateSummary(details.nlDacThu);
         const pc = calculateSummary(details.phamChat);
         
         let hbs: 'Tốt' | 'Đạt' | 'CCG' = 'Đạt';
         let hbsRawValue = "";

         if (hbsColIndex !== -1) {
             const rawHbs = row[hbsColIndex];
             if (rawHbs) hbsRawValue = String(rawHbs).trim();
             const normalizedHbs = normalizeHBSLevel(rawHbs);
             if (normalizedHbs) {
                 hbs = normalizedHbs;
             } else {
                 if (nlC === 'Tốt' && nlDT === 'Tốt' && pc === 'Tốt') hbs = 'Tốt';
                 else if (nlC === 'CCG' || nlDT === 'CCG' || pc === 'CCG') hbs = 'CCG';
             }
         } else {
             if (nlC === 'Tốt' && nlDT === 'Tốt' && pc === 'Tốt') hbs = 'Tốt';
             else if (nlC === 'CCG' || nlDT === 'CCG' || pc === 'CCG') hbs = 'CCG';
         }

         if (Object.keys(subjects).length > 0) {
            studentsData.push({
               id: `S${i}`,
               studentCode: studentCode, 
               name: name,
               className: 'Lớp',
               subjects,
               nlpcLevels: { nlChung: nlC, nlDacThu: nlDT, phamChat: pc, hbs: hbs, hbsRaw: hbsRawValue, details: details },
               subjectComments: readSubjectComments,
               commentNLChung: commNLChung, 
               commentNLDacThu: commNLDacThu, 
               commentPhamChat: commPhamChat, 
               commentHBS: commHBS
            });
         }
      }
      return { students: studentsData, rawData, merges };
    } catch (e) {
      console.error(e);
      alert("Lỗi khi đọc file. Vui lòng đảm bảo file đúng định dạng Excel.");
      return null;
    }
  };

  const handleUploadVnEdu = async (file: File) => {
    setIsProcessing(true);
    const result = await parseVnEduFile(file);
    
    if (result && result.students.length > 0) {
        let className = prompt("Nhập tên lớp (Ví dụ: 4A, 5B) để lưu trữ:", `Lớp ${selectedGrade}`);
        if (!className) className = `Lớp ${new Date().getTime()}`;

        let finalStudents = result.students;
        
        if (savedClasses[className]) {
            if (confirm(`Lớp "${className}" đã tồn tại.\n\nBấm OK để CẬP NHẬT (Giữ lại các nhận xét & đánh giá cũ, chỉ cập nhật danh sách và điểm số).\nBấm Cancel để GHI ĐÈ (Xóa toàn bộ dữ liệu cũ và tạo mới).`)) {
                const oldStudents = savedClasses[className].students as Student[];
                const oldStudentMap = new Map<string, Student>();
                oldStudents.forEach(s => oldStudentMap.set(s.studentCode || s.name, s));

                finalStudents = result.students.map((newS: Student) => {
                    const key = newS.studentCode || newS.name;
                    const oldS = oldStudentMap.get(key);

                    if (oldS) {
                        return {
                            ...newS,
                            id: oldS.id,
                            subjectComments: { ...newS.subjectComments, ...oldS.subjectComments },
                            nlpcLevels: (oldS.nlpcLevels && oldS.nlpcLevels.nlChung) ? oldS.nlpcLevels : newS.nlpcLevels,
                            commentNLChung: oldS.commentNLChung || newS.commentNLChung,
                            commentNLDacThu: oldS.commentNLDacThu || newS.commentNLDacThu,
                            commentPhamChat: oldS.commentPhamChat || newS.commentPhamChat,
                            commentHBS: oldS.commentHBS || newS.commentHBS,
                        };
                    }
                    return newS;
                });
            }
        }

        setCurrentClassName(className);
        setStudents(finalStudents);
        setRawVnEduData(result.rawData);
        setRawVnEduMerges(result.merges);

        setSavedClasses(prev => {
             const updated = {
                 ...prev,
                 [className!]: {
                     className: className!,
                     gradeLevel: selectedGrade,
                     students: finalStudents,
                     rawExcelData: result.rawData, 
                     rawExcelMerges: result.merges, 
                     lastModified: Date.now()
                 }
             };
             localStorage.setItem(DB_KEY, JSON.stringify(updated));
             return updated;
        });

        setTimeout(() => alert(`✅ Đã tải và đồng bộ lớp ${className} thành công!`), 100);
    } else {
        if (confirm("Không đọc được dữ liệu. Tải dữ liệu mẫu?")) {
            const className = "Lớp Mẫu 4A";
            setCurrentClassName(className);
            const shuffled = [...mockStudents].map(s => ({...s, name: s.name + " (Mẫu)"}));
            setStudents(shuffled);
            setRawVnEduData([]); 
            
            setSavedClasses(prev => {
                const updated = {
                    ...prev,
                    [className]: {
                        className,
                        gradeLevel: 4,
                        students: shuffled,
                        rawExcelData: [],
                        rawExcelMerges: [],
                        lastModified: Date.now()
                    }
                };
                localStorage.setItem(DB_KEY, JSON.stringify(updated));
                return updated;
            });
        }
    }
    setIsProcessing(false);
  };

  const handleGenerateSubjectComments = async (subject: string) => {
    if (students.length === 0) return;
    setIsProcessing(true);
    const newStudents = [...students];
    await new Promise(resolve => setTimeout(resolve, 500));
    for (let i = 0; i < newStudents.length; i++) {
        const student = newStudents[i];
        const scoreData = student.subjects[subject];
        if (scoreData && (scoreData.score !== undefined || scoreData.grade)) {
            const comment = generateSubjectCommentFromTemplate(
                student.name, subject, scoreData.score, scoreData.grade, templates
            );
            newStudents[i] = { ...student, subjectComments: { ...student.subjectComments, [subject]: comment } };
        }
    }
    setStudents([...newStudents]); 
    setIsProcessing(false);
  };

  const handleUpdateSubjectComment = (studentId: string, subject: string, newComment: string) => {
      setStudents(prev => prev.map(s => {
          if (s.id !== studentId) return s;
          return { ...s, subjectComments: { ...s.subjectComments, [subject]: newComment } };
      }));
  };

  const handleGenerateNLPC = async () => {
    if (students.length === 0) return;
    setIsProcessing(true);
    const newStudents = [...students];
    await new Promise(resolve => setTimeout(resolve, 600));
    for (let i = 0; i < newStudents.length; i++) {
        const student = newStudents[i];
        const levels = student.nlpcLevels || { nlChung: 'Đạt', nlDacThu: 'Đạt', phamChat: 'Đạt', hbs: 'Đạt' };
        
        const getRandomNLPCTemplate = (cat: 'NL_CHUNG' | 'NL_DACTHU' | 'PHAM_CHAT' | 'HBS', lvl: 'Tốt'|'Đạt'|'CCG', gr: number) => {
             const candidates = nlpcTemplates.filter(t => t.category === cat && t.level === lvl && t.gradeLevel === gr);
             if(candidates.length === 0) {
                 const fallback = nlpcTemplates.filter(t => t.category === cat && t.level === lvl && t.gradeLevel === 4);
                 if(fallback.length === 0) return "";
                 const tpls = fallback.flatMap(t => t.templates);
                 return tpls[Math.floor(Math.random() * tpls.length)];
             }
             const tpls = candidates.flatMap(t => t.templates);
             return tpls[Math.floor(Math.random() * tpls.length)];
          };

          const c1 = getRandomNLPCTemplate('NL_CHUNG', levels.nlChung, selectedGrade);
          const c2 = getRandomNLPCTemplate('NL_DACTHU', levels.nlDacThu, selectedGrade);
          const c3 = getRandomNLPCTemplate('PHAM_CHAT', levels.phamChat, selectedGrade);
          const c4 = getRandomNLPCTemplate('HBS', levels.hbs, selectedGrade);

          newStudents[i] = { ...student, commentNLChung: c1, commentNLDacThu: c2, commentPhamChat: c3, commentHBS: c4 };
      }
      setStudents([...newStudents]);
      setIsProcessing(false);
    };
    
    const handleRegenerateSingleNLPC = (studentId: string, category: 'nlChung'|'nlDacThu'|'phamChat'|'hbs') => {
        setStudents(prev => prev.map(s => {
            if (s.id !== studentId) return s;
            const levels = s.nlpcLevels || { nlChung: 'Đạt', nlDacThu: 'Đạt', phamChat: 'Đạt', hbs: 'Đạt' };
            const lvl = levels[category];
            let catKey: any = category === 'nlChung' ? 'NL_CHUNG' : category === 'nlDacThu' ? 'NL_DACTHU' : category === 'phamChat' ? 'PHAM_CHAT' : 'HBS';
            
            const getRandomNLPCTemplate = (cat: any, lvl: any, gr: number) => {
               const candidates = nlpcTemplates.filter(t => t.category === cat && t.level === lvl && t.gradeLevel === gr);
               if(candidates.length === 0) {
                   const fallback = nlpcTemplates.filter(t => t.category === cat && t.level === lvl && t.gradeLevel === 4);
                   if(fallback.length === 0) return "";
                   const tpls = fallback.flatMap(t => t.templates);
                   return tpls[Math.floor(Math.random() * tpls.length)];
               }
               const tpls = candidates.flatMap(t => t.templates);
               return tpls[Math.floor(Math.random() * tpls.length)];
            };
  
            const comment = getRandomNLPCTemplate(catKey, lvl, selectedGrade);
            const field = category === 'nlChung' ? 'commentNLChung' : category === 'nlDacThu' ? 'commentNLDacThu' : category === 'phamChat' ? 'commentPhamChat' : 'commentHBS';
            return { ...s, [field]: comment };
        }));
    };
  
    const handleUpdateNLPCLevel = (studentId: string, category: 'nlChung'|'nlDacThu'|'phamChat'|'hbs', level: 'Tốt'|'Đạt'|'CCG') => {
        setStudents(students.map(s => s.id === studentId ? { ...s, nlpcLevels: { ...(s.nlpcLevels || {} as any), [category]: level } } : s));
    };

    const handleUpdateNLPCComment = (studentId: string, category: 'nlChung'|'nlDacThu'|'phamChat'|'hbs', content: string) => {
        setStudents(prev => prev.map(s => {
            if (s.id !== studentId) return s;
            const field = category === 'nlChung' ? 'commentNLChung'
                        : category === 'nlDacThu' ? 'commentNLDacThu'
                        : category === 'phamChat' ? 'commentPhamChat'
                        : 'commentHBS';
            return { ...s, [field]: content };
        }));
    };
  
    const handleBulkUpdateNLPCLevel = (category: 'nlChung'|'nlDacThu'|'phamChat'|'hbs', level: 'Tốt'|'Đạt'|'CCG') => {
        if (confirm(`Bạn có chắc chắn muốn đặt tất cả học sinh thành mức "${level}" cho mục này không?`)) {
            setStudents(students.map(s => ({ ...s, nlpcLevels: { ...(s.nlpcLevels || {} as any), [category]: level } })));
        }
    };
  
    const handleResetData = () => {
        if (confirm("CẢNH BÁO QUAN TRỌNG:\n\nHành động này sẽ:\n1. Xóa toàn bộ dữ liệu lớp học.\n2. Khôi phục thư viện mẫu về mặc định ban đầu.\n\nBạn có chắc chắn muốn tiếp tục?")) {
            localStorage.removeItem(DB_KEY);
            localStorage.removeItem(SETTINGS_KEY);
            localStorage.removeItem(NLPC_DB_KEY);
            LocalDatabase.resetToDefault(); 
            window.location.reload();
        }
    };
  
  if (isAuthChecking) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">Đang kiểm tra quyền truy cập...</p>
            </div>
        </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={() => {}} />;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 font-sans text-gray-900">
        <Sidebar 
          activeModule={activeModule} 
          setActiveModule={setActiveModule}
          onUploadVnEdu={handleUploadVnEdu}
          onSelectGrade={handleSelectGrade} 
          selectedGrade={selectedGrade} 
          onUploadNLPC={() => {}} 
          onResetData={handleResetData}
          hasStudents={students.length > 0}
          hasTemplates={templates.length > 0}
          hasNLPC={students.length > 0 && !!students[0].nlpcLevels}
          
          savedClasses={Object.keys(savedClasses)}
          currentClassName={currentClassName}
          onLoadClass={loadClass}
          onDeleteClass={handleDeleteClass}
          onBackupData={handleBackupData}
          onRestoreData={handleRestoreData}
          onManualSave={handleManualSave}
        />
  
        <div className="flex-1 p-4 md:p-8 md:h-screen h-auto overflow-hidden flex flex-col">
          {activeModule === ModuleType.VNEDU_UPLOAD && (
            <ModuleVnEdu 
              students={students} 
              rawExcelData={rawVnEduData}
              rawExcelMerges={rawVnEduMerges}
            />
          )}
          
          {activeModule === ModuleType.SUBJECT_COMMENTS && (
            <ModuleSubjects 
              students={students} 
              onGenerate={handleGenerateSubjectComments} 
              onUpdateComment={handleUpdateSubjectComment}
              isProcessing={isProcessing}
              templates={templates}
              onDeleteTemplate={handleDeleteTemplate}
              onAddTemplate={handleAddTemplate}
            />
          )}
  
          {activeModule === ModuleType.NLPC_UPLOAD && (
              <ModuleNLPC 
                  students={students}
                  onGenerate={handleGenerateNLPC}
                  isProcessing={isProcessing}
                  onUpdateLevel={handleUpdateNLPCLevel}
                  onUpdateComment={handleUpdateNLPCComment}
                  onBulkUpdateLevel={handleBulkUpdateNLPCLevel}
                  onRegenerateSingle={handleRegenerateSingleNLPC}
                  selectedGrade={selectedGrade}
                  nlpcTemplates={nlpcTemplates}
                  onAddTemplate={handleAddNLPCTemplate}
                  onDeleteTemplate={handleDeleteNLPCTemplate}
              />
          )}
        </div>
      </div>
    );
}