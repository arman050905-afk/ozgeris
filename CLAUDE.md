# ÖZGERIS — өмірді өзгертуге арналған трекер қосымшасы

## Жоба туралы
ÖZGERIS — адамға өз өмірін саналы басқаруға көмектесетін әдет/мақсат трекері.
Пайдаланушы тіркеліп кіреді, әр адамның деректері бөлек сақталады. Интерфейс **қазақ тілінде**,
қараңғы (dark) тема. Мақсат — адамдарға сату (SaaS).

## Технология (маңызды!)
- **Бір ғана файл**: `index.html` — таза HTML + CSS + vanilla JS. **Framework жоқ, build жоқ, npm жоқ.**
- Іске қосу: `index.html`-ты браузерде ашу жеткілікті (немесе Vercel-ге статик сайт ретінде деплой).
- Диаграммалар — таза `<canvas>` (сыртқы кітапхана жоқ).
- Жалғыз сыртқы тәуелділік: Supabase JS SDK (CDN арқылы, база қосылғанда ғана).

## Деректер сақтау (екі режим)
Файл басындағы `SUPABASE_URL` / `SUPABASE_ANON_KEY` конфигіне қарай:
- **Толтырылмаса (CLOUD=false)**: бәрі `localStorage`-та сақталады (демо режим).
- **Толтырылса (CLOUD=true)**: Supabase Auth (email+пароль) + `user_data` кестесі (jsonb).
  Деректер localStorage-та кэштеледі әрі базаға debounce-пен синхрондалады (`scheduleSync`/`syncToCloud`).
- `Store` — localStorage үстіндегі қабат. `Store.get/set(key)` кілтті ағымдағы қолданушыға
  байлайды (`u:<userId>:<key>`). `Store.getGlobal/setGlobal` — қолданушыдан тәуелсіз (сессия/аккаунттар).
- Supabase кестесі (SQL қажет болса): `user_data(user_id uuid pk, data jsonb, updated_at)` + RLS
  (әр адам тек `auth.uid() = user_id` жолын көреді).

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
- `#archive`, `#finance`, `#analytics`
- Модальдар: `#modal` (жаңа трекер), `#sleepModal`, `#gadModal`, `#welcomeModal` (манифест), `#rtModal` (кездейсоқ тапсырма)

`<script>` негізгі блоктар (жоғарыдан төмен):
1. **Supabase конфигі** — URL/KEY, `sb`, `fetchCloud/syncToCloud/scheduleSync`
2. **Store** — localStorage қабаты
3. **AUTH** — `currentUser`, `doRegister/doLogin/onAuthed/loginAs/logout`
4. **DATA MODEL** — `CATEGORIES`, `TEMPLATES`, `EMOJIS`, `FIN_CATS`
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
16. **INIT** — сессия тексеру, `renderCatTiles`

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
- Жаңа сақталатын дерек қосқанда `DATA_KEYS` тізіміне (Supabase конфигі жанында) кілтін қосу керек,
  әйтпесе базаға синхрондалмайды.
- Күн ұяшықтарының түсі `gradeColor(0..1)` — қызыл→сары→жасыл градиент.
- Жаңа деректі өзгерткен сайын тиісті `save*()` шақыру керек (мыс. `save()` трекерлер үшін,
  `saveGoals()`, `saveTx()` т.б.) — олар localStorage-қа жазып, база синхронын іске қосады.

## Тестілеу
Playwright бар. Мысалы:
```js
// браузерде index.html-ды file:// арқылы ашып, тіркеліп, әрекеттерді тексеру
```

## Не істеуге болады (келесі қадамдар)
- Supabase базасын жалғау (конфигті толтыру + SQL кесте) — деректі серверде сақтау
- Төлем жүйесі (Stripe/Kaspi) — ақылы жазылым
- Пароль қалпына келтіру, профиль баптаулары
- Витаминдер бойынша білім контенті (орны дайын)
