
import re

STOPWORDS = {
    # Kata penghubung
    "dan", "yang", "atau", "tetapi", "namun", "sedangkan",
    "serta", "maupun", "melainkan", "padahal", "karena",
    "sebab", "sehingga", "agar", "supaya", "jika", "kalau",
    "bila", "apabila", "meskipun", "walaupun", "ketika",
    "sementara", "setelah", "sebelum", "hingga", "sampai",
    "paham", "bahwa", "adapun", "oleh karena itu", "oleh sebab itu",

    # Kata depan
    "di", "ke", "dari", "pada", "kepada", "dalam", "luar",
    "atas", "bawah", "antara", "dekat", "sekitar", "sejak",
    "selama", "sepanjang", "melalui", "lewat", "tanpa",
    "tentang", "mengenai", "terhadap", "bagi", "demi",
    "untuk", "dengan", "oleh", "per", "hingga",

    # Kata ganti
    "saya", "aku", "kami", "kita", "kamu", "kau", "anda",
    "dia", "ia", "beliau", "mereka", "kalian", "dirinya",
    "diriku", "dirimu", "miliknya", "milikku", "milikmu",

    # Kata tunjuk
    "ini", "itu", "tersebut", "begini", "begitu", "demikian",
    "sini", "situ", "sana", "inilah", "itulah",

    # Kata bantu dan aspek
    "adalah", "ialah", "yaitu", "yakni", "merupakan",
    "akan", "telah", "sudah", "sedang", "masih", "pernah",
    "belum", "baru", "mulai", "terus", "tetap", "kembali",
    "dapat", "bisa", "mampu", "harus", "perlu", "wajib",
    "ingin", "mau", "hendak", "boleh", "patut", "berhak",

    # Kata keterangan umum
    "sangat", "lebih", "paling", "cukup", "kurang", "terlalu",
    "hanya", "cuma", "juga", "pun", "bahkan", "justru",
    "memang", "tentu", "pasti", "mungkin", "barangkali",
    "sebenarnya", "sesungguhnya", "umumnya", "biasanya",
    "sering", "jarang", "kadang", "kadang-kadang", "hampir",
    "langsung", "segera", "selalu", "sekali", "saja",

    # Kuantitas dan bilangan umum
    "semua", "seluruh", "setiap", "tiap", "banyak", "beberapa",
    "sedikit", "sebagian", "berbagai", "semacam", "sejumlah",
    "banyaknya", "pertama", "kedua", "ketiga", "masing-masing",

    # Kata umum lainnya
    "ada", "adanya", "jadi", "menjadi", "terjadi", "berupa",
    "terdiri", "termasuk", "sebagai", "secara", "menurut",
    "berdasarkan", "disebut", "dimaksud", "dikatakan",
    "diketahui", "terlihat", "tampak", "terasa", "berikut",
    "terlebih", "lain", "lainnya", "hal", "halnya", "bagian",
    "sesuatu", "seseorang", "suatu", "sebuah", "seorang",
    "para", "antar", "antaranya", "yakni", "punya", "milik",

    # Kata percakapan media sosial
    "nih", "sih", "dong", "deh", "kok", "lah", "lho", "loh",
    "ya", "iya", "yaitu", "kan", "nah", "oke", "ok", "okay",
    "wkwk", "wkwkwk", "haha", "hehe", "hihi", "hmm", "emang",
    "kayak", "kaya", "gitu", "gini", "begini", "begitu",
    "aja", "doang", "banget", "bgt", "gue", "gua", "lu", "lo",
    "gw", "kalo", "klo", "gak", "ga", "enggak", "nggak",
    "ngga", "ndak", "udah", "udh", "belom", "belum", "pake",
    "pakai", "buat", "trus", "terus", "dulu", "sbg", "yg",

    # Kata umum yang sering muncul dalam unggahan
    "post", "posting", "postingan", "akun", "media", "sosial",
    "orang", "warga", "masyarakat", "publik", "pihak", "kali",
    "hari", "waktu", "tahun", "sekarang", "kemarin", "besok",
    "mari", "ayo", "silakan", "tolong", "terima", "kasih"
}


VARIANTS = {
    # Ideologi negara dan Pancasila
    "pancasila": [
        "penolakan terhadap pancasila",
        "penolakan pancasila sebagai dasar negara",
        "menentang ideologi pancasila",
        "menolak pancasila sebagai dasar negara",
        "anti pancasila",
        "anti-pancasila",
        "pancasila sebagai ideologi negara",
        "penolakan ideologi pancasila",
        "penggantian ideologi pancasila",
        "ancaman terhadap ideologi pancasila",
    ],

    "ideologi pancasila": [
        "penolakan ideologi pancasila",
        "menentang ideologi pancasila",
        "menolak ideologi pancasila",
        "pancasila sebagai dasar negara",
        "penggantian ideologi negara",
        "ideologi alternatif pancasila",
    ],

    "menolak": [
        "menolak pancasila",
        "menolak ideologi pancasila",
        "menolak pancasila sebagai dasar negara",
        "penolakan terhadap pancasila",
        "menolak ideologi negara",
    ],

    "penolakan": [
        "penolakan terhadap pancasila",
        "penolakan pancasila sebagai dasar negara",
        "penolakan ideologi pancasila",
        "penolakan terhadap ideologi negara",
        "penolakan dasar negara pancasila",
    ],

    "menentang": [
        "menentang pancasila",
        "menentang ideologi pancasila",
        "menentang pancasila sebagai dasar negara",
        "menentang ideologi negara",
    ],

    # Radikalisme
    "radikalisme": [
        "paham radikal",
        "gerakan radikal",
        "ideologi radikal",
        "kelompok radikal",
        "pemikiran radikal",
        "radikalisasi",
        "ekstremisme",
        "paham ekstrem",
        "gerakan ekstremis",
        "ekstremisme ideologis",
        "radikalisme ideologis",
        "penyebaran paham radikal",
        "propaganda radikal",
    ],

    "radikal": [
        "paham radikal",
        "kelompok radikal",
        "gerakan radikal",
        "ideologi radikal",
        "pemikiran radikal",
        "radikalisasi",
        "ekstremisme",
    ],

    "ekstremisme": [
        "paham ekstrem",
        "gerakan ekstremis",
        "ideologi ekstrem",
        "kelompok ekstremis",
        "ekstremisme ideologis",
        "radikalisme",
    ],

    # Kolonialisme dan penjajahan
    "kolonialisme": [
        "penjajahan",
        "paham kolonial",
        "ideologi kolonial",
        "imperialisme",
        "dominasi kolonial",
        "ekspansi kolonial",
        "eksploitasi kolonial",
        "kekuasaan kolonial",
        "warisan kolonialisme",
        "praktik kolonialisme",
        "penindasan kolonial",
        "hegemoni kolonial",
        "neokolonialisme",
        "neo-kolonialisme",
    ],

    "penjajahan": [
        "kolonialisme",
        "imperialisme",
        "penindasan kolonial",
        "dominasi asing",
        "penguasaan wilayah",
        "eksploitasi kolonial",
        "kekuasaan kolonial",
        "neokolonialisme",
    ],

    "imperialisme": [
        "kolonialisme",
        "ekspansi imperialis",
        "dominasi asing",
        "hegemoni asing",
        "penjajahan",
        "neokolonialisme",
    ],

    "neokolonialisme": [
        "neo-kolonialisme",
        "kolonialisme modern",
        "dominasi asing",
        "ketergantungan terhadap negara asing",
        "hegemoni asing",
        "imperialisme modern",
    ],
}


def expand_threads_keywords(query: str) -> list[str]:
    """Memecah query menjadi frasa dan keyword tanpa batas jumlah query."""
    query = " ".join(query.strip().split())

    if not query:
        return []

    results = []
    seen = set()

    def add(value):
        value = " ".join(value.split()).strip(" ,.-")
        key = value.casefold()

        if value and key not in seen:
            seen.add(key)
            results.append(value)

    # 1. Kalimat asli agar konteks tetap dipertahankan.
    add(query)

    # 2. Tambahkan variasi frasa yang relevan.
    q = query.casefold()

    phrase_variants = {
        "penolakan terhadap pancasila": [
            "penolakan Pancasila sebagai dasar negara",
            "menentang ideologi Pancasila",
            "menolak Pancasila",
            "anti Pancasila",
            "penolakan ideologi negara",
        ],
    }

    for phrase, variants in phrase_variants.items():
        if phrase in q:
            for variant in variants:
                add(variant)

    # 3. Pecah kalimat menjadi keyword per kata.
    words = re.findall(r"[\w-]+", q, flags=re.UNICODE)

    meaningful_words = [
        word for word in words
        if word not in STOPWORDS
    ]

    for word in meaningful_words:
        add(word)

        # Tambahkan variasi untuk setiap keyword.
        for variant in VARIANTS.get(word, []):
            add(variant)

    return results




