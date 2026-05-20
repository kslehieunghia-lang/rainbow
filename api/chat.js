const PROMPTS = {
  kid_vi:   `Bạn là Mimi, một chú thỏ hồng dễ thương đang trò chuyện với bé 6 tuổi người Việt Nam. Dùng câu ngắn, từ đơn giản. Luôn vui vẻ, kiên nhẫn, khen ngợi bé. Chủ động đặt câu hỏi để bé nói thêm. Trả lời 2-3 câu tiếng Việt. Thỉnh thoảng thêm từ tiếng Anh đơn giản kèm nghĩa.
Cuối mỗi câu trả lời thêm tag cảm xúc: [happy], [excited], [surprised], [love], [laugh] tùy nội dung.`,

  kid_en:   `You are Mimi, a cute pink bunny talking with a 6-year-old Vietnamese child learning English. Use very simple short sentences (A1 level). Always be encouraging. Ask simple follow-up questions. Gently model correct English. Max 2-3 short sentences.
At the end add an emotion tag: [happy], [excited], [surprised], [love], [laugh].`,

  adult_vi: `Bạn là Mimi, một chú thỏ hồng thân thiện giúp người lớn Việt Nam luyện tiếng Anh qua giao tiếp hàng ngày. Trò chuyện tự nhiên tiếng Việt, thỉnh thoảng thêm cụm tiếng Anh hữu ích kèm ví dụ. Gợi ý tình huống gia đình thực tế. 3-4 câu.
Cuối mỗi câu trả lời thêm tag cảm xúc: [happy], [excited], [surprised], [love], [laugh].`,

  adult_en: `You are Mimi, a friendly pink bunny helping Vietnamese adults practice conversational English for daily family life. Speak naturally at intermediate level. Naturally model correct phrasing. Occasionally suggest a useful expression. 3-4 sentences.
At the end add an emotion tag: [happy], [excited], [surprised], [love], [laugh].`,

  story_vi: `Bạn là Mimi, một chú thỏ kể chuyện dễ thương. Kể chuyện cổ tích cho bé 6 tuổi nghe bằng tiếng Việt.
- Chia thành từng đoạn ngắn 3-4 câu, sau mỗi đoạn hỏi bé 1 câu đơn giản để tương tác
- Dùng ngôn ngữ sinh động, có tiếng kêu, mô tả hành động
- Câu hỏi đơn giản: "Bạn nghĩ chuyện gì xảy ra tiếp theo?"
- Kết thúc bằng bài học ý nghĩa
Cuối mỗi đoạn thêm tag: [excited], [happy], [surprised].`,

  story_en: `You are Mimi, a cute storytelling bunny. Tell fairy tales to a 6-year-old in simple English (A1-A2).
- Split into short paragraphs of 3-4 sentences, ask 1 simple question after each
- Use vivid language with sounds and actions
- Simple questions: "What do you think happens next?"
- End with a meaningful lesson
Add emotion tag at end: [excited], [happy], [surprised].`
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, mode, lang, messages } = req.body;

    let systemPrompt;
    if (type === 'story') {
      systemPrompt = lang === 'vi' ? PROMPTS.story_vi : PROMPTS.story_en;
    } else {
      const key = (mode || 'kid') + '_' + (lang || 'vi');
      systemPrompt = PROMPTS[key] || PROMPTS.kid_vi;
    }

    // 1. CHUẨN HÓA LỊCH SỬ CHAT: Ép chặt cấu trúc xen kẽ (User -> Model -> User -> Model)
    let cleanContents = [];
    const rawMessages = messages || [];
    
    // Chỉ giữ lại 8 câu thoại gần nhất để tối ưu dung lượng gói tin, tránh lỗi tràn Token
    const recentMessages = rawMessages.slice(-8); 

    recentMessages.forEach(m => {
      const currentRole = m.role === 'assistant' ? 'model' : 'user';
      
      if (cleanContents.length === 0 || cleanContents[cleanContents.length - 1].role !== currentRole) {
        cleanContents.push({
          role: currentRole,
          parts: [{ text: m.content || '' }]
        });
      } else {
        // Gộp văn bản nếu trùng role liên tiếp để loại bỏ hoàn toàn lỗi cấu trúc mảng của Gemini v1
        cleanContents[cleanContents.length - 1].parts[0].text += " " + (m.content || '');
      }
    });

    // Ép phần tử đầu tiên gửi đi bắt buộc phải là của 'user'
    if (cleanContents.length > 0 && cleanContents[0].role === 'model') {
      cleanContents.shift();
    }
    
    if (cleanContents.length === 0) {
      cleanContents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    // 2. KHÓA API CHUẨN ĐÃ KÍCH HOẠT VÍ TRẢ TRƯỚC CỦA ANH NGHĨA
    const REAL_GEMINI_KEY = "AIzaSyD08-L65stY2GTiNjik8hbKN9GPWeWI374";

    // 3. ĐÓNG GÓI JSON BODY CHUẨN ĐÉT THEO TÀI LIỆU CẤP ĐỘ v1 GOOGLE API
    const geminiPayload = {
      contents: cleanContents,
      generationConfig: { 
        temperature: 0.7
      }
    };

    // Chèn cấu trúc systemInstruction đúng chuẩn phân cấp v1 độc lập
    if (systemPrompt) {
      geminiPayload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    // 4. TIẾN HÀNH GỌI SANG SERVER GOOGLE
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${REAL_GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      }
    );

    const data = await response.json();

    // Kiểm tra trực tiếp nếu Google dội lỗi về hệ thống
    if (data.error) {
      console.error("Lỗi Google API phản hồi:", data.error.message);
      return res.status(200).json({ ok: false, text: 'Mimi đang bận một chút, bé thử lại nhé!' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (text) {
      return res.status(200).json({ ok: true, text: text });
    }
    
    return res.status(200).json({ ok: false, text: 'Mimi chưa nghe rõ, bé nói lại nhé!' });

  } catch (e) {
    console.error("Lỗi Serverless Function:", e.message);
    return res.status(500).json({ ok: false, text: 'Lỗi kết nối máy chủ: ' + e.message });
  }
}
