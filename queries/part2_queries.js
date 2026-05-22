// Запуск: mongosh "ВАШ_URI/spotify" --file queries/part2_queries.js

db = db.getSiblingDB("spotify");

print("\n1. Треки для вечірки");
printjson(
  db.tracks
    .find(
      {
        "audio_features.danceability": { $gt: 0.7 },
        "audio_features.energy": { $gt: 0.7 },
        duration_ms: { $gte: 180000, $lte: 300000 }
      },
      {
        _id: 0,
        track_name: 1,
        artists: 1,
        popularity: 1,
        duration_ms: 1,
        "audio_features.danceability": 1,
        "audio_features.energy": 1
      }
    )
    .sort({ popularity: -1 })
    .limit(20)
    .toArray()
);

print("\n2. Виконавці, у яких усі треки популярні");
printjson(
  db.tracks
    .aggregate([
      { $unwind: "$artists" },
      {
        $group: {
          _id: "$artists",
          tracks_count: { $sum: 1 },
          min_popularity: { $min: "$popularity" },
          avg_popularity: { $avg: "$popularity" }
        }
      },
      { $match: { tracks_count: { $gte: 3 }, min_popularity: { $gte: 60 } } },
      {
        $project: {
          _id: 0,
          artist: "$_id",
          tracks_count: 1,
          min_popularity: 1,
          avg_popularity: { $round: ["$avg_popularity", 1] }
        }
      },
      { $sort: { avg_popularity: -1, tracks_count: -1, artist: 1 } },
      { $limit: 20 }
    ])
    .toArray()
);

print("\n3. Нетипові треки з високим темпом у межах жанру");
printjson(
  db.tracks
    .aggregate([
      {
        $group: {
          _id: "$track_genre",
          avg_tempo: { $avg: "$audio_features.tempo" },
          std_tempo: { $stdDevPop: "$audio_features.tempo" },
          tracks: {
            $push: {
              _id: "$_id",
              track_name: "$track_name",
              popularity: "$popularity",
              artists: "$artists",
              audio_features: { tempo: "$audio_features.tempo" }
            }
          }
        }
      },
      {
        $set: {
          outlier_threshold: {
            $add: ["$avg_tempo", { $multiply: [2, "$std_tempo"] }]
          }
        }
      },
      {
        $project: {
          _id: 0,
          genre: "$_id",
          avg_tempo: { $round: ["$avg_tempo", 1] },
          outlier_threshold: { $round: ["$outlier_threshold", 1] },
          outlier_tracks: {
            $filter: {
              input: "$tracks",
              as: "track",
              cond: {
                $gt: ["$$track.audio_features.tempo", "$outlier_threshold"]
              }
            }
          }
        }
      },
      { $match: { "outlier_tracks.0": { $exists: true } } },
      { $sort: { genre: 1 } }
    ])
    .toArray()
);

print("\n4. Треки для фонової роботи");
printjson(
  db.tracks
    .find(
      {
        "audio_features.loudness": { $lt: -10 },
        "audio_features.speechiness": { $lt: 0.1 },
        "audio_features.instrumentalness": { $gt: 0.5 },
        explicit: false
      },
      {
        _id: 0,
        track_name: 1,
        artists: 1,
        track_genre: 1,
        popularity: 1,
        "audio_features.loudness": 1,
        "audio_features.speechiness": 1,
        "audio_features.instrumentalness": 1
      }
    )
    .sort({ popularity: -1 })
    .limit(20)
    .toArray()
);
