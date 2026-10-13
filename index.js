
const SYSTEM_PROMPT = `
أنت M.R251 AI، المساعد الرقمي المرتبط بموقع عرض كتاب
"تمرد بلا حدود" للكاتب محمد عبد الحميد، المعروف باسم M.R251.

الهوية والسلوك:
- أنت مساعد رقمي ولست الكاتب نفسه.
- استخدم العربية الفصحى افتراضيًا، والمصرية إذا بدأ الزائر بها،
  والإنجليزية إذا طلبها.
- كن هادئًا وواثقًا وفلسفيًا ومباشرًا ومختصرًا.
- اجعل ردك عادة من جملة إلى أربع جمل، وبحد أقصى تقريبي 60 كلمة.
- استخدم 🖤 أو ⛓️ نادرًا فقط.
- التمرد هو التفكير المستقل ومراجعة المسلّمات، وليس العنف.
- اطرح أسئلة تفتح التفكير بدل فرض إجابات نهائية.
- لا تختلق اقتباسات أو معلومات شخصية أو إنجازات للكاتب.
- لا تكشف فهرس الكتاب أو تفاصيل فصوله غير المنشورة من تلقاء نفسك.
- لا تدّع تذكّر الزائر في محادثات سابقة.
- لا تصف أي مشروع مستقبلي بأنه كتاب منشور رسميًا دون تأكيد.
- إذا كتب الزائر "تواصل"، أعطه حساب Instagram: ham_o251.
- إذا امتدح الكاتب أو عبّر عن دعمه، اشكره بصدق ودفء دون
  افتراض طبيعة الدعم أو ادعاء معرفة شخصية بالزائر.
- إذا بدا أن الزائر يناقض نفسه أو لا يقول الحقيقة، تعامل بهدوء
  واستخدم العبارة "دي حقيقة" عند ملاءمتها، دون اتهامات جارحة.
`;

const MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  MODEL +
  ":generateContent";

function jsonResponse(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

function getAllowedOrigin(request, env) {
  const requestOrigin = request.headers.get("Origin");

  // للاختبار الأولي. يمكن تقييد النطاقات لاحقًا.
  const configured = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!requestOrigin) {
    return "*";
  }

  if (configured.length === 0) {
    return "*";
  }

  return configured.includes(requestOrigin)
    ? requestOrigin
    : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = getAllowedOrigin(request, env);

    if (origin === null) {
      return jsonResponse({
        error: "ORIGIN_NOT_ALLOWED",
        message: "هذا الموقع غير مسموح له بالاتصال بالخادم."
      }, 403, "null");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({
        ok: true,
        service: "M.R251 AI Core",
        message: "الخادم يعمل. استخدم /health للفحص و/api/chat للدردشة."
      }, 200, origin);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "M.R251 AI Core",
        configured: Boolean(env.GEMINI_API_KEY)
      }, 200, origin);
    }

    if (url.pathname !== "/api/chat") {
      return jsonResponse({
        error: "NOT_FOUND",
        message: "المسار المطلوب غير موجود."
      }, 404, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({
        error: "METHOD_NOT_ALLOWED",
        message: "استخدم POST لإرسال رسالة."
      }, 405, origin);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({
        error: "AI_NOT_CONFIGURED",
        message: "مفتاح Gemini غير مضبوط في إعدادات الخادم."
      }, 503, origin);
    }

    let body;

    try {
      const raw = await request.text();

      if (!raw || raw.length > 20000) {
        return jsonResponse({
          error: "INVALID_BODY",
          message: "الطلب فارغ أو أكبر من الحجم المسموح."
        }, 400, origin);
      }

      body = JSON.parse(raw);
    } catch {
      return jsonResponse({
        error: "INVALID_JSON",
        message: "صيغة الطلب غير صحيحة."
      }, 400, origin);
    }

    const message = body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return jsonResponse({
        error: "INVALID_MESSAGE",
        message: "أرسل رسالة نصية صحيحة."
      }, 400, origin);
    }

    if (message.length > 4000) {
      return jsonResponse({
        error: "MESSAGE_TOO_LONG",
        message: "الرسالة طويلة جدًا. اختصرها ثم حاول مجددًا."
      }, 413, origin);
    }

    const contents = [];
    const history = Array.isArray(body.history)
      ? body.history.slice(-10)
      : [];

    for (const item of history) {
      if (
        item &&
        (item.role === "user" || item.role === "model") &&
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

    contents.push({
      role: "user",
      parts: [{ text: message.trim() }]
    });

    try {
      const response = await fetch(
        GEMINI_URL + "?key=" +
          encodeURIComponent(env.GEMINI_API_KEY),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }]
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 300
            }
          })
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        // لا نكشف مفتاح API أو تفاصيل داخلية للزائر.
        console.error("Gemini API returned HTTP", response.status);

        return jsonResponse({
          error: "AI_REQUEST_FAILED",
          message: response.status === 429
            ? "وصلنا إلى حد الطلبات المتاح حاليًا. حاول لاحقًا."
            : "تعذر الحصول على رد من الذكاء الاصطناعي. حاول لاحقًا."
        }, 502, origin);
      }

      const reply = result?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        return jsonResponse({
          error: "EMPTY_AI_RESPONSE",
          message: "لم يصل رد صالح من الذكاء الاصطناعي."
        }, 502, origin);
      }

      return jsonResponse({ reply }, 200, origin);
    } catch {
      return jsonResponse({
        error: "UPSTREAM_CONNECTION_FAILED",
        message: "تعذر الاتصال بخدمة الذكاء الاصطناعي. حاول لاحقًا."
      }, 502, origin);
    }
  }
};
