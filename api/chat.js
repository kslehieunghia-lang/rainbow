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

  const { type, mode, lang, messages } = req.body;

  let systemPrompt;
  if (type === 'story') {
    systemPrompt = lang === 'vi' ? PROMPTS.story_vi : PROMPTS.story_en;
  } else {
    const key = (mode || 'kid') + '_' + (lang || 'vi');
    systemPrompt = PROMPTS[key] || PROMPTS.kid_vi;
  }

  // Chuyển format sang chuẩn Gemini (user / model)
  const contents = (messages || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  // CHÚ Ý: Anh dán trực tiếp Khóa API mới (đuôi ...I374) vào giữa hai dấu nháy dưới đây nhé
  const REAL_GEMINI_KEY = "AIzaSyD08-L65stY2GTiNjik8hbKN9GPWeWI374";

  try {
    // Đổi model thành gemini-1.5-flash để tránh lỗi 403
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${REAL_GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { 
            maxOutputTokens: 1000,
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();

    // Kiểm tra nếu Google trả về lỗi hệ thống thì báo ra log
    if (data.error) {
      return res.status(200).json({ ok: false, text: 'Lỗi Google API: ' + data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (text) {
      return res.status(200).json({ ok: true, text: text });
    }
    
    return res.status(200).json({ ok: false, text: 'Mimi chưa hiểu, nói lại nhé!' });

  } catch (e) {
    return res.status(500).json({ ok: false, text: 'Lỗi kết nối server: ' + e.message });
  }
}
