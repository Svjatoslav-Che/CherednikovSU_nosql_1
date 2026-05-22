// Запуск: mongosh "ВАШ_URI/spotify" --file queries/part3_aggregations.js

db = db.getSiblingDB("spotify");

print("\n1. Топ-10 виконавців за середньою популярністю");
printjson(
  db.tracks
    .aggregate([
      { $unwind: "$artists" },
      {
        $group: {
          _id: "$artists",
          tracks_count: { $sum: 1 },
          avg_popularity: { $avg: "$popularity" }
        }
      },
      { $match: { tracks_count: { $gte: 5 } } },
      {
        $project: {
          _id: 0,
          artist: "$_id",
          tracks_count: 1,
          avg_popularity: { $round: ["$avg_popularity", 1] }
        }
      },
      { $sort: { avg_popularity: -1, tracks_count: -1 } },
      { $limit: 10 }
    ])
    .toArray()
);

print("\n2. Розподіл треків за настроєм");
printjson(
  db.tracks
    .aggregate([
      {
        $set: {
          mood: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ["$audio_features.valence", 0.5] },
                      { $gte: ["$audio_features.energy", 0.5] }
                    ]
                  },
                  then: "happy"
                },
                {
                  case: {
                    $and: [
                      { $lt: ["$audio_features.valence", 0.5] },
                      { $gte: ["$audio_features.energy", 0.5] }
                    ]
                  },
                  then: "angry"
                },
                {
                  case: {
                    $and: [
                      { $gte: ["$audio_features.valence", 0.5] },
                      { $lt: ["$audio_features.energy", 0.5] }
                    ]
                  },
                  then: "calm"
                }
              ],
              default: "sad"
            }
          }
        }
      },
      { $group: { _id: "$mood", tracks_count: { $sum: 1 } } },
      { $project: { _id: 0, mood: "$_id", tracks_count: 1 } },
      { $sort: { tracks_count: -1 } }
    ])
    .toArray()
);

print("\n3. Найбільш танцювальні жанри");
printjson(
  db.tracks
    .aggregate([
      {
        $group: {
          _id: "$track_genre",
          tracks_count: { $sum: 1 },
          avg_danceability: { $avg: "$audio_features.danceability" },
          avg_energy: { $avg: "$audio_features.energy" },
          avg_valence: { $avg: "$audio_features.valence" }
        }
      },
      { $match: { tracks_count: { $gte: 100 } } },
      {
        $project: {
          _id: 0,
          genre: "$_id",
          tracks_count: 1,
          avg_danceability: { $round: ["$avg_danceability", 3] },
          avg_energy: { $round: ["$avg_energy", 3] },
          avg_valence: { $round: ["$avg_valence", 3] }
        }
      },
      { $sort: { avg_danceability: -1, avg_energy: -1, avg_valence: -1 } },
      { $limit: 10 }
    ])
    .toArray()
);
