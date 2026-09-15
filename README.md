# Safe Bot Core

نسخة آمنة وقابلة للتوسيع لبوت حماية المجموعات.

## شنو كيدير؟

- `protect on/off` لحماية صورة المجموعة والاسم واللقب.
- `protect photo on/off` لحماية صورة المجموعة فقط.
- `protect name on/off` لحماية الاسم فقط.
- `protect nickname on/off` لحماية اللقب فقط.
- `developer` لعرض بطاقة المطوّر والصورة.
- `help` أو `.` لعرض الأوامر.
- مكافحة الرسائل المتسارعة: تحذير، كتم مؤقت، ثم إزالة عند تكرار السبام.
- رسالة ترحيب عند إضافة البوت.
- `zll on/off` مرفوض عمداً لأنه كيسبب flood وكيزعج أعضاء المجموعة.
- غير الـAdmin أو الـModerator يقدر يبدل إعدادات الحماية.

البوت ما كينفذش الإهانات، الرسائل الجنسية، التحرش، أو الطرد بسبب كثرة الكلام فقط.

## التشغيل

```bash
npm start
```

أو:

```bash
node src/index.js
```

## API تجريبية

فحص الحالة:

```bash
curl http://localhost:3000/health
```

إرسال رسالة للبوت:

```bash
curl -X POST http://localhost:3000/webhook \
  -H 'content-type: application/json' \
  -d '{"type":"message","groupId":"demo","userId":"user-1","text":"protect on","isAdmin":true}'
```

إضافة عضو:

```bash
curl -X POST http://localhost:3000/webhook \
  -H 'content-type: application/json' \
  -d '{"type":"member_added","groupId":"demo","userId":"user-1"}'
```

## ربط Messenger أو منصة أخرى

هذا المستودع فيه المحرك الآمن وواجهة webhook، وما فيهش Adapter ديال منصة محددة لأن المستودع الأصلي كان خاوي وما تحددتش المنصة.

الـAdapter خاصو يحول أحداث المنصة إلى الصيغة التالية:

```json
{
  "type": "message",
  "groupId": "group-id",
  "userId": "user-id",
  "messageId": "message-id",
  "text": "help",
  "isAdmin": false,
  "isModerator": false
}
```

ومن بعد ينفذ actions اللي كيرجعها `/webhook` داخل API ديال المنصة.

## إعدادات وملفات البوت

- `config/bot-name.json` — اسم البوت والاسم المختصر ورسالة الترحيب.
- `.env.example` — إعدادات التشغيل ومكافحة السبام وحماية webhook.
- `config/cookies.example.json` — نموذج فارغ فقط، بلا Cookies حقيقية.
- `src/adapters/README.md` — قواعد بناء Adapter آمن للمنصة.

ما كاينش ملف Cookies حقيقي فالمشروع. Cookies ديال الجلسة أسرار حساسة وقد تعطي
تحكم فالحساب، لذلك استعمل OAuth أو Secrets الرسمية وما ترفعهاش إلى GitHub.

## صورة المطوّر

الصورة موجودة في `assets/developer-profile.jpg` وكتستعملها بطاقة `developer`.

## حماية webhook

إلى عيّنت `WEBHOOK_TOKEN`، خاص كل طلب يرسل:

```text
Authorization: Bearer <WEBHOOK_TOKEN>
```

ما تحطش القيمة الحقيقية فـ GitHub؛ استعمل متغير بيئة أو Replit Secret.

## المزامنة التلقائية مع GitHub

كاين سكريبت `scripts/sync-to-github.mjs` كيراقب ملفات البوت ويبعث أي تعديل
من Replit إلى فرع `main` فـ GitHub. المزامنة اتجاه واحد: Replit إلى GitHub.

السكريبت:

- كيجمع التعديلات القريبة في commit واحد.
- كيتجاهل `.env` وملفات Cookies و`node_modules`.
- ما كيحتاجش Token أو Cookie؛ كيستعمل GitHub connector الرسمي ديال Replit.
- يقدر يخدم كتجربة بلا كتابة باستعمال `SYNC_DRY_RUN=1`.
- كيتفقد التغييرات كل 5 ثواني بشكل افتراضي باش ما يستهلكش طلبات GitHub بزاف.

شغلو يدوياً من جذر المشروع:

```bash
node bot/scripts/sync-to-github.mjs
```