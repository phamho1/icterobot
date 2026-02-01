
import { Preset, GeminiVoice } from './types';

export const GEMINI_VOICES: GeminiVoice[] = [
  { name: 'Kore', label: 'Kore (Deep, Neutral)', gender: 'neutral' },
  { name: 'Puck', label: 'Puck (Cheerful, High-pitch)', gender: 'neutral' },
  { name: 'Charon', label: 'Charon (Steady, Mature)', gender: 'neutral' },
  { name: 'Fenrir', label: 'Fenrir (Strong, Direct)', gender: 'neutral' },
  { name: 'Zephyr', label: 'Zephyr (Warm, Helpful)', gender: 'neutral' },
];

export const PRESETS: Record<'en' | 'vi', Preset[]> = {
  en: [
    {
      id: 'lesson-en',
      label: 'Classroom',
      text: "Welcome, everyone. Today we will practice speaking fluently.\nFirst, read the text silently. Then, answer my questions in complete sentences."
    },
    {
      id: 'news-en',
      label: 'News Style',
      text: "Global education is changing rapidly as AI tools become more accessible. Many teachers are exploring new ways to provide timely feedback."
    },
    {
      id: 'dialogue-en',
      label: 'Short Dialogue',
      text: "A: Good morning. How are you today?\nB: I'm doing well, thanks. How about you?"
    }
  ],
  vi: [
    {
      id: 'lesson-vi',
      label: 'Lớp học',
      text: "Chào mừng các em đến với lớp học. Hôm nay chúng ta sẽ luyện kỹ năng nói trôi chảy.\nĐầu tiên, các em hãy đọc thầm văn bản, sau đó trả lời các câu hỏi."
    },
    {
      id: 'news-vi',
      label: 'Bản tin',
      text: "Giáo dục toàn cầu đang thay đổi nhanh chóng khi các công cụ AI trở nên dễ tiếp cận hơn. Nhiều giáo viên đang khám phá những cách thức mới để phản hồi kịp thời."
    },
    {
      id: 'poem-vi',
      label: 'Thơ ca',
      text: "Trong đầm gì đẹp bằng sen\nLá xanh bông trắng lại chen nhị vàng\nNhị vàng bông trắng lá xanh\nGần bùn mà chẳng hôi tanh mùi bùn."
    }
  ]
};

export const DEFAULT_TEXT = "Welcome to ICTE Robots Text-to-Speech. Experience the power of AI-driven voice synthesis with browser-native and Gemini advanced models.";
