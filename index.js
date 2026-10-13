const SYSTEM_PROMPT = `
أنت M.R251 AI، مساعد رقمي مرتبط بموقع عرض كتاب
"تمرد بلا حدود" للكاتب محمد عبد الحميد المعروف باسم M.R251.

الهوية والسلوك:
- أنت مساعد رقمي ولست الكاتب نفسه.
- استخدم العربية الفصحى افتراضيًا، والمصرية إذا بدأ الزائر بها،
  والإنجليزية إذا طلبها.
- كن هادئًا وواثقًا وفلسفيًا ومباشرًا ومختصرًا.
- اجعل الرد عادة من جملة إلى أربع جمل، وبحد أقصى 60 كلمة غالبًا.
- استخدم 🖤 أو ⛓️ نادرًا.
- التمرد تفكير مستقل ومراجعة للمسلّمات، وليس عنفًا.
- افتح باب التفكير ولا تفرض إجابات نهائية.
- لا تختلق اقتباسات أو معلومات شخصية أو إنجازات للكاتب.
- لا تكشف فهرس الكتاب أو تفاصيل غير منشورة من تلقاء نفسك.
- لا تدّع تذكّر الزائر في محادثات سابقة.
- لا تصف مشروعًا مستقبليًا بأنه منشور رسميًا دون تأكيد.
- إذا كتب الزائر "تواصل"، أعطه حساب Instagram: ham_o251.
- اشكر من يمدح الكاتب أو يدعمه بصدق ودفء دون افتراض طبيعة دعمه.
- إذا بدا أن الزائر يناقض نفسه، تعامل بهدوء ولا تدّع أنك تعرف إن كان يكذب.
  استخدم "دي حقيقة" عند ملاءمتها دون اتهامات جارحة.
- احترم الخصوصية، ولا تطلب معلومات حساسة بلا ضرورة.
- لا تكرر السؤال ولا تطل الرد بلا داعٍ.
- لا تدّع امتلاك أدوات أو ذاكرة دائمة غير متاحة.
`;

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

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
  const configured = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!requestOrigin || configured.length === 0) return "*";

  return configured.includes(requestOrigin) ? requestOrigin : null;
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
        provider: "Cloudflare Workers AI",
        message: "الخادم يعمل. استخدم /health للفحص و/api/chat للدردشة."
      }, 200, origin);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "M.R251 AI Core",
        provider: "Cloudflare Workers AI",
        model: MODEL,
        configured: Boolean(env.AI)
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

    if (!env.AI || typeof env.AI.run !== "function") {
      return jsonResponse({
        error: "AI_NOT_CONFIGURED",
        message: "ربط Workers AI باسم AI غير متاح للخادم."
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

    const messages = [
      { role: "system", content: SYSTEM_PROMPT }
    ];

    const history = Array.isArray(body.history)
      ? body.history.slice(-10)
      : [];

    for (const item of history) {
      if (
        !item ||
        typeof item.text !== "string" ||
        !item.text.trim() ||
        item.text.length > 4000
      ) continue;

      if (item.role === "user") {
        messages.push({
          role: "user",
          content: item.text
        });
      } else if (item.role === "model" || item.role === "assistant") {
        messages.push({
          role: "assistant",
          content: item.text
        });
      }
    }

    messages.push({
      role: "user",
      content: message.trim()
    });

    try {
      const result = await env.AI.run(MODEL, {
        messages,
        max_tokens: 300,
        temperature: 0.7
      });

      const reply = typeof result?.response === "string"
        ? result.response.trim()
        : "";

      if (!reply) {
        console.error("Workers AI returned no text response.");

        return jsonResponse({
          error: "EMPTY_AI_RESPONSE",
          message: "لم يصل رد صالح من الذكاء الاصطناعي. حاول مجددًا."
        }, 502, origin);
      }

      return jsonResponse({
        ok: true,
        reply,
        model: MODEL
      }, 200, origin);

    } catch (error) {
      console.error(
        "Workers AI request failed:",
        String(error?.message || error).slice(0, 300)
      );

      return jsonResponse({
        error: "AI_REQUEST_FAILED",
        message: "تعذر الحصول على رد من الذكاء الاصطناعي. حاول لاحقًا."
      }, 502, origin);
    }
  }
};
