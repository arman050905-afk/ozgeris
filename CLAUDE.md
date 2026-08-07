# ÖZGERIS — өмірді өзгертуге арналған трекер қосымшасы

## Жоба туралы
ÖZGERIS — адамға өз өмірін саналы басқаруға көмектесетін әдет/мақсат трекері.
Пайдаланушы тіркеліп кіреді, әр адамның деректері бөлек сақталады. Интерфейс **қазақ тілінде**,
қараңғы (dark) тема. Мақсат — адамдарға сату (SaaS).

## Технология (маңызды!)
- **Фронтенд бір ғана файл**: `index.html` — таза HTML + CSS + vanilla JS. **Framework жоқ, build жоқ.**
- **Backend**: `api/` папкасындағы шағын Vercel serverless функциялар (`register.js`, `login.js`,
  `data.js`, ортақ көмекшілер `_db.js`/`_auth.js`) — Node.js, `package.json`-дағы 3 тәуелділік қана
  (`@neondatabase/serverless`, `bcryptjs`, `jsonwebtoken`). npm/build тек backend үшін керек, фронтенд
  өзгеріссіз таза HTML/CSS/JS болып қалады.
- Іске қосу: локалда `index.html`-ты ашу — UI көрінеді, бірақ cloud auth/sync backend-сіз жұмыс
  істемейді (`fetch('/api/...')` қатесі шығады, error хабары UI-де көрсетіледі). Толық жұмыс үшін
  Vercel-ге деплой керек (GitHub-тан авто-деплой қосулы).
- Диаграммалар — таза `<canvas>` (сыртқы кітапхана жоқ).
- **Иконкалар**: эмодзи жоқ — барлық UI иконка қолмен салынған SVG (`ICONS` объектісі + `ic(key)`
  көмекшісі, Store блогынан кейін анықталған). `ic('trash')` секілді шақыру `<svg>...</svg>` жол
  қайтарады, оны backtick template literal ішінде `${ic('key')}` етіп қою керек. **Ескерту**:
  `textContent` HTML-ды рендерлемейді — `ic()` нәтижесін `textContent`-ке емес, `innerHTML`-ге қою
  керек (мыс. `toast()`, `userBadge`, `togglePw` осылай істейді). Тек нағыз сыртқа кететін мәтінде
  (`navigator.share`/`clipboard.writeText` — `shareTracker()`-дегі `text`) эмодзи қасақана қалдырылған,
  өйткені ол HTML емес, таза мәтін ретінде WhatsApp/т.б. қолданбаға кетеді. `<option>` элементінің
  ішінде де SVG рендерленбейді — сол жерде тек plain text қалдыру керек.
- Дерекқор: **Neon** (serverless Postgres). Схема — `schema.sql` (Neon SQL Editor-де бір рет орындау
  керек). Vercel-де `DATABASE_URL` және `JWT_SECRET` env var орнатылуы міндетті — соларсыз `api/*`
  функциялары бірден 500 қатесін қайтарады (`_db.js`/`_auth.js` ішінде тексеріледі).

## Деректер сақтау
- **Auth**: `api/register.js`/`api/login.js` — email+пароль (bcrypt хэшпен, `users` кестесі),
  сәтті кіргенде JWT токен қайтарады (180 күн жарамды). Токен `Store.setGlobal('app_token', ...)`
  ішінде localStorage-та сақталады, әр сұранысында `Authorization: Bearer <token>`
  ретінде жіберіледі (`authToken()`, `apiCall()`).
- **Access control (ақылы SaaS моделі)**: `users.active` — аккаунтқа толық доступ бар ма (жаңа
  тіркелген адамда әдепкі `false`). `users.is_admin` — админ құқығы. JWT-де сақталмайды, әр сезімтал
  сұраныста DB-ден тексеріледі (`api/_admin.js`-тегі `requireAdmin`, `api/data.js`-тегі `active` тексеру).
  Логин/тіркелуден кейін клиент `/api/me` шақырып ағымдағы статусты алады (`loginAs()`):
  - `active=false` → `#pendingScreen` көрсетіледі (негізгі UI жабық, тек «Сатып алу» / «Шығу»).
  - `is_admin=true` → навигацияда `#adminNavLink` көрінеді, `#admin` view қолжетімді болады.
  Бірінші admin қолмен тағайындалады (`schema.sql` соңындағы SQL комментарийі немесе Neon SQL Editor-де
  `update users set is_admin=true, active=true where email=...`).
- **Admin панель**: `#admin` view, `renderAdmin()` — `GET /api/admin/users` арқылы барлық
  пайдаланушыны кесте етіп көрсетеді. Әрекеттер: «Доступ беру/алу» (`toggleAccess` →
  `POST /api/admin/grant`), «Пароль ысыру» (`resetPassPrompt` → `POST /api/admin/reset-password`,
  админ жаңа парольді қолмен енгізеді, bcrypt-пен қайта хэшталады). Барлық admin route
  `requireAdmin()`-мен қорғалған — тек `is_admin=true` жол ғана шақыра алады.
- **Сатып алу (WhatsApp)**: nav-дағы «🛒 Сатып алу» батырмасы және pending экрандағы батырма
  `buyClick()`-ті шақырады — ол `https://wa.me/77002723715?text=...` сілтемесін жаңа бетте ашады
  (пайдаланушының email-і хабарламаға қосылады). Бұл нағыз автоматты жіберу емес — WhatsApp
  ашылады, хабарлама дайын тұрады, адам өзі «Жіберу» басуы керек (браузерден серверсіз толық
  автоматты WhatsApp жіберу мүмкін емес, ол үшін WhatsApp Business API/Meta тіркелуі керек).
- **Дерек**: `api/data.js` — бір адамға бір жол (`user_data(user_id uuid pk, data jsonb, updated_at)`),
  GET/PUT арқылы. Клиент жағында:
  - `fetchCloud()` — кіргенде базадан тартып, `DATA_KEYS` тізіміндегі әр кілтті localStorage-қа құяды.
  - `scheduleSync()`/`syncToCloud()` — өзгеріс болғанда (debounce ~1.2с) ағымдағы жад күйін
    (`trackers, archived, hiddenTpl, userTpl, txs, calcCfg, goals, gratitude, seenWelcome`) толығымен
    PUT арқылы жібереді. Әр `save*()` функциясы соңында `scheduleSync()` шақырылады.
  - `cloudOk` — соңғы синхрон сәтті ме, соны white-flag ретінде сақтайды (backend қолжетімсіз болса
    да қолданушы localStorage кэшімен жұмыс істей береді).
- `Store` — localStorage үстіндегі қабат. `Store.get/set(key)` кілтті ағымдағы қолданушыға
  байлайды (`u:<userId>:<key>`). `Store.getGlobal/setGlobal` — қолданушыдан тәуелсіз (сессия/токен).

## Кодтың құрылымы (бәрі index.html ішінде)
`<head><style>`: CSS. `:root` айнымалылары — түстер (`--bg,--panel,--line,--text,--muted`,
категориялық палитра `--s1..--s8`, статус `--good/--warn/--crit`). Соңында `@media(max-width:760px)` —
телефон нұсқасы.

`<body>`: секциялар (әрқайсысы `.view`):
- `#authScreen` — кіру/тіркелу экраны (overlay)
- `header` — навигация (`.nav-links`, телефонда `.hamburger` мәзір)
- `#home` — категория плиткалары + жоғарыда «🗂 Архив» батырмасы
- `#category` — категория ішіндегі карточкалар (`#cardGrid`) + арнайы беттер (мақсат/шүкіршілік)
- `#mine` — «Менің трекерлерім» (ықшам карточка тор)
- `#detail` — бір трекердің толық беті (`#detailBody`)
- `#archive`, `#finance`, `#analytics`, `#admin` (пайдаланушыларды басқару, тек `is_admin`)
- `#pendingScreen` — доступ күту экраны (overlay, `active=false` кезде)
- Модальдар: `#modal` (жаңа трекер), `#sleepModal`, `#gadModal`, `#welcomeModal` (манифест), `#rtModal` (кездейсоқ тапсырма)

`<script>` негізгі блоктар (жоғарыдан төмен):
1. **Store** — localStorage қабаты
2. **ICONS** — `ICONS` объектісі + `ic(key)` көмекшісі (SVG иконка жүйесі, эмодзи орнына)
3. **CLOUD API** — `API_BASE`, `DATA_KEYS`, `apiCall/fetchCloud/syncToCloud/scheduleSync` (Neon+Vercel `api/`-мен байланыс)
4. **AUTH** — `currentUser`, `isAdmin`, `doRegister/doLogin/loginAs/logout`, `togglePw`, `buyClick`
5. **DATA MODEL** — `CATEGORIES`, `TEMPLATES`, `EMOJIS`, `FIN_CATS` (`emo` өрісі — icon key, эмодзи емес)
5. **STATE** — `trackers, archived, hiddenTpl, userTpl, txs, calcCfg, goals, gratitude` + `loadUserData()`
6. **Есептеу көмекшілері** — `daysPassed, totalDays, monthGrid, dtype, isDayBased, isDaySuccess,
   successDays, completion, currentStreak, bestStreak, BADGES, gradeColor, cellRatio, extendTracker`
7. **NAVIGATION** — `showView`, `toggleNav`
8. **HOME/CATEGORY** — `renderCatTiles, openCategory, renderCards, hideTemplate, delUserTpl`
9. **CREATE MODAL** — `openCreate, saveCustom, onTypeChange`
10. **MY TRACKERS / DETAIL** — `renderMine, openTracker, renderDetail, handleDay, editTracker,
    delTracker (архивке), shareTracker`; архив: `restoreTracker/purgeTracker/renderArchive`
11. **Арнайы трекерлер (kind)** — `renderSleep, renderMood, renderAnxiety (GAD-7), renderEmotion,
    renderEnglish (+BIZ_WORDS/giveWords), renderPodcast, renderVitamins`
12. **Категория беттері** — `renderGoalsPage/plansSection` (мақсат+жоспар), `renderGratitudePage`
13. **Қаржы** — `renderFinance, addIncome/addExpense, renderCalc` (табыс/шығын бөлек + бөлу калькуляторы)
14. **Диаграммалар** — `setupCanvas, drawFinPie, drawBar, drawLine, drawDetailChart, drawSleepChart,
    drawMoodChart, drawGadChart, drawGauge`
15. **Талдау** — `renderAnalytics, healthStats, renderHealthPanel, renderAchievements`
16. **ADMIN** — `renderAdmin, toggleAccess, resetPassPrompt` (тек `is_admin` пайдаланушыға көрінеді)
17. **INIT** — сессия тексеру, `renderCatTiles`

## Трекер деректер моделі
```js
{ id, name, cat, emo, desc, start:'YYYY-MM-DD',
  type: 'check'|'count'|'value',   // өлшеу түрі
  kind: null|'sleep'|'mood'|'anxiety'|'emotion'|'english'|'podcast'|'vitamins',
  goal, unit, goalMin, goalMax,    // count/value үшін
  days: []                          // ұзындығы 30-ға еселік (ай қосуға болады)
}
```
- `days` мазмұны түрге қарай: check→bool, count/value→number|null, sleep→{bed,wake,mood}, mood→1..5
- Арнайы kind-терде қосымша тізім өрістері: english→`words[]`, podcast→`items[]`,
  vitamins→`vits[]`, anxiety→`tests[]`, emotion→`entries[]`
- `isDayBased(t)` — трекер күн торына негізделген бе (тізім түрлілерден бөлу үшін)
- «Орындалды» деп саналуы `isDaySuccess(t,value)`-пен есептеледі; `completion` = successDays/totalDays

## Конвенциялар
- UI мәтіні — **қазақша**. Түстер тек `:root` айнымалылары арқылы.
- Жаңа сақталатын дерек қосқанда `DATA_KEYS` тізіміне (CLOUD API блогында) **және** `syncToCloud()`
  ішіндегі `data` объектісіне кілтін қосу керек, әйтпесе базаға синхрондалмайды.
- Күн ұяшықтарының түсі `gradeColor(0..1)` — қызыл→сары→жасыл градиент.
- Жаңа деректі өзгерткен сайын тиісті `save*()` шақыру керек (мыс. `save()` трекерлер үшін,
  `saveGoals()`, `saveTx()` т.б.) — олар localStorage-қа жазып, соңында `scheduleSync()` шақырып,
  база синхронын іске қосады. Жаңа `save*()` жазсаң, соңына `scheduleSync()` қосуды ұмытпа.

## Тестілеу
Playwright бар. `api/*` нағыз Neon/JWT env var-сыз локалда жұмыс істемейтіндіктен, backend-ті
тексеру үшін тесттерде нағыз API-мен бірдей контракты бар (`/api/register`, `/api/login`,
`/api/data` GET/PUT) жеңіл mock Node HTTP сервер қолдану ыңғайлы (нағыз auth/DB логикасыз, тек
in-memory), сосын Playwright сол серверге қарсы index.html ашып, толық ағынды (тіркелу → дерек
өзгерту → debounce sync → reload → cloud-тан қалпына келу) тексереді.

## Деплой (Vercel)
Repo GitHub-қа қосылған, Vercel авто-деплой етеді (жанды сайт: `ozgerisozindiozgert-swart.vercel.app`).
`DATABASE_URL`/`JWT_SECRET` Vercel-де орнатылған, `schema.sql` Neon-да орындалған — жұмыс істеп тұр.
Схема өзгерсе (жаңа баған қосу т.б.), `schema.sql`-ды жаңарту **жеткіліксіз** — production базаға
да қолмен ALTER TABLE орындау керек (Neon SQL Editor немесе `@neondatabase/serverless` арқылы
скрипт, connection string-ті ешбір repo файлына жазбай).

`PEXELS_API_KEY` (қосымша, міндетті емес) — `api/goal-image.js` осы кілт арқылы «Ақша жинау»
мақсатына сурет іздейді (pexels.com/api-де тегін тіркеліп алуға болады). Орнатылмаса, функция
жай ғана `image:null` қайтарады, UI суретсіз, бірақ қалғаны толық жұмыс істей береді.

## Не істеуге болады (келесі қадамдар)
- Төлем жүйесі (Stripe/Kaspi) — қазір WhatsApp-қа қолмен хабарласу + admin панельден қолмен
  доступ беру арқылы жұмыс істейді; толық автоматтандыру үшін төлем provider керек.
- Profile баптаулары (өз атыңды/паролыңды өзің өзгерту)
