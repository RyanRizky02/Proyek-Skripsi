
from flask import Flask, jsonify, render_template, request
from pathlib import Path
from services.search_service import search_social_media
from services.apify_service import (
    check_apify_connection,
    ApifyError
)
import json

app = Flask(__name__)

# Lokasi folder project
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

POSTS_FILE = DATA_DIR / "posts.json"
HISTORY_FILE = DATA_DIR / "search_history.json"


def initialize_json():
    """Membuat folder dan file JSON jika belum tersedia."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    default_files = {
        POSTS_FILE: {"posts": []},
        HISTORY_FILE: {"history": []}
    }

    for file_path, default_data in default_files.items():
        if not file_path.exists():
            file_path.write_text(
                json.dumps(
                    default_data,
                    ensure_ascii=False,
                    indent=2
                ),
                encoding="utf-8"
            )


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def status():
    return jsonify({
        "success": True,
        "application": "IsuLens",
        "message": "Backend Flask berjalan."
    })


@app.route("/api/posts")
def get_posts():
    try:
        with open(POSTS_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)

        return jsonify(data)

    except (OSError, json.JSONDecodeError):
        app.logger.exception("Gagal membaca posts.json")
        return jsonify({
            "success": False,
            "message": "Gagal membaca data postingan."
        }), 500

@app.route("/api/apify/status")
def apify_status():
    try:
        account = check_apify_connection()

        # Jangan mengirim token atau data sensitif ke browser.
        return jsonify({
            "success": True,
            "message": "Koneksi Apify berhasil.",
            "username": account.get("username")
        })

    except ApifyError as exc:
        return jsonify({
            "success": False,
            "message": str(exc)
        }), 400

    except Exception:
        app.logger.exception("Pemeriksaan Apify gagal")
        return jsonify({
            "success": False,
            "message": "Terjadi kesalahan saat memeriksa Apify."
        }), 500

@app.route("/api/search", methods=["POST"])
def api_search():
    body = request.get_json(silent=True) or {}
    query = body.get("query", "")

    if not isinstance(query, str) or not query.strip():
        return jsonify({
            "success": False,
            "message": "Kalimat pencarian wajib diisi."
        }), 400

    # BATAS MAKSIMAL 8 KATA
    query = query.strip()
    word_count = len(query.split())

    if word_count > 8:
        return jsonify({
            "success": False,
            "message": "Kalimat pencarian maksimal 8 kata."
        }), 400

    try:
        result = search_social_media(query)

        # DIAGNOSTIK GRAPH
        print("\n=== GRAPH STATS ===")
        print(json.dumps(result["graph"]["stats"], indent=2))

        print("\n=== CONTOH NODE ===")
        print(json.dumps(
            result["graph"]["nodes"][:3],
            ensure_ascii=False,
            indent=2
        ))

        print("\n=== CONTOH EDGE ===")
        print(json.dumps(
            result["graph"]["edges"][:5],
            ensure_ascii=False,
            indent=2
        ))

        print("\n=== MISSING PARENTS ===")
        print(json.dumps(
            result["graph"]["missing_parents"][:5],
            ensure_ascii=False,
            indent=2
        ))

        return jsonify(result)

    except ValueError as exc:
        return jsonify({
            "success": False,
            "message": str(exc)
        }), 400

    except Exception:
        app.logger.exception("Pencarian IsuLens gagal")
        return jsonify({
            "success": False,
            "message": (
                "Pencarian gagal. Periksa terminal Flask "
                "untuk melihat detail error."
            )
        }), 500

if __name__ == "__main__":
    initialize_json()
    app.run(debug=True)
