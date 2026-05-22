import argparse
import os

import certifi
import pandas as pd
from dotenv import load_dotenv
from pymongo import MongoClient
from tqdm import tqdm


load_dotenv()

DB_NAME = os.getenv("DB_NAME", "spotify")
BATCH_SIZE = 1000

INT_COLS = ["popularity", "duration_ms", "key", "mode", "time_signature"]
FLOAT_COLS = [
    "danceability",
    "energy",
    "loudness",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
    "tempo",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Load Spotify CSV into MongoDB tracks_raw.")
    parser.add_argument(
        "--csv",
        default=os.getenv("CSV_PATH", "dataset.csv"),
        help="Path to Kaggle dataset.csv file.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    mongo_uri = os.environ["MONGO_URI"]

    client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
    db = client[DB_NAME]

    db["tracks_raw"].drop()

    df = pd.read_csv(args.csv)
    print(f"Завантажуємо {len(df)} треків...")

    df["explicit"] = df["explicit"].astype(bool)

    for col in INT_COLS:
        df[col] = df[col].fillna(0).astype(int)

    for col in FLOAT_COLS:
        df[col] = df[col].fillna(0).astype(float)

    required_missing = df["artists"].isna() | df["track_name"].isna()
    records = df[~required_missing].to_dict("records")

    for i in tqdm(range(0, len(records), BATCH_SIZE)):
        db["tracks_raw"].insert_many(records[i : i + BATCH_SIZE])

    print(f"Завантажено документів: {db['tracks_raw'].count_documents({})}")
    print("Приклад документа:")
    print(db["tracks_raw"].find_one())

    client.close()


if __name__ == "__main__":
    main()
