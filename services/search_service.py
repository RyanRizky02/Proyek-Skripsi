
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import json

from services.apify_service import (
    run_actor,
    X_ACTOR_ID,
    THREADS_ACTOR_ID,
    MAX_POSTS,
    ApifyError
)
from services.keyword_expansion import expand_threads_keywords


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
POSTS_FILE = DATA_DIR / "posts.json"
HISTORY_FILE = DATA_DIR / "search_history.json"


def read_json(path, default):
    if not path.exists():
        return default

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def write_json(path, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp.replace(path)


def first_value(item, *keys):
    for key in keys:
        value = item.get(key)
        if value is not None and value != "":
            return value
    return None


def normalize_post(item, platform, query):
    """Menormalisasi postingan sekaligus metadata relasi graph."""
    raw_author = first_value(item, "author", "user")

    username = first_value(
        item,
        "username", "userName", "authorUsername",
        "ownerUsername"
    )

    # Pada X, username bisa berada di dalam objek author.
    if not username and isinstance(raw_author, dict):
        username = first_value(
            raw_author, "userName", "username", "screen_name"
        )

    text = first_value(
        item, "text", "fullText", "full_text", "content",
        "caption", "postText", "tweetText"
    )

    post_id = first_value(
        item, "id", "postId", "post_id", "tweetId",
        "tweet_id", "shortcode", "postCode", "code"
    )

    url = first_value(
        item, "url", "postUrl", "post_url", "permalink"
    )

    created_at = first_value(
        item, "createdAt", "created_at", "timestamp",
        "date", "publishedAt"
    )

    likes = first_value(item, "likes", "likeCount", "likesCount")
    replies = first_value(
        item, "replies", "replyCount", "repliesCount"
    )
    reposts = first_value(
        item, "retweets", "retweetCount", "repostCount",
        "shares", "shareCount", "repost_count"
    )

    # Metadata relasi balasan.
    if platform == "X":
        parent_id = first_value(item, "inReplyToId")
        is_reply = item.get("isReply", bool(parent_id))
        parent_username = first_value(item, "inReplyToUsername")
    else:
        parent_id = first_value(item, "parentPostId")
        is_reply = item.get("isReply", bool(parent_id))
        parent_username = first_value(item, "parentPostUsername")

    post_id = str(post_id) if post_id is not None else None
    parent_id = str(parent_id) if parent_id is not None else None

    # ID node dibedakan berdasarkan platform.
    node_id = (
        f"{platform}:{post_id}"
        if post_id
        else f"{platform}:{url}"
        if url
        else None
    )

    return {
        "node_id": node_id,
        "platform": platform,
        "post_id": post_id,
        "username": str(username) if username is not None else None,
        "text": str(text).strip() if text is not None else "",
        "url": str(url) if url is not None else None,
        "created_at": str(created_at) if created_at is not None else None,
        "likes": likes,
        "replies": replies,
        "reposts": reposts,
        "query": query,
        "similarity": None,
        "is_reply": bool(is_reply),
        "parent_post_id": parent_id,
        "parent_username": parent_username,
        "raw_data": item,
    }


def build_x_input(query):
    # Mengikuti nama field dari JSON actor X yang diberikan.
    filters = {
        "filter:blue_verified": False,
        "filter:consumer_video": False,
        "filter:has_engagement": False,
        "filter:hashtags": False,
        "filter:images": False,
        "filter:links": False,
        "filter:media": False,
        "filter:mentions": False,
        "filter:native_video": False,
        "filter:nativeretweets": False,
        "filter:news": False,
        "filter:pro_video": False,
        "filter:quote": False,
        "filter:replies": False,
        "filter:safe": False,
        "filter:spaces": False,
        "filter:twimg": False,
        "filter:videos": False,
        "filter:vine": False,
        "from": "",
        "include:nativeretweets": False,
        "lang": "in",
        "searchTerms": [query],
        "tweetIDs": [],
        "twitterContent": query,
    }
    return filters

def build_threads_input(keywords):
    return {
        "targets": list(keywords),
        "searchFor": ["posts"],
        "maxItems": MAX_POSTS,
        "expandQueries": False,
        "onlyNew": False,
        "resetMonitoring": True,
    }

def deduplicate(posts):
    unique = []
    seen = set()

    for post in posts:
        # Gunakan ID jika tersedia; jika tidak, gunakan platform + teks.
        identity = post.get("post_id")
        if identity:
            key = (post["platform"], identity)
        else:
            key = (
                post["platform"],
                post.get("text", "").casefold(),
                post.get("url"),
            )

        if key in seen:
            continue

        seen.add(key)
        unique.append(post)

    return unique

def calculate_similarity(query, posts):
    if not posts:
        return []

    texts = [
        str(post.get("text") or "").strip()
        for post in posts
    ]

    # Query ditempatkan pada indeks pertama
    documents = [query.strip()] + texts

    vectorizer = TfidfVectorizer(
        lowercase=True,
        strip_accents="unicode",
        ngram_range=(1, 2),
        sublinear_tf=True,
        token_pattern=r"(?u)\b\w+\b",
    )

    try:
        tfidf_matrix = vectorizer.fit_transform(documents)
    except ValueError:
        # Misalnya seluruh teks kosong atau tidak memiliki
        # token yang dapat diproses oleh vectorizer.
        for post in posts:
            post["similarity"] = 0.0
        return posts

    # Baris pertama adalah query, sisanya adalah postingan
    scores = cosine_similarity(
        tfidf_matrix[0:1],
        tfidf_matrix[1:]
    ).flatten()

    print("\n=== DEBUG CALCULATE SIMILARITY ===")
    print("QUERY ASLI:", repr(query))
    print("JUMLAH POST:", len(posts))
    print("FITUR QUERY:", vectorizer.get_feature_names_out()[
        tfidf_matrix[0].toarray().flatten().nonzero()[0]
    ][:30])

    for i, post in enumerate(posts[:5]):
        print(
            f"[POST {i + 1}]",
            post.get("platform"),
            repr(str(post.get("text") or "")[:150]),
            "SIMILARITY:",
            round(float(scores[i]), 4)
        )

    for post, score in zip(posts, scores):
        post["similarity"] = round(float(score), 4)

    # Urutkan skor tertinggi ke terendah
    posts.sort(
        key=lambda post: post["similarity"],
        reverse=True
    )

    return posts


def build_similarity_edges(posts, threshold=0.5):
    """Membentuk similarity edge X -> Threads."""

    valid_posts = [
        post for post in posts
        if (
            post.get("node_id")
            and str(post.get("text") or "").strip()
            and str(post.get("platform") or "").strip().lower()
            in {"x", "threads"}
        )
    ]

    x_posts = [
        p for p in valid_posts
        if str(p.get("platform") or "").strip().lower() == "x"
    ]

    threads_posts = [
        p for p in valid_posts
        if str(p.get("platform") or "").strip().lower() == "threads"
    ]

    print("\n=== DEBUG SIMILARITY GRAPH ===")
    print("Postingan X:", len(x_posts))
    print("Postingan Threads:", len(threads_posts))
    print("Ambang similarity:", threshold)

    if not x_posts or not threads_posts:
        print("Edge tidak dibuat: salah satu platform kosong.")
        return []

    all_posts = x_posts + threads_posts
    texts = [str(p["text"]).strip() for p in all_posts]

    vectorizer = TfidfVectorizer(
        lowercase=True,
        strip_accents="unicode",
        ngram_range=(1, 2),
        sublinear_tf=True,
        token_pattern=r"(?u)\b\w+\b",
    )

    try:
        matrix = vectorizer.fit_transform(texts)
    except ValueError as exc:
        print("Gagal membentuk TF-IDF:", exc)
        return []

    similarity_matrix = cosine_similarity(matrix)
    x_count = len(x_posts)
    edges = []
    scores = []

    for i, x_post in enumerate(x_posts):
        for j, threads_post in enumerate(threads_posts):
            score = float(similarity_matrix[i, x_count + j])
            scores.append((score, x_post, threads_post))

            if score >= threshold:
                edges.append({
                    "source": x_post["node_id"],
                    "target": threads_post["node_id"],
                    "type": "similarity",
                    "weight": round(score, 4),
                })

    scores.sort(key=lambda item: item[0], reverse=True)

    print("Jumlah pasangan yang dibandingkan:", len(scores))
    print("Similarity edges:", len(edges))

    print("\n10 pasangan dengan similarity tertinggi:")
    for score, x_post, threads_post in scores[:10]:
        print(f"\nSimilarity: {score:.4f}")
        print("X:", str(x_post.get("text", ""))[:200])
        print("Threads:", str(threads_post.get("text", ""))[:200])

    return edges

def build_reply_edges(posts, all_stored_posts=None):
    """Membentuk edge balasan dengan arah child -> parent."""

    all_stored_posts = all_stored_posts or []

    # Gabungkan seluruh data tersimpan dengan hasil relevan.
    # Hasil relevan diprioritaskan jika ada duplikasi.
    combined_posts = {}

    for post in all_stored_posts + posts:
        platform = post.get("platform")
        post_id = post.get("post_id")

        if not platform or not post_id:
            continue

        key = (str(platform), str(post_id))

        # Pastikan setiap postingan memiliki node_id.
        if not post.get("node_id"):
            post["node_id"] = f"{platform}:{post_id}"

        combined_posts[key] = post

    # Lookup node menggunakan platform dan post_id.
    node_lookup = {
        key: post["node_id"]
        for key, post in combined_posts.items()
        if post.get("node_id")
    }

    relevant_keys = {
        (str(post.get("platform", "")),
         str(post.get("post_id", "")))
        for post in posts
    }

    edges = []
    missing_parents = []
    extra_parent_posts = {}

    for post in posts:
        parent_id = post.get("parent_post_id")
        child_id = post.get("node_id")
        platform = str(post.get("platform", ""))

        if not post.get("is_reply") or not parent_id or not child_id:
            continue

        parent_key = (platform, str(parent_id))
        parent_node_id = node_lookup.get(parent_key)

        if parent_node_id:
            edges.append({
                "source": child_id,
                "target": parent_node_id,
                "type": "reply",
                "weight": 1.0,
            })

            # Parent ditemukan tetapi tidak termasuk hasil relevan.
            if parent_key not in relevant_keys:
                extra_parent_posts[parent_key] = combined_posts[parent_key]

        else:
            missing_parents.append({
                "child": child_id,
                "parent_post_id": str(parent_id),
                "platform": platform,
            })

    print("\n=== DEBUG REPLY GRAPH ===")
    print("Relevant posts:", len(posts))
    print("Stored posts:", len(all_stored_posts))
    print(
        "Posts marked as reply:",
        sum(1 for p in posts if p.get("is_reply"))
    )
    print("Reply edges created:", len(edges))
    print("Missing parents:", len(missing_parents))
    print("Additional parent nodes:", len(extra_parent_posts))

    return edges, missing_parents, list(extra_parent_posts.values())


def debug_parent_storage(posts, posts_file):
    stored_data = read_json(posts_file, {"posts": []})
    stored_posts = stored_data.get("posts", [])

    stored_ids = {
        (
            str(post.get("platform", "")),
            str(post.get("post_id", ""))
        )
        for post in stored_posts
        if post.get("post_id")
    }

    print("\n=== PEMERIKSAAN PARENT DI JSON ===")
    print("Total postingan tersimpan:", len(stored_posts))

    for post in posts:
        parent_id = post.get("parent_post_id")

        if not parent_id:
            continue

        platform = str(post.get("platform", ""))
        exists = (platform, str(parent_id)) in stored_ids

        print({
            "child": post.get("post_id"),
            "parent": str(parent_id),
            "platform": platform,
            "parent_tersimpan": exists,
        })


def inspect_parent_ids(posts_file):
    data = read_json(posts_file, {"posts": []})
    stored_posts = data.get("posts", [])

    parent_ids = [
        "1227590931278258176",
        "1187926126963748864",
        "1569163539750989825",
        "871533953198432256",
        "1187909295217577984",
    ]

    print("\n=== PEMERIKSAAN DETAIL PARENT ===")

    for parent_id in parent_ids:
        by_post_id = [
            post for post in stored_posts
            if str(post.get("post_id", "")).strip() == parent_id
        ]

        by_parent_id = [
            post for post in stored_posts
            if str(post.get("parent_post_id", "")).strip() == parent_id
        ]

        print(f"\nParent ID: {parent_id}")
        print("Ditemukan sebagai post_id:", len(by_post_id))
        print("Ditemukan sebagai parent_post_id:", len(by_parent_id))

        for post in by_post_id:
            print("POST INDUK:", {
                "platform": post.get("platform"),
                "post_id": post.get("post_id"),
                "username": post.get("username"),
                "text": post.get("text", "")[:100],
            })


def fetch_missing_x_parents(posts, stored_posts, query):
    """Mengambil postingan induk X yang belum tersimpan."""

    # ID parent yang dirujuk oleh postingan balasan X.
    parent_ids = {
        str(post["parent_post_id"])
        for post in posts
        if post.get("platform") == "X"
        and post.get("is_reply")
        and post.get("parent_post_id")
    }

    # ID postingan X yang sudah tersimpan.
    stored_ids = {
        str(post.get("post_id"))
        for post in stored_posts
        if post.get("platform") == "X"
        and post.get("post_id")
    }

    # Tidak perlu mengambil parent yang sudah tersedia.
    missing_ids = sorted(parent_ids - stored_ids)

    if not missing_ids:
        print("\nSemua parent X sudah tersimpan.")
        return []

    print("\n=== AMBIL PARENT X ===")
    print("Parent yang perlu diambil:", len(missing_ids))

    actor_input = {
        "tweetIDs": missing_ids,
        "maxItems": len(missing_ids),
    }

    try:
        raw_items = run_actor(X_ACTOR_ID, actor_input)
    except ApifyError as exc:
        print("Gagal mengambil parent X:", exc)
        return []

    fetched_posts = [
        normalize_post(item, "X", query)
        for item in raw_items
        if isinstance(item, dict)
    ]

    # Simpan hanya postingan yang ID-nya memang diminta.
    fetched_posts = [
        post for post in fetched_posts
        if post.get("post_id") in parent_ids
    ]

    fetched_posts = deduplicate(fetched_posts)

    print("Parent berhasil diambil:", len(fetched_posts))
    print(
        "Parent masih belum ditemukan:",
        len(missing_ids) - len({
            post["post_id"] for post in fetched_posts
        }),
    )

    return fetched_posts

def search_social_media(query):
    query = " ".join(query.strip().split())
    if not query:
        raise ValueError("Kalimat pencarian wajib diisi.")

    threads_keywords = expand_threads_keywords(query)

    x_input = build_x_input(query)
    threads_input = build_threads_input(threads_keywords)

    print("[THREADS] KEYWORDS:", repr(threads_keywords))
    print("[THREADS] INPUT:", threads_input)

    # Kedua actor berjalan secara paralel.
    with ThreadPoolExecutor(max_workers=2) as executor:
        x_future = executor.submit(run_actor, X_ACTOR_ID, x_input)
        threads_future = executor.submit(
            run_actor, THREADS_ACTOR_ID, threads_input
        )

        # Jika salah satu actor gagal, exception akan diteruskan.
        x_raw = x_future.result()
        threads_raw = threads_future.result()

        print("[THREADS] RAW COUNT:", len(threads_raw))
        print("[THREADS] SAMPLE:", threads_raw[:3])

    posts = [
        normalize_post(item, "X", query)
        for item in x_raw
        if isinstance(item, dict)
    ]
    posts += [
        normalize_post(item, "Threads", query)
        for item in threads_raw
        if isinstance(item, dict)
    ]

    # Lewati item yang tidak berisi teks postingan.
    posts = [p for p in posts if p["text"]]
    posts = deduplicate(posts)

    now = datetime.now(timezone.utc).isoformat()

    
    # Baca data yang sudah tersimpan sebelumnya.
    current_data = read_json(POSTS_FILE, {"posts": []})
    existing_posts = current_data.get("posts", [])

    # Ambil parent X yang belum tersimpan sebagai postingan tersendiri.
    parent_posts = fetch_missing_x_parents(
        posts,
        existing_posts + posts,
        query,
    )

    # Simpan hasil pencarian dan parent yang berhasil diambil.
    current_data["posts"] = deduplicate(
        existing_posts + posts + parent_posts
    )
    write_json(POSTS_FILE, current_data)

    now = datetime.now(timezone.utc).isoformat()

    # Hitung similarity hanya untuk hasil crawling awal.
    # Parent tambahan tidak otomatis menjadi hasil pencarian utama.
    posts = calculate_similarity(query, posts)

    from collections import Counter

    print("\n=== DEBUG POSTINGAN SEBELUM FILTER ===")
    print("Total posts:", len(posts))
    print(
        "Platform:",
        dict(Counter(p.get("platform") for p in posts))
    )

    MIN_SIMILARITY = 0.03

    for platform in ("X", "Threads"):
        platform_posts = [
            p for p in posts
            if str(p.get("platform", "")).strip().lower()
            == platform.lower()
        ]

        print(f"\n[{platform}] total:", len(platform_posts))
        print(
            f"[{platform}] similarity >= {MIN_SIMILARITY}:",
            sum(
                float(p.get("similarity") or 0.0) >= MIN_SIMILARITY
                for p in platform_posts
            )
        )

        for p in platform_posts[:3]:
            print({
                "platform": p.get("platform"),
                "post_id": p.get("post_id"),
                "node_id": p.get("node_id"),
                "similarity": p.get("similarity"),
                "text": str(p.get("text") or "")[:100],
            })


    # 1. Filter postingan berdasarkan relevansi terhadap query.
    MIN_SIMILARITY = 0.03

    relevant_posts = [
        post for post in posts
        if (
            float(post.get("similarity") or 0.0) >= MIN_SIMILARITY
            and post.get("node_id")
        )
    ]

    print("\n=== DEBUG GRAPH CONSTRUCTION ===")
    print("Total postingan hasil crawling:", len(posts))
    print("Postingan relevan:", len(relevant_posts))
    print(
        "Postingan X relevan:",
        sum(
            str(p.get("platform", "")).lower() == "x"
            for p in relevant_posts
        )
    )
    print(
        "Postingan Threads relevan:",
        sum(
            str(p.get("platform", "")).lower() == "threads"
            for p in relevant_posts
        )
    )

    # 2. Buat similarity edge lintas platform.
    similarity_edges = build_similarity_edges(
        relevant_posts,
        threshold=0.5,
    )

    # 3. Nonaktifkan reply edge child -> parent.
    reply_edges, missing_parents, parent_context_posts = build_reply_edges(
    relevant_posts,
        all_stored_posts=current_data["posts"],
    )

    # 4. Buat node hanya dari postingan relevan.
    graph_posts = deduplicate(relevant_posts + parent_context_posts)

    nodes = [
        {
            "id": post["node_id"],
            "platform": post["platform"],
            "post_id": post["post_id"],
            "username": post["username"],
            "text": post["text"],
            "url": post["url"],
            "similarity": post.get("similarity", 0.0),
        }
        for post in graph_posts
    ]

    # 5. Gabungkan edge yang aktif.
    graph_edges = similarity_edges + reply_edges

    graph = {
        "nodes": nodes,
        "edges": graph_edges,
        "stats": {
            "node_count": len(nodes),
            "relevant_node_count": len(relevant_posts),
            "parent_context_node_count": len(parent_context_posts),
            "similarity_edge_count": len(similarity_edges),
            "reply_edge_count": len(reply_edges),
            "missing_parent_count": len(missing_parents),
        },
        "missing_parents": missing_parents,
    }

    print("\n=== HASIL GRAPH ===")
    print("Node:", len(nodes))
    print("Similarity edge:", len(similarity_edges))
    print("Reply edge:", len(reply_edges))


    # Simpan riwayat pencarian.
    history_data = read_json(HISTORY_FILE, {"history": []})
    history_data.setdefault("history", []).append({
        "query": query,
        "searched_at": now,
        "x_count": len(x_raw),
        "threads_count": len(threads_raw),
        "saved_count": len(relevant_posts),
        "threads_keywords": threads_keywords,
    })
    write_json(HISTORY_FILE, history_data)

    return {
        "success": True,
        "query": query,
        "threads_keywords": threads_keywords,
        "x_count": len(x_raw),
        "threads_count": len(threads_raw),
        "saved_count": len(relevant_posts),
        "results": relevant_posts,
        "graph": graph,
    }
