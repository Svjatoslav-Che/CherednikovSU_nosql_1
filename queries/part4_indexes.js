// Запуск: mongosh "ВАШ_URI/spotify" --file queries/part4_indexes.js

db = db.getSiblingDB("spotify");

function printStats(title, explainResult) {
  print(`\n${title}`);
  printjson({
    winningPlan: explainResult.queryPlanner.winningPlan,
    executionStats: {
      nReturned: explainResult.executionStats.nReturned,
      totalKeysExamined: explainResult.executionStats.totalKeysExamined,
      totalDocsExamined: explainResult.executionStats.totalDocsExamined,
      executionTimeMillis: explainResult.executionStats.executionTimeMillis
    }
  });
}

function dropIndexIfExists(indexName) {
  const existing = db.tracks.getIndexes().map((index) => index.name);

  if (existing.includes(indexName)) {
    db.tracks.dropIndex(indexName);
  }
}

print("\nЗавдання 1. Аналіз запиту до та після індексації");

dropIndexIfExists("idx_genre_popularity_danceability");

const partyPopQuery = {
  track_genre: "pop",
  "audio_features.danceability": { $gte: 0.7 }
};

const beforeIndex = db.tracks
  .find(partyPopQuery)
  .sort({ popularity: -1 })
  .explain("executionStats");

printStats("До створення індексу", beforeIndex);

db.tracks.createIndex(
  {
    track_genre: 1,
    popularity: -1,
    "audio_features.danceability": 1
  },
  { name: "idx_genre_popularity_danceability" }
);

const afterIndex = db.tracks
  .find(partyPopQuery)
  .sort({ popularity: -1 })
  .explain("executionStats");

printStats("Після створення індексу", afterIndex);

print("\nЗавдання 2. Індекс для пошуку музики для роботи");

dropIndexIfExists("idx_work_music");

db.tracks.createIndex(
  {
    explicit: 1,
    "audio_features.instrumentalness": 1,
    "audio_features.speechiness": 1
  },
  { name: "idx_work_music" }
);

const workMusicExplain = db.tracks
  .find({
    explicit: false,
    "audio_features.instrumentalness": { $gt: 0.5 },
    "audio_features.speechiness": { $lt: 0.1 }
  })
  .explain("executionStats");

printStats("План виконання для запиту музики для роботи", workMusicExplain);

print("\nЗавдання 3. Перевірка покривного запиту");
printjson(
  db.tracks
    .find(
      {
        track_genre: "pop",
        popularity: { $gte: 70 }
      },
      {
        _id: 0,
        track_genre: 1,
        popularity: 1
      }
    )
    .hint("idx_genre_popularity_danceability")
    .explain("executionStats")
);
