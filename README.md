# Spotify Tracks Analytics з MongoDB

Проєктування документоорієнтованої схеми MongoDB, написання MQL-запитів, aggregation pipeline та оптимізації через індекси.

## Структура

```
.
├── .env.example
├── .gitignore
├── requirements.txt
├── scripts/
│   ├── 01_load_data.py
│   └── 02_transform.js
├── queries/
│   ├── part2_queries.js
│   ├── part3_aggregations.js
│   └── part4_indexes.js
└── README.md
```

Файл `.env` не додається в репозиторій, бо містить приватний MongoDB Atlas connection string.

## Запуск

1. Створити та заповнити `.env`:

```env
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/
```

2. Встановити залежності:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Завантажити `dataset.csv` із Kaggle у корінь проєкту.

4. Завантажити сирі дані:

```bash
python scripts/01_load_data.py --csv dataset.csv
```

5. Трансформувати `tracks_raw` у `tracks`:

```bash
mongosh "$MONGO_URI" --file scripts/02_transform.js
```

6. Запустити запити:

```bash
mongosh "$MONGO_URI/spotify" --file queries/part2_queries.js
mongosh "$MONGO_URI/spotify" --file queries/part3_aggregations.js
mongosh "$MONGO_URI/spotify" --file queries/part4_indexes.js
```
  Відплдвідні результати: screenshots/part2_queries.bmp
                          screenshots/part3_aggregations.bmp
                          screenshots/part4_indexes.bmp

## Частина 1. Проєктування схеми

Після трансформації сирий CSV-документ перетворюється на таку структуру:

```javascript
{
  track_id: "...",
  track_name: "...",
  album_name: "...",
  artists: ["Artist 1", "Artist 2"],
  explicit: false,
  popularity: 73,
  duration_ms: 210000,
  duration_sec: 210.0,
  track_genre: "pop",
  popularity_tier: "high",
  audio_features: {
    danceability: 0.82,
    energy: 0.71,
    loudness: -5.2,
    speechiness: 0.04,
    acousticness: 0.12,
    instrumentalness: 0.0,
    liveness: 0.08,
    valence: 0.65,
    tempo: 124.4,
    key: 1,
    mode: 1,
    time_signature: 4
  }
}
```

### 1. Чому audio_features винесені в окремий об'єкт?

Аудіо-характеристики є однією смисловою групою: `danceability`, `energy`, `tempo`, `valence`, `loudness` та інші поля описують не бізнес-метадані треку, а його аудіо-профіль. Вкладення в `audio_features` робить документ читабельнішим і дозволяє логічно відокремити технічні характеристики від назви, альбому, жанру та популярності.

Таке вкладення вигідне, коли поля часто використовуються разом, належать до одного об'єкта доменної моделі та не потребують окремої колекції. Проблеми можуть з'явитися, якщо вкладений об'єкт стає дуже великим, часто оновлюється незалежно від основного документа або якщо потрібно часто індексувати багато вкладених полів у різних комбінаціях.

### 2. Чому виконавці зберігаються як масив?

Один трек може мати кількох виконавців, тому масив точніше моделює зв'язок many-to-many на рівні документа. Масив дає змогу шукати треки конкретного артиста простим запитом `artists: "Artist Name"`, використовувати `$in`, `$all`, `$size`, а також розгортати виконавців через `$unwind` для аналітики по кожному артисту.

Якби виконавці зберігалися рядком, довелося б робити неточні текстові пошуки або регулярні вирази, що гірше для продуктивності та може давати помилкові збіги.

### 3. Що таке $out і чим він відрізняється від $merge?

`$out` записує результат aggregation pipeline у колекцію. Якщо колекція вже існує, вона замінюється результатом pipeline. Це зручно для повної перебудови похідної колекції, як у цьому завданні: `tracks_raw` повністю трансформується в нову `tracks`.

`$merge` теж записує результат pipeline, але може оновлювати або додавати документи в існуючу колекцію за заданим ключем. Його краще використовувати для інкрементальних оновлень, коли не треба повністю видаляти попередній результат.

## Частина 2. Запити

Файл: `queries/part2_queries.js`.

Реалізовано:

- пошук треків для вечірки за `audio_features.danceability`, `audio_features.energy` та `duration_ms`;
- пошук артистів, у яких мінімум 3 треки і всі мають популярність від 60;
- пошук темпових outlier-треків у межах жанру через `$avg` і `$stdDevPop`;
- пошук не-explicit інструментальних треків для фонової роботи.

### 1. Для чого використовується $unwind?

`$unwind` розгортає масив у кілька документів. Якщо документ має `artists: ["A", "B"]`, після `$unwind: "$artists"` pipeline отримає два документи: один для `A`, другий для `B`. Це потрібно, коли аналітика має рахувати не треки як цілі документи, а окремі елементи масиву, наприклад статистику по кожному виконавцю.

### 2. Чим $stdDevPop відрізняється від $stdDevSamp?

`$stdDevPop` рахує стандартне відхилення для всієї генеральної сукупності. У цьому завданні всі треки жанру в колекції розглядаються як повний набір для аналізу жанру.

`$stdDevSamp` рахує стандартне відхилення для вибірки та використовує поправку Бесселя. Його варто застосовувати, коли дані є лише вибіркою з більшої сукупності.

## Частина 3. Aggregation Pipeline

Файл: `queries/part3_aggregations.js`.

Реалізовано:

- топ-10 виконавців за середньою популярністю за умови мінімум 5 треків;
- розподіл треків за настроєм через `valence` та `energy`;
- рейтинг найбільш танцювальних жанрів із фільтром мінімум 100 треків.

### 1. Як зміниться результат, якщо поріг для виконавців знизити до 1 або підняти до 50?

Якщо знизити поріг до 1, у топ можуть потрапити артисти з одним випадково дуже популярним треком. Такий результат буде менш стабільним статистично, бо середня популярність одного треку не описує загальну якість або популярність артиста.

Якщо брати тільки артистів із більш ніж 50 треками, залишаться переважно дуже продуктивні або широко представлені в датасеті виконавці. Результат буде стабільнішим, але менш різноманітним: частина популярних артистів із меншою кількістю треків зникне з рейтингу.

### 2. Чи зміниться результат, якщо для жанрів знизити поріг зі 100 до 50?

Може змінитися, якщо в датасеті є жанри з 50-99 треками та високими середніми значеннями `danceability`. Нижчий поріг допускає менш представлені жанри, тому рейтинг стає більш чутливим до випадкових значень. Поріг 100 робить результат надійнішим, бо середні значення рахуються на більшій кількості треків.

## Частина 4. Індекси та оптимізація

Файл: `queries/part4_indexes.js`.

### Завдання 1. Індекс для жанру, популярності та танцювальності

Запит:

```javascript
db.tracks.find({
  track_genre: "pop",
  "audio_features.danceability": { $gte: 0.7 }
}).sort({ popularity: -1 }).toArray();
```

Створений індекс:

```javascript
db.tracks.createIndex(
  {
    track_genre: 1,
    popularity: -1,
    "audio_features.danceability": 1
  },
  { name: "idx_genre_popularity_danceability" }
);
```

Порядок полів обрано так: спочатку точна умова `track_genre`, потім поле сортування `popularity`, потім діапазонний фільтр `audio_features.danceability`.

### 1. Що змінилося в плані виконання?

До створення індексу MongoDB має сканувати багато документів колекції, тому у плані зазвичай видно `COLLSCAN`, а також окремий етап сортування `SORT`.

Після створення індексу план має використовувати `IXSCAN`. Кількість переглянутих документів і ключів повинна зменшитися, а сортування може виконуватися за порядком індексу.

Фактичні значення після запуску:

```text
До індексу:
stage: COLLSCAN
totalDocsExamined: вставити значення з explain()
totalKeysExamined: 0
executionTimeMillis: вставити значення з explain()

Після індексу:
stage: IXSCAN
indexName: idx_genre_popularity_danceability
totalDocsExamined: вставити значення з explain()
totalKeysExamined: вставити значення з explain()
executionTimeMillis: вставити значення з explain()
```

### 2. Як зрозуміти, що індекс використовується?

Індекс використовується, якщо в `explain()` у `winningPlan` або вкладених етапах є `stage: "IXSCAN"` та `indexName: "idx_genre_popularity_danceability"`. Також це підтверджують поля `totalKeysExamined` і зменшення `totalDocsExamined` порівняно з виконанням без індексу.

Місце для скріншота:

```text
Вставити скріншот explain() після створення індексу.
```

### Завдання 2. Індекс для музики для роботи

Створений індекс:

```javascript
db.tracks.createIndex(
  {
    explicit: 1,
    "audio_features.instrumentalness": 1,
    "audio_features.speechiness": 1
  },
  { name: "idx_work_music" }
);
```

Для запиту:

```javascript
db.tracks.find({
  explicit: false,
  "audio_features.instrumentalness": { $gt: 0.5 },
  "audio_features.speechiness": { $lt: 0.1 }
});
```

Очікуване підтвердження в `explain()`:

```text
stage: IXSCAN
indexName: idx_work_music
totalKeysExamined: вставити значення з explain()
totalDocsExamined: вставити значення з explain()
```

### Завдання 3. Чи є запит покривним?

Запит:

```javascript
db.tracks.find({
  track_genre: "pop",
  popularity: { $gte: 70 }
});
```

У такому вигляді запит не є покривним, навіть якщо існує індекс `idx_genre_popularity_danceability`. Причина в тому, що без проєкції `find()` повертає повні документи, а індекс містить тільки `track_genre`, `popularity` і `audio_features.danceability`. Щоб повернути `track_name`, `artists`, `album_name`, `audio_features` та інші поля, MongoDB мусить читати самі документи з колекції.

Запит міг би бути покривним лише тоді, коли всі поля у фільтрі і всі поля у результаті є в індексі, а `_id` явно виключено, якщо `_id` не входить до індексу. Наприклад:

```javascript
db.tracks.find(
  {
    track_genre: "pop",
    popularity: { $gte: 70 }
  },
  {
    _id: 0,
    track_genre: 1,
    popularity: 1
  }
);
```

Такий варіант може бути покривним для індексу, який містить `track_genre` і `popularity`.

## Висновок

У роботі створено повний цикл: завантаження CSV у `tracks_raw`, трансформація в документоорієнтовану колекцію `tracks`, прикладні запити, аналітичні aggregation pipeline та індекси з перевіркою через `explain()`.
