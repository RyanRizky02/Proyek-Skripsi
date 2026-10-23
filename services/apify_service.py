
import os
import requests

from dotenv import load_dotenv

load_dotenv()

APIFY_BASE_URL = "https://api.apify.com/v2"

APIFY_TOKEN = os.getenv("APIFY_TOKEN", "").strip()

X_ACTOR_ID = os.getenv(
    "APIFY_X_ACTOR_ID",
    "apidojo~tweet-scraper"
).strip()

THREADS_ACTOR_ID = os.getenv(
    "APIFY_THREADS_ACTOR_ID",
    "igview-owner~threads-search-scraper"
).strip()

MAX_POSTS = int(
    os.getenv("APIFY_MAX_POSTS_PER_PLATFORM", "20")
)

TIMEOUT_SECONDS = int(
    os.getenv("APIFY_TIMEOUT_SECONDS", "300")
)


class ApifyError(Exception):
    """Error komunikasi dengan Apify."""


def check_apify_connection():
    """Memeriksa token Apify tanpa menjalankan actor."""
    if not APIFY_TOKEN:
        raise ApifyError(
            "APIFY_TOKEN belum diisi di file .env"
        )

    response = requests.get(
        f"{APIFY_BASE_URL}/users/me",
        headers={
            "Authorization": f"Bearer {APIFY_TOKEN}"
        },
        timeout=30
    )

    if not response.ok:
        raise ApifyError(
            f"Verifikasi token gagal: HTTP {response.status_code}. "
            "Periksa token dan akses akun Apify."
        )

    return response.json()


def run_actor(actor_id, actor_input):

    if not APIFY_TOKEN:
        raise ApifyError(
            "APIFY_TOKEN belum diisi di file .env"
        )

    if not actor_id:
        raise ApifyError("Actor ID belum dikonfigurasi.")

    url = (
        f"{APIFY_BASE_URL}/acts/"
        f"{actor_id}/run-sync-get-dataset-items"
    )

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {APIFY_TOKEN}",
                "Content-Type": "application/json"
            },
            json=actor_input,
            params={"format": "json", "clean": "true"},
            timeout=TIMEOUT_SECONDS
        )
    except requests.RequestException as exc:
        raise ApifyError(
            f"Gagal menghubungi Apify: {exc}"
        ) from exc

    if not response.ok:
        detail = response.text[:1000]
        raise ApifyError(
            f"Actor {actor_id} gagal, "
            f"HTTP {response.status_code}: {detail}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise ApifyError(
            "Apify tidak mengembalikan respons JSON yang valid."
        ) from exc

    if not isinstance(data, list):
        raise ApifyError(
            "Respons actor bukan daftar item dataset."
        )

    return data
