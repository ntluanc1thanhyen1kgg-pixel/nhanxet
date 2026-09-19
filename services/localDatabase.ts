
import { CommentTemplate, NLPCTemplate } from '../types';
import { FULL_TEMPLATES_DB } from './mockData';

// Bump version to ensure clean slate or migration if needed, 
// but the merge logic below handles preservation better.
const TEMPLATE_DB_KEY = 'tt27_templates_db_v3';

export const LocalDatabase = {
  /**
   * Khởi tạo hoặc lấy toàn bộ dữ liệu mẫu từ LocalStorage.
   * CẬP NHẬT: Tự động gộp (Merge) dữ liệu từ mockData vào dữ liệu đã lưu trong LocalStorage.
   * Điều này đảm bảo khi ứng dụng được cập nhật thêm mẫu mới (như GDTC), người dùng cũ vẫn thấy chúng.
   */
  getAllTemplates: (): CommentTemplate[] => {
    let finalTemplates = [...FULL_TEMPLATES_DB];
    
    try {
      const saved = localStorage.getItem(TEMPLATE_DB_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
           // Gộp dữ liệu mới từ Code (FULL_TEMPLATES_DB) vào Dữ liệu cũ của User (parsed)
           // incoming = FULL_TEMPLATES_DB (Chứa GDTC mới)
           // current = parsed (Dữ liệu cũ trong máy người dùng)
           console.log("Đang đồng bộ dữ liệu mẫu mới vào bộ nhớ trình duyệt...");
           finalTemplates = LocalDatabase.mergeTemplates(FULL_TEMPLATES_DB, parsed);
           
           // Lưu lại ngay trạng thái đã gộp để các lần sau không cần xử lý nhiều
           localStorage.setItem(TEMPLATE_DB_KEY, JSON.stringify(finalTemplates));
           return finalTemplates;
        }
      }
    } catch (e) {
      console.error("Lỗi khi đọc/gộp Database mẫu:", e);
    }
    
    // Nếu chưa có gì trong LocalStorage, lưu bản gốc
    LocalDatabase.saveTemplates(finalTemplates);
    return finalTemplates;
  },

  /**
   * Lưu toàn bộ thư viện mẫu xuống LocalStorage
   */
  saveTemplates: (templates: CommentTemplate[]) => {
    try {
      const jsonString = JSON.stringify(templates);
      localStorage.setItem(TEMPLATE_DB_KEY, jsonString);
    } catch (e) {
      console.error("Lỗi khi lưu Database mẫu:", e);
      // alert("Cảnh báo: Bộ nhớ trình duyệt đầy."); // Ẩn bớt alert phiền phức
    }
  },

  /**
   * Hàm chuyên biệt để tìm kiếm mẫu câu nhanh (Query)
   * Tối ưu hóa việc khớp tên môn học (bao gồm viết tắt)
   */
  findTemplates: (allTemplates: CommentTemplate[], grade: number, subject: string): CommentTemplate[] => {
    const normSubject = subject.toLowerCase().trim();
    
    // Tạo map các tên viết tắt phổ biến để query nhanh hơn
    const aliases: Record<string, string[]> = {
      'tin học': ['th-cn', 'tin', 'tin hoc'],
      'công nghệ': ['cn', 'kỹ thuật', 'cong nghe', 'kt'],
      'tiếng anh': ['anh', 'av', 'nn', 'ngoại ngữ', 'english'],
      'đạo đức': ['đđ', 'gdcd'],
      'khoa học': ['kh'],
      'lịch sử và địa lý': ['ls&đl', 'ls-đl', 'lịch sử', 'địa lý', 'sử', 'địa'],
      'giáo dục thể chất': ['gdtc', 'thể dục', 'td', 'thể thao'],
      'hoạt động trải nghiệm': ['hđtn', 'hđtn&hn', 'trải nghiệm', 'tn']
    };

    return allTemplates.filter(t => {
      if (t.gradeLevel !== grade) return false;
      const tSub = t.subject.toLowerCase();
      
      // Khớp chính xác
      if (tSub === normSubject) return true;

      // Khớp qua alias (Nếu template là 'giáo dục thể chất', check xem subject 'gdtc' có nằm trong alias không)
      if (aliases[tSub]) {
        return aliases[tSub].some(alias => normSubject === alias || normSubject.includes(alias));
      }
      
      // Khớp chứa (Fallback)
      return normSubject.includes(tSub) || tSub.includes(normSubject);
    });
  },

  /**
   * Logic gộp dữ liệu thông minh (Merge) for Subject Templates
   */
  mergeTemplates: (incoming: CommentTemplate[], current: CommentTemplate[]): CommentTemplate[] => {
    // Deep copy current db
    const newDb = current.map(item => ({
        ...item,
        templates: [...item.templates]
    }));

    let addedCount = 0;
    
    incoming.forEach(incomingItem => {
      // Tìm xem nhóm mẫu này đã tồn tại chưa
      const existingIdx = newDb.findIndex(t => 
        t.gradeLevel === incomingItem.gradeLevel && 
        t.subject.toLowerCase() === incomingItem.subject.toLowerCase() &&
        t.range === incomingItem.range
      );

      if (existingIdx > -1) {
        // Gộp danh sách câu (Set để loại trùng)
        const existingSentences = new Set(newDb[existingIdx].templates);
        let hasChange = false;
        
        incomingItem.templates.forEach(s => {
            if (!existingSentences.has(s)) {
                existingSentences.add(s);
                hasChange = true;
            }
        });

        if (hasChange) {
            newDb[existingIdx].templates = Array.from(existingSentences);
            addedCount++;
        }
      } else {
        // Thêm mới hoàn toàn nhóm mẫu
        newDb.push(incomingItem);
        addedCount++;
      }
    });
    
    if (addedCount > 0) console.log(`Đã cập nhật ${addedCount} nhóm mẫu môn học mới.`);
    return newDb;
  },

  /**
   * Logic gộp dữ liệu thông minh (Merge) for NLPC Templates
   */
  mergeNLPCTemplates: (incoming: NLPCTemplate[], current: NLPCTemplate[]): NLPCTemplate[] => {
    // Deep copy current db
    const newDb = current.map(item => ({
        ...item,
        templates: [...item.templates]
    }));

    let addedCount = 0;

    incoming.forEach(incomingItem => {
      const existingIdx = newDb.findIndex(t => 
        t.gradeLevel === incomingItem.gradeLevel && 
        t.category === incomingItem.category &&
        t.level === incomingItem.level
      );

      if (existingIdx > -1) {
        const existingSentences = new Set(newDb[existingIdx].templates);
        let hasChange = false;

        incomingItem.templates.forEach(s => {
            if (!existingSentences.has(s)) {
                existingSentences.add(s);
                hasChange = true;
            }
        });

        if (hasChange) {
            newDb[existingIdx].templates = Array.from(existingSentences);
            addedCount++;
        }
      } else {
        newDb.push(incomingItem);
        addedCount++;
      }
    });
    
    if (addedCount > 0) console.log(`Đã cập nhật ${addedCount} nhóm mẫu NLPC mới.`);
    return newDb;
  },

  resetToDefault: () => {
    localStorage.removeItem(TEMPLATE_DB_KEY);
    localStorage.setItem(TEMPLATE_DB_KEY, JSON.stringify(FULL_TEMPLATES_DB));
    return FULL_TEMPLATES_DB;
  }
};