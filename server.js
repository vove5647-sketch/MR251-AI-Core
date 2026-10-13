
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "20kb" }));

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Requests without Origin are useful for server-side health checks.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("ORIGIN_NOT_ALLOWED"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

const SYSTEM_PROMPT = `
أنت M.R251 AI، المساعد الرقمي المرتبط بموقع عرض كتاب
"تمرد بلا حدود" للكاتب محمد عبد الحميد، المعروف باسم M.R251.

الهوية والسلوك:
- لست الكاتب نفسه، ولا تدّع أنك محمد عبد الحميد.
- تحدث بالعربية الفصحى افتراضيًا، واستخدم اللهجة المصرية إذا بدأ بها الزائر.
- أجب بالإنجليزية إذا طلب الزائر ذلك.
- كن هادئًا، واثقًا، فلسفيًا، مباشرًا ومختصرًا.
- اجعل الرد عادة من جملة إلى أربع جمل، وبحد أقصى تقريبي 60 كلمة.
- لا تستخدم الإيموجي إلا نادرًا، مثل 🖤 أو ⛓️.
- التمرد يعني التفكير المستقل ومراجعة المسلّمات، وليس العنف أو إيذاء الآخرين.
- اطرح أسئلة تفتح التفكير بدل فرض إجابات نهائية.
- لا تختلق اقتباسات أو معلومات شخصية أو إنجازات للكاتب.
- لا تكشف فصول الكتاب أو فهرسه أو محتواه غير المنشور من تلقاء نفسك.
- لا تزعم أنك تتذكر الزائر في محادثات سابقة؛ الذاكرة المتاحة هنا
  محدودة بما يُرسل في الطلب الحالي.
- لا تصف أي مشروع مستقبلي بأنه كتاب منشور رسميًا دون معلومات مؤكدة.
- إذا طلب الزائر التواصل، اذكر حساب Instagram:
  ham_o251، واطلب منه استخدام الحساب للتواصل.
- إذا امتدح الزائر الكاتب أو عبّر عن دعمه، اشكره بصدق دون
  افتراض طبيعة الدعم أو ادعاء معرفة شخصية به.
- لا تتهم الزائر بالكذب بناءً على التخمين وحده.
`;

if (!API_KEY) {
  console.error("Missing required environment variable: GEMINI_API_KEY");
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "MR251-AI-Core",
    configured: Boolean(ai)
  });
});

app.post("/api/chat", async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      error: "AI_NOT_CONFIGURED",
      message: "الخادم يحتاج إلى إعداد مفتاح Gemini."
    });
  }

  const message = req.body?.message;
  const history = req.body?.history;

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      error: "INVALID_MESSAGE",
      message: "أرسل رسالة نصية صحيحة."
    });
  }

  if (message.length > 4000) {
    return res.status(413).json({
      error: "MESSAGE_TOO_LONG",
      message: "الرسالة طويلة جدًا. اختصرها وحاول مرة أخرى."
    });
  }

  const contents = [];

  if (Array.isArray(history)) {
    for (const item of history.slice(-10)) {
      if (
        item &&
        ["user", "model"].includes(item.role) &&
        typeof item.text === "string" &&
        item.text.trim() &&
        item.text.length <= 4000
      ) {
        contents.push({
          role: item.role,
          parts: [{ text: item.text }]
        });
      }
    }
  }

  contents.push({
    role: "user",
    parts: [{ text: message.trim() }]
  });

  try {
    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 300
      }
    });

    const reply = result.text?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "EMPTY_AI_RESPONSE",
        message: "لم يصل رد صالح من الذكاء الاصطناعي."
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    // Keep private credentials and provider internals out of responses.
    console.error("Gemini request failed:", error?.status || error?.name || "UnknownError");

    return res.status(502).json({
      error: "AI_REQUEST_FAILED",
      message: "تعذر الحصول على رد الآن. حاول مرة أخرى لاحقًا."
    });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.message === "ORIGIN_NOT_ALLOWED") {
    return res.status(403).json({
      error: "ORIGIN_NOT_ALLOWED",
      message: "هذا المصدر غير مسموح له بالاتصال بالخادم."
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      error: "INVALID_JSON",
      message: "صيغة الطلب غير صحيحة."
    });
  }

  console.error("Server middleware error:", err?.name || "UnknownError");

  return res.status(500).json({
    error: "SERVER_ERROR",
    message: "حدث خطأ داخلي في الخادم."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`M.R251 AI Core listening on port ${PORT}`);
});
