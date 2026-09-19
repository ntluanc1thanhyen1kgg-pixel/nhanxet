import { GoogleGenAI, Type } from "@google/genai";
import { Student, CommentTemplate } from '../types';

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key chưa được cấu hình.");
  }
  return new GoogleGenAI({ apiKey });
};

// NEW: Generate comment LOCALLY from templates (No AI)
export const generateSubjectCommentFromTemplate = (
  studentName: string,
  subject: string,
  score: number | undefined,
  grade: string | undefined,
  templates: CommentTemplate[]
): string => {
  // 1. Determine Range/Level
  let range = '';
  
  if (score !== undefined) {
    if (score >= 9) range = '9-10';
    else if (score >= 7) range = '7-8';
    else if (score >= 5) range = '5-6';
    else range = '<5';
  } else if (grade) {
    range = grade; // HTT, HT, CHT
  } else {
    return ""; // No data
  }

  // 2. Filter templates for this subject and range
  // Normalize subject name for comparison (e.g. "Toán" vs "toán", "TH-CN" vs "Tin học")
  const normalizedSubject = subject.toLowerCase().trim();
  
  // NEW: Create a list of target ranges to search for.
  // This maps scores to grades and vice versa to share templates.
  const targetRanges = [range];
  if (range === '9-10') targetRanges.push('HTT');
  if (range === '7-8') targetRanges.push('HT');
  // if (range === '5-6') targetRanges.push('HT'); // Optional: map 5-6 to HT if you want generic good comments for passing scores
  if (range === 'HTT') targetRanges.push('9-10');
  if (range === 'HT') {
      targetRanges.push('7-8');
      targetRanges.push('5-6'); // Cho phép lấy mẫu câu mức "Hoàn thành" (5-6) cho học sinh đạt mức HT
  }

  const matchingTemplates = templates.filter(t => {
    const tSub = t.subject.toLowerCase();
    
    // Direct match
    if (tSub === normalizedSubject) return true;
    
    // Alias Matching for common VNedu abbreviations
    if (tSub === 'tin học' && (normalizedSubject === 'th-cn' || normalizedSubject === 'tin' || normalizedSubject.includes('tin học'))) return true;
    if (tSub === 'công nghệ' && (normalizedSubject === 'cn' || normalizedSubject === 'kỹ thuật' || normalizedSubject.includes('công nghệ'))) return true;
    if (tSub === 'lịch sử và địa lý' && (normalizedSubject === 'ls&đl' || normalizedSubject.includes('lịch sử') || normalizedSubject.includes('địa lý'))) return true;
    if (tSub === 'tự nhiên và xã hội' && (normalizedSubject === 'tn&xh' || normalizedSubject === 'tnxh')) return true;
    
    // Updated Alias for GDTC
    if (tSub === 'giáo dục thể chất' && (normalizedSubject === 'gdtc' || normalizedSubject === 'thể dục' || normalizedSubject === 'td' || normalizedSubject === 'thể thao' || normalizedSubject.includes('thể dục') || normalizedSubject.includes('thể chất'))) return true;
    
    if (tSub === 'hoạt động trải nghiệm' && (normalizedSubject === 'hđtn' || normalizedSubject === 'hđtn&hn' || normalizedSubject.includes('trải nghiệm'))) return true;
    
    // Added other missing aliases
    if (tSub === 'tiếng anh' && (normalizedSubject.includes('anh') || normalizedSubject === 'av' || normalizedSubject === 'nn' || normalizedSubject === 'ngoại ngữ')) return true;
    if (tSub === 'âm nhạc' && (normalizedSubject === 'an' || normalizedSubject === 'nhạc' || normalizedSubject.includes('âm nhạc') || normalizedSubject.includes('nghệ thuật'))) return true;
    if ((tSub === 'mỹ thuật' || tSub === 'mĩ thuật') && (normalizedSubject === 'mt' || normalizedSubject === 'vẽ' || normalizedSubject.includes('mỹ thuật') || normalizedSubject.includes('mĩ thuật') || normalizedSubject.includes('nghệ thuật'))) return true;
    
    return false;
  }).filter(t => targetRanges.includes(t.range));

  // 3. Flatten the list of strings
  const availableSentences = matchingTemplates.flatMap(t => t.templates);

  if (availableSentences.length === 0) {
    // Fallback generic comments if no template found
    if (range === '9-10' || range === 'HTT') return `Hoàn thành xuất sắc nhiệm vụ môn học ${subject}.`;
    if (range === '7-8' || range === 'HT') return `Hoàn thành tốt nội dung môn ${subject}.`;
    return `Cần cố gắng hơn trong môn ${subject}.`;
  }

  // 4. Pick a random sentence
  const randomIndex = Math.floor(Math.random() * availableSentences.length);
  return availableSentences[randomIndex];
};

// OLD: Generate comments for a specific subject (Using AI) - Kept for reference or hybrid mode
export const generateSubjectCommentAI = async (
  studentName: string,
  subject: string,
  score: number | undefined,
  grade: string | undefined,
  templates: CommentTemplate[]
): Promise<string> => {
  try {
    const ai = getAiClient();
    
    // Filter templates relevant to this subject
    const subjectTemplates = templates.filter(t => t.subject.toLowerCase() === subject.toLowerCase());
    
    // Determine range text for internal logic
    let range = '';
    let performance = '';
    
    if (score !== undefined) {
      if (score >= 9) { range = '9-10'; performance = 'Hoàn thành xuất sắc (Điểm 9-10)'; }
      else if (score >= 7) { range = '7-8'; performance = 'Hoàn thành tốt (Điểm 7-8)'; }
      else if (score >= 5) { range = '5-6'; performance = 'Hoàn thành (Điểm 5-6)'; }
      else { range = '<5'; performance = 'Chưa hoàn thành/Cần cố gắng (Điểm dưới 5)'; }
    } else if (grade) {
      range = grade; // HTT, HT, CHT
      performance = grade === 'HTT' ? 'Hoàn thành tốt' : grade === 'HT' ? 'Đạt' : 'Cần cố gắng';
    }

    const relevantTemplates = subjectTemplates.filter(t => t.range === range).flatMap(t => t.templates);
    const templateString = relevantTemplates.length > 0 ? relevantTemplates.join("; ") : "Không có mẫu cụ thể.";

    const prompt = `
      Bạn là một giáo viên tiểu học Việt Nam tận tâm. Nhiệm vụ của bạn là viết một câu nhận xét ngắn gọn (1-2 câu) vào sổ học bạ (theo Thông tư 27) cho môn ${subject}.

      Thông tin học sinh:
      - Họ tên: ${studentName}
      - Điểm Kiểm Tra Định Kỳ (KTĐK) từ VNedu: ${score !== undefined ? `${score} điểm` : `(Không có điểm số)`}
      - Xếp loại: ${grade || 'Chưa xếp loại'}
      - Đánh giá sơ bộ: ${performance}

      Yêu cầu QUAN TRỌNG:
      1. Căn cứ CHÍNH XÁC vào Điểm KTĐK (${score ?? 'N/A'}) để đưa ra nhận xét. Đừng nhận xét chung chung nếu có điểm số cụ thể.
      2. Nếu điểm 9-10: Khen ngợi sự vượt trội, nắm chắc kiến thức, kỹ năng thành thạo.
      3. Nếu điểm 7-8: Khen ngợi hoàn thành tốt, cần cẩn thận hơn một chút để đạt kết quả cao hơn.
      4. Nếu điểm 5-6: Ghi nhận sự cố gắng, nhưng cần ôn luyện thêm các phần kiến thức cơ bản.
      5. Nếu điểm dưới 5: Động viên nhẹ nhàng, cần rèn luyện thêm nhiều.
      6. Sử dụng mẫu câu sau để tham khảo (viết lại tự nhiên): "${templateString}"
      7. Chỉ trả về nội dung nhận xét, không thêm lời dẫn.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text?.trim() || "Đã hoàn thành môn học.";
  } catch (error) {
    console.error("Lỗi Gemini:", error);
    return "Lỗi khi tạo nhận xét.";
  }
};

// Generate NLPC comments
export const generateNLPCCommentAI = async (
  student: Student
): Promise<{ nlComment: string; pcComment: string }> => {
  try {
    const ai = getAiClient();
    
    const ratingsStr = JSON.stringify(student.nlpcRatings);

    const prompt = `
      Bạn là giáo viên chủ nhiệm lớp tiểu học. Dựa vào đánh giá Năng Lực và Phẩm Chất sau đây của học sinh ${student.name}, hãy viết 2 đoạn nhận xét riêng biệt.

      Dữ liệu đánh giá: ${ratingsStr}
      Quy tắc:
      - Tốt: Khen ngợi, khích lệ.
      - Đạt: Ghi nhận, nhắc nhở nhẹ để tốt hơn.
      - CCG (Cần cố gắng): Động viên, đề xuất biện pháp hỗ trợ, ngôn ngữ tích cực.

      Yêu cầu đầu ra JSON:
      {
        "nlComment": "Nhận xét về các năng lực (Tự học, Giao tiếp, Hợp tác...)",
        "pcComment": "Nhận xét về phẩm chất (Chăm học, Trách nhiệm, Tự phục vụ...)"
      }
      Đảm bảo không lặp lại từ ngữ, văn phong tự nhiên, chân thành.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nlComment: { type: Type.STRING },
            pcComment: { type: Type.STRING }
          }
        }
      }
    });

    const json = JSON.parse(response.text || '{}');
    return {
      nlComment: json.nlComment || "Chưa có nhận xét.",
      pcComment: json.pcComment || "Chưa có nhận xét."
    };

  } catch (error) {
    console.error("Lỗi Gemini NLPC:", error);
    return { nlComment: "Lỗi hệ thống.", pcComment: "Lỗi hệ thống." };
  }
};