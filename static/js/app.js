const queryInput = document.querySelector('#query');
const count = document.querySelector('#wordCount');
const validation = document.querySelector('#validation');
const button = document.querySelector('#searchButton');
const processing = document.querySelector('#processing');
const results = document.querySelector('#results');
let latestPosts = [];

function words(value) {
    return value.trim().split(/\s+/).filter(Boolean);
}

function updateCount() {
    count.textContent = `${words(queryInput.value).length} / 8 kata`;
    validation.textContent = '';
}

queryInput.addEventListener('input', updateCount);
queryInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        startSearch();
    }
});

document.querySelector('#newSearch').addEventListener('click', () => {
    results.classList.add('hidden');
    queryInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

const exportButton = document.querySelector('#exportCsv');
exportButton.disabled = true;
exportButton.addEventListener('click', () => {
    if (!latestPosts.length) return;

    const columns = [
        ['id_post', 'id_post'],
        ['teks_postingan', 'teks_postingan'],
        ['tanggal_publikasi', 'tanggal_publikasi'],
        ['username', 'username'],
        ['jumlah_like', 'jumlah_like'],
        ['jumlah_share_repost', 'jumlah_share_repost'],
        ['jumlah_komentar', 'jumlah_komentar'],
        ['link_postingan', 'link_postingan'],
        ['platform', 'platform'],
        ['kata_kunci', 'kata_kunci'],
        ['jenis', 'jenis'],
        ['reply_to', 'reply_to']
    ];
    const quoteCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
        columns.map(([heading]) => quoteCsv(heading)),
        ...latestPosts.map(post => columns.map(([, key]) => quoteCsv(post[key])))
    ];
    const blob = new Blob(
        [`\uFEFF${rows.map(row => row.join(',')).join('\r\n')}`],
        { type: 'text/csv;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dataset_terintegrasi.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
});

button.addEventListener('click', startSearch);

function validate(q) {
    const list = words(q);
    if (!q.trim()) return 'Masukkan kalimat pencarian terlebih dahulu.';
    if (list.length > 8) return 'Input melebihi batas 8 kata.';
    return '';
}

async function checkBackendStatus() {
    const dot = document.querySelector('#backendStatusDot');
    const text = document.querySelector('#backendStatusText');
    dot.dataset.state = 'checking';
    text.textContent = 'Memeriksa backend…';

    try {
        const response = await fetch('/api/status');
        const payload = await response.json();
        if (!response.ok || payload.success !== true) {
            throw new Error(payload.message || 'Backend tidak merespons dengan benar.');
        }
        dot.dataset.state = 'online';
        text.textContent = `${payload.application || 'Backend'} berjalan`;
    } catch (error) {
        dot.dataset.state = 'offline';
        text.textContent = 'Backend tidak terhubung';
        console.error('Pemeriksaan status backend gagal:', error);
    }
}

const pipelineStepsConfig = [
    { id: 1, title: 'Validasi Query', activeDesc: 'Memeriksa input sebelum dikirim ke backend…', doneDesc: 'Query dikirim ke backend' },
    { id: 2, title: 'Parallel Crawling', activeDesc: 'Mengambil data postingan X & Threads secara paralel…', doneDesc: 'Crawling X & Threads selesai' },
    { id: 3, title: 'Normalisasi Postingan', activeDesc: 'Menyeragamkan data hasil crawler…', doneDesc: 'Data postingan dinormalisasi' },
    { id: 4, title: 'Similarity Computation', activeDesc: 'Menghitung cosine similarity antar platform…', doneDesc: 'Kalkulasi kesamaan kata selesai' },
    { id: 5, title: 'Graph Construction', activeDesc: 'Membangun relasi node-edge & percakapan…', doneDesc: 'Struktur graf berhasil dibangun' }
];

function updatePipelineProgress(stepIndex, state = 'active', customPct = null) {
    const steps = document.querySelectorAll('.pipeline-step');
    const badge = document.querySelector('#processingBadge');
    const bar = document.querySelector('#pipelineProgressBar');
    const title = document.querySelector('#processingTitle');
    const text = document.querySelector('#processingText');

    const basePct = [0, 20, 50, 75, 90, 100];
    const pct = customPct !== null ? customPct : (basePct[stepIndex] || 0);

    if (badge) badge.textContent = `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, Math.round(pct)))}%`;

    steps.forEach((el, idx) => {
        const numEl = el.querySelector('.step-num');
        const subEl = el.querySelector('.step-sub');
        const stepNum = idx + 1;
        const config = pipelineStepsConfig[idx];

        if (stepNum < stepIndex) {
            el.setAttribute('data-state', 'completed');
            if (numEl) numEl.innerHTML = '✓';
            if (subEl && config) subEl.textContent = config.doneDesc;
        } else if (stepNum === stepIndex) {
            el.setAttribute('data-state', state);
            if (state === 'active') {
                if (numEl) numEl.innerHTML = `<span class="step-label">${stepNum}</span>`;
                if (subEl && config) subEl.textContent = config.activeDesc;
                if (title && config) title.textContent = config.title;
                if (text && config) text.textContent = config.activeDesc;
            } else if (state === 'error') {
                if (numEl) numEl.innerHTML = '✕';
                if (subEl) subEl.textContent = 'Gagal pada tahap ini';
                if (title) title.textContent = 'Proses Terhenti';
            }
        } else {
            el.setAttribute('data-state', 'pending');
            if (numEl) numEl.innerHTML = `<span class="step-label">${stepNum}</span>`;
            if (subEl && config) subEl.textContent = 'Menunggu tahapan';
        }
    });
}

function resetPipeline() {
    updatePipelineProgress(1, 'pending', 0);
    const title = document.querySelector('#processingTitle');
    const text = document.querySelector('#processingText');
    if (title) title.textContent = 'Pipeline Pemrosesan Isu Multi-Platform';
    if (text) text.textContent = 'Mengorkestrasi tahapan crawler hingga penyusunan graph percakapan…';
}

async function startSearch() {
    const q = queryInput.value.trim();
    const error = validate(q);
    if (error) {
        validation.textContent = error;
        results.classList.add('hidden');
        return;
    }

    button.disabled = true;
    validation.textContent = '';
    resetPipeline();
    processing.classList.remove('hidden');
    results.classList.add('hidden');

    updatePipelineProgress(2, 'active', 35);
    const startedAt = performance.now();

    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q })
        });

        let payload;
        try {
            payload = await response.json();
        } catch {
            throw new Error('Backend mengirim respons yang bukan JSON valid.');
        }
        if (!response.ok || payload.success !== true) {
            throw new Error(payload.message || 'Pencarian gagal diproses.');
        }
        if (!Array.isArray(payload.results) ||
            !payload.graph ||
            !Array.isArray(payload.graph.nodes) ||
            !Array.isArray(payload.graph.edges)) {
            throw new Error('Format respons pencarian dari backend tidak valid.');
        }

        updatePipelineProgress(6, 'completed', 100);
        const title = document.querySelector('#processingTitle');
        const text = document.querySelector('#processingText');
        if (title) title.textContent = 'Pemrosesan Selesai';
        if (text) text.textContent = 'Backend mengembalikan hasil pencarian dan graph.';
        renderResults(payload, performance.now() - startedAt);
    } catch (error) {
        updatePipelineProgress(2, 'error', 35);
        validation.textContent = error.message;
        results.classList.add('hidden');
        console.error('Pencarian backend gagal:', error);
    } finally {
        processing.classList.add('hidden');
        button.disabled = false;
        if (!results.classList.contains('hidden')) {
            results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDate(value) {
    if (!value) return 'ΓÇö';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function normalizeGraphData(graph) {
    return {
        nodes: graph.nodes.map(node => ({
            ...node,
            id: node.id || node.node_id || `${node.platform}:${node.post_id}`,
            similarity_score: Number(node.similarity_score ?? node.similarity ?? 0)
        })),
        edges: graph.edges.map(edge => ({
            ...edge,
            edge_type: ['reply', 'conversation'].includes(edge.edge_type || edge.type)
                ? 'conversation'
                : (edge.edge_type || edge.type),
            similarity: Number(edge.similarity ?? edge.weight ?? 0)
        }))
    };
}

function normalizePost(post) {
    const interactionCount = ['likes', 'reposts', 'replies']
        .reduce((total, key) => total + (Number(post[key]) || 0), 0);
    return {
        ...post,
        id_post: post.post_id || post.node_id || '',
        teks_postingan: post.text || '',
        tanggal_publikasi: post.created_at,
        jumlah_like: post.likes,
        jumlah_share_repost: post.reposts,
        jumlah_komentar: post.replies,
        link_postingan: post.url,
        kata_kunci: post.query,
        jenis: post.is_reply ? 'reply' : 'postingan',
        reply_to: post.parent_post_id,
        jumlah_interaksi: interactionCount
    };
}

function renderResults(payload, elapsedMs) {
    const posts = payload.results.map(normalizePost);
    latestPosts = posts;
    const graph = normalizeGraphData(payload.graph);
    const x = posts.filter(post => post.platform === 'X');
    const t = posts.filter(post => post.platform === 'Threads');

    results.classList.remove('hidden');
    document.querySelector('#resultQuery').textContent = `"${payload.query || ''}"`;
    document.querySelector('#totalPosts').textContent = posts.length;
    document.querySelector('#processTime').textContent = `${(elapsedMs / 1000).toFixed(2)} dtk`;
    document.querySelector('#nodeCount').textContent = graph.nodes.length;
    document.querySelector('#edgeCount').textContent = graph.edges.length;
    document.querySelector('#tableInfo').textContent =
        `${posts.length} postingan relevan · X ${payload.x_count ?? x.length} · Threads ${payload.threads_count ?? t.length}`;
    document.querySelector('#xCount').textContent = payload.x_count ?? x.length;
    document.querySelector('#threadsCount').textContent = payload.threads_count ?? t.length;
    document.querySelector('#savedCount').textContent = payload.saved_count ?? posts.length;
    exportButton.disabled = posts.length === 0;

    renderPlatforms(x, t);
    renderTable(posts);
    renderGraph(graph, posts);
}

function renderPlatforms(x, t) {
    document.querySelector('#platformStats').innerHTML = [
        ['x', 'X', 'Crawler X', x.length, x.reduce((sum, post) => sum + post.jumlah_interaksi, 0)],
        ['threads', '@', 'Threads', t.length, t.reduce((sum, post) => sum + post.jumlah_interaksi, 0)]
    ].map(([c, logo, name, n, interactions]) => `
    <div class="platform-row">
      <div class="platform-logo ${c}">${logo}</div>
      <div><strong>${name}</strong><small>${interactions} total interaksi</small></div>
      <b>${n}</b>
    </div>
  `).join('');
}

function renderTable(posts) {
    const table = document.querySelector('#postTable');
    table.innerHTML = posts.length ? posts.map(post => `
    <tr>
      <td class="post-id">${escapeHtml(post.id_post)}</td>
      <td class="post-text">${escapeHtml(post.teks_postingan)}</td>
      <td class="date">${formatDate(post.tanggal_publikasi)}</td>
      <td class="user">${escapeHtml(post.username)}</td>
      <td>${Number(post.jumlah_like || 0)}</td>
      <td>${Number(post.jumlah_share_repost || 0)}</td>
      <td>${Number(post.jumlah_komentar || 0)}</td>
      <td class="post-link">${post.link_postingan ? `<a href="${escapeHtml(post.link_postingan)}" target="_blank" rel="noreferrer">Buka</a>` : '—'}</td>
      <td><span class="tag ${post.platform === 'X' ? 'x' : 'threads'}">${escapeHtml(post.platform)}</span></td>
      <td>${escapeHtml(post.kata_kunci || post.kata_kunci_pencarian)}</td>
      <td>${escapeHtml(post.jenis || (post.parent_post_id ? 'reply' : 'postingan'))}</td>
      <td>${escapeHtml(post.reply_to || post.parent_post_id || '-')}</td>
    </tr>
  `).join('') : '<tr><td class="table-empty" colspan="12">Backend tidak mengembalikan postingan relevan untuk pencarian ini.</td></tr>';
}

/* ---------- Cluster layout: X (kiri) · Threads (kanan) dengan force-directed ---------- */
function computeForceLayout(nodes, edges, width, height) {
    const n = nodes.length;
    const pos = {};
    if (n === 0) return pos;

    // Pisahkan node berdasarkan platform
    const xNodes = nodes.filter(nd => nd.platform === 'X');
    const thNodes = nodes.filter(nd => nd.platform !== 'X');

    const marginX = 60;
    const midX = width / 2;
    const leftCx = midX * 0.46;   // pusat cluster X
    const rightCx = midX * 1.54;  // pusat cluster Threads
    const cy = height / 2;
    const maxR = Math.min(midX * 0.38, height * 0.38);

    function placeCluster(nodeList, cx) {
        nodeList.forEach((nd, i) => {
            const angle = (i / Math.max(nodeList.length, 1)) * Math.PI * 2;
            const r = maxR * (0.45 + Math.random() * 0.55);
            pos[nd.id] = {
                x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 18,
                y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 18
            };
        });
    }

    placeCluster(xNodes, leftCx);
    placeCluster(thNodes, rightCx);

    const ids = nodes.map(nd => nd.id);
    const k = Math.sqrt((width * height) / Math.max(n, 1)) * 1.3;
    const iters = n > 120 ? 160 : 240;
    const margin = 48;
    const minDist = 32;

    const platformOf = {};
    nodes.forEach(nd => { platformOf[nd.id] = nd.platform; });

    for (let iter = 0; iter < iters; iter++) {
        const disp = {};
        ids.forEach(id => { disp[id] = { x: 0, y: 0 }; });

        // Repulsion
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = ids[i], b = ids[j];
                let dx = pos[a].x - pos[b].x;
                let dy = pos[a].y - pos[b].y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
                let force = (k * k) / dist;
                if (dist < minDist) force += (minDist - dist) * 3.5;
                dx /= dist; dy /= dist;
                disp[a].x += dx * force; disp[a].y += dy * force;
                disp[b].x -= dx * force; disp[b].y -= dy * force;
            }
        }

        // Attraction – conversation edges lebih kuat, similarity cross-platform dilemahkan
        edges.forEach(edge => {
            const a = edge.source, b = edge.target;
            if (!pos[a] || !pos[b]) return;
            const dx = pos[b].x - pos[a].x;
            const dy = pos[b].y - pos[a].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const isCross = platformOf[a] !== platformOf[b];
            const isConv = edge.edge_type === 'conversation';
            // Cross-platform edges: very weak attraction agar dua cluster tetap terpisah
            const kMult = isConv ? 2.0 : (isCross ? 8.0 : 3.5);
            const force = (dist * dist) / (k * kMult);
            const ux = dx / dist, uy = dy / dist;
            disp[a].x += ux * force; disp[a].y += uy * force;
            disp[b].x -= ux * force; disp[b].y -= uy * force;
        });

        // Gravity per-cluster agar X tetap kiri, Threads tetap kanan
        const temp = Math.min(width, height) * 0.065 * (1 - iter / iters);
        ids.forEach(id => {
            const targetX = platformOf[id] === 'X' ? leftCx : rightCx;
            let dx = disp[id].x + (targetX - pos[id].x) * 0.012;
            let dy = disp[id].y + (cy - pos[id].y) * 0.006;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const lim = Math.min(dist, temp);
            pos[id].x = Math.max(margin, Math.min(width - margin, pos[id].x + (dx / dist) * lim));
            pos[id].y = Math.max(margin, Math.min(height - margin, pos[id].y + (dy / dist) * lim));
        });
    }

    return pos;
}

/* --- State filter graph (dipakai oleh renderGraph & controls) --- */
let _graphState = null;
let graphInteractionController = null;

function applyGraphFilters() {
    if (!_graphState) return;
    const { allEdges, nodes, posts } = _graphState;

    const showConv = document.querySelector('#toggleConv')?.classList.contains('active') ?? true;
    const showSim = document.querySelector('#toggleSim')?.classList.contains('active') ?? true;
    const edgeLimit = parseInt(document.querySelector('#edgeLimitSlider')?.value ?? 60);
    const simThresh = parseFloat(document.querySelector('#simThreshSlider')?.value ?? 0) / 100;

    // Conversation edges: tampilkan semua jika toggle aktif
    const convEdges = showConv ? allEdges.filter(e => e.edge_type === 'conversation') : [];

    // Similarity edges: filter threshold lalu ambil top-N
    let simEdges = allEdges.filter(e => e.edge_type !== 'conversation');
    if (simThresh > 0) {
        simEdges = simEdges.filter(e => (e.similarity || e.weight || 0) >= simThresh);
    }
    // Sort descending similarity, ambil top edgeLimit
    simEdges.sort((a, b) => (b.similarity || b.weight || 0) - (a.similarity || a.weight || 0));
    if (showSim) simEdges = simEdges.slice(0, edgeLimit);
    else simEdges = [];

    const visibleEdges = [...convEdges, ...simEdges];

    // Update SVG visibility
    const edgeGroups = document.querySelectorAll('.edge-group');
    let visCount = 0;
    edgeGroups.forEach(eg => {
        const type = eg.dataset.edgeType;
        const sim = parseFloat(eg.dataset.similarity || 0);
        let show = false;
        if (type === 'conversation' && showConv) show = true;
        if (type !== 'conversation' && showSim) {
            const found = simEdges.find(se => se.source === eg.dataset.source && se.target === eg.dataset.target);
            if (found) show = true;
        }
        eg.style.display = show ? '' : 'none';
        if (show) visCount++;
    });

    // Update stat labels
    const gcNodes = document.querySelector('#gcStatNodes');
    const gcEdges = document.querySelector('#gcStatEdges');
    if (gcNodes) gcNodes.textContent = `${nodes.length} node`;
    if (gcEdges) gcEdges.textContent = `${visCount} / ${allEdges.length} edge`;
}

function renderGraph(graph, posts) {
    const container = document.querySelector('#graph');
    const nodes = graph.nodes || [];
    const allEdges = graph.edges || [];
    _graphState = { allEdges, nodes, posts };

    if (!nodes.length) {
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#7d8dae;font-size:13px">Tidak ada node untuk divisualisasikan.</div>`;
        graphInteractionController?.abort();
        graphInteractionController = null;
        wireGraphControls();
        applyGraphFilters();
        return;
    }

    // Hitung edge awal (sebelum render, untuk slider limit max)
    const totalSim = allEdges.filter(e => e.edge_type !== 'conversation').length;
    const slider = document.querySelector('#edgeLimitSlider');
    if (slider) {
        slider.max = Math.max(10, totalSim);
        // Set default: tampilkan max 60 edge similarity, atau semua jika lebih sedikit
        slider.value = Math.min(60, totalSim);
        const valEl = document.querySelector('#edgeLimitVal');
        if (valEl) valEl.textContent = slider.value;
    }

    const postById = {};

    posts.forEach(p => {
        postById[String(p.id_post)] = p;

        if (p.platform) {
            postById[`${p.platform}:${p.id_post}`] = p;
        }
    });

    nodes.forEach(node => {
        if (!postById[node.id]) {
            postById[node.id] = {
                id_post: node.post_id,
                platform: node.platform,
                username: node.username,
                teks_postingan: node.text,
                link_postingan: node.url,
                similarity_score: node.similarity_score
            };
        }
    });

    const W = 1100, H = 640;

    // Layout dengan semua edges untuk physics yang benar
    const pos = computeForceLayout(nodes, allEdges, W, H);

    const inDegree = {};
    nodes.forEach(node => { inDegree[node.id] = 0; });
    allEdges.forEach(edge => { if (inDegree[edge.target] !== undefined) inDegree[edge.target] += 1; });
    const maxDegree = Math.max(1, ...Object.values(inDegree));

    const platformColor = p => (p === 'X' ? '#7fa8ff' : '#ff9d6c');
    const platformGlow = p => (p === 'X' ? '#3b5fd9' : '#e05f2e');

    // Render SEMUA edges (filter visibility lewat CSS display di applyGraphFilters)
    const edgeEls = allEdges.map((edge) => {
        const a = pos[edge.source], b = pos[edge.target];
        if (!a || !b) return '';
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const bow = Math.min(24, dist * 0.14);
        const cx = mx - (dy / dist) * bow;
        const cyp = my + (dx / dist) * bow;
        const isConversation = edge.edge_type === 'conversation';
        const simScore = edge.similarity || edge.weight || 0;
        // Opacity diatur sangat rendah secara default — menonjol saat hover
        const baseOpacity = isConversation ? 0.45 : Math.max(0.12, 0.12 + simScore * 0.4);
        const stroke = isConversation ? '#94a3b8' : 'url(#edgeGrad)';
        const dash = isConversation ? '4 4' : 'none';
        const markerEnd = isConversation ? 'url(#arrow)' : 'none';
        return `
      <g class="edge-group" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}" data-edge-type="${escapeHtml(edge.edge_type || '')}" data-similarity="${Number(simScore)}">
        <path class="edge-hit" d="M${a.x},${a.y} Q${cx},${cyp} ${b.x},${b.y}" fill="none" stroke="transparent" stroke-width="16" style="cursor:pointer;pointer-events:stroke;"/>
        <path class="edge" d="M${a.x},${a.y} Q${cx},${cyp} ${b.x},${b.y}" fill="none" stroke="${stroke}" stroke-width="${isConversation ? '1.2' : '1.6'}" opacity="${baseOpacity}" marker-end="${markerEnd}" stroke-dasharray="${dash}" style="pointer-events:none;"/>
      </g>
    `;
    }).join('');

    // Divider line tengah pemisah cluster
    const dividerEl = `<line x1="${W / 2}" y1="30" x2="${W / 2}" y2="${H - 30}" stroke="rgba(99,115,155,0.12)" stroke-width="1" stroke-dasharray="6 5"/>`;
    // Label cluster
    const clusterLabels = `
    <text x="${W * 0.23}" y="22" text-anchor="middle" fill="#7fa8ff" font-size="11" font-weight="700" font-family="Inter,system-ui" opacity="0.7">X CLUSTER</text>
    <text x="${W * 0.77}" y="22" text-anchor="middle" fill="#ff9d6c" font-size="11" font-weight="700" font-family="Inter,system-ui" opacity="0.7">THREADS CLUSTER</text>
  `;

    const nodeEls = nodes.map(node => {
        const p = pos[node.id];
        if (!p) return '';
        const post = postById[node.id] || {};
        const color = platformColor(node.platform);
        const glow = platformGlow(node.platform);
        const degreeRatio = inDegree[node.id] / maxDegree;
        const isRoot = (inDegree[node.id] > 0 && degreeRatio >= 0.45) || (!post.parent_post_id && !post.reply_to);
        const radius = isRoot ? 8 + degreeRatio * 9 : 5 + Math.min(inDegree[node.id], 4) * 1.5;
        const username = escapeHtml(String(node.label || node.id).slice(0, 14));
        const postId = escapeHtml(String(node.id));
        const labelClass = isRoot ? 'root-label' : 'child-label';

        return `
      <g class="node ${isRoot ? 'is-root' : 'is-child'}" data-id="${postId}" tabindex="0"
         data-username="${username}"
         data-platform="${escapeHtml(node.platform || '')}"
         data-similarity="${Number(node.similarity_score ?? node.similarity ?? post.similarity_score ?? 0)}"
         data-text="${escapeHtml(post.teks_postingan || node.text || '')}"
         data-interaksi="${post.jumlah_interaksi || 0}">
        <circle cx="${p.x}" cy="${p.y}" r="${radius + (isRoot ? 7 : 4)}" fill="${glow}" opacity="${isRoot ? '.22' : '.12'}" class="node-halo"/>
        ${isRoot ? `<circle cx="${p.x}" cy="${p.y}" r="${radius + 4}" fill="none" stroke="#ffd166" stroke-width="1.4" opacity=".85" class="node-ring"/>` : ''}
        <circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="${color}" stroke="${isRoot ? '#ffd166' : '#0c1526'}" stroke-width="${isRoot ? '1.8' : '1.2'}" class="node-core" />
        <text x="${p.x}" y="${p.y + radius + 11}" text-anchor="middle" fill="#e2e8f0" font-size="${isRoot ? '10' : '8.5'}" font-weight="${isRoot ? '700' : '500'}" font-family="system-ui" class="node-label ${labelClass}">${username}</text>
        <text x="${p.x}" y="${p.y + radius + (isRoot ? 22 : 19)}" text-anchor="middle" fill="#38bdf8" font-size="${isRoot ? '8.5' : '7.5'}" font-weight="500" font-family="monospace" class="node-id-label ${labelClass}">[${postId}]</text>
      </g>
    `;
    }).join('');

    container.innerHTML = `
    <svg id="graphSvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graph dengan ${nodes.length} node dan ${allEdges.length} edge">
      <defs>
        <pattern id="dotgrid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1.2" fill="#2a3a60" opacity=".55"/>
        </pattern>
        <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7fa8ff"/>
          <stop offset="100%" stop-color="#ff9d6c"/>
        </linearGradient>
        <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 z" fill="#9fb3d8"/>
        </marker>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#dotgrid)"/>
      <g id="graphViewport">
        ${dividerEl}
        ${clusterLabels}
        <g id="edgeLayer">${edgeEls}</g>
        <g id="nodeLayer">${nodeEls}</g>
      </g>
    </svg>
  `;

    wireGraphInteractions(container, postById);
    wireGraphControls();
    applyGraphFilters(); // terapkan filter awal
}

/* ---------- Kontrol filter graph (toggle & sliders) ---------- */
function wireGraphControls() {
    const toggleConv = document.querySelector('#toggleConv');
    const toggleSim = document.querySelector('#toggleSim');
    const edgeLimitSl = document.querySelector('#edgeLimitSlider');
    const simThreshSl = document.querySelector('#simThreshSlider');
    const edgeLimitV = document.querySelector('#edgeLimitVal');
    const simThreshV = document.querySelector('#simThreshVal');

    // Hapus listener lama agar tidak dobel saat re-render
    const reAttach = (el, event, fn) => {
        if (!el) return;
        el.removeEventListener(event, el._gcHandler);
        el._gcHandler = fn;
        el.addEventListener(event, fn);
    };

    reAttach(toggleConv, 'click', () => {
        toggleConv.classList.toggle('active');
        applyGraphFilters();
    });
    reAttach(toggleSim, 'click', () => {
        toggleSim.classList.toggle('active');
        applyGraphFilters();
    });
    reAttach(edgeLimitSl, 'input', () => {
        if (edgeLimitV) edgeLimitV.textContent = edgeLimitSl.value;
        applyGraphFilters();
    });
    reAttach(simThreshSl, 'input', () => {
        if (simThreshV) simThreshV.textContent = `${simThreshSl.value}%`;
        applyGraphFilters();
    });
}

/* ---------- Interaksi: zoom, pan, hover highlight, tooltip node & edge ---------- */
function wireGraphInteractions(container, postById = {}) {
    graphInteractionController?.abort();
    graphInteractionController = new AbortController();
    const { signal } = graphInteractionController;
    const svg = container.querySelector('#graphSvg');
    const viewport = container.querySelector('#graphViewport');
    const tooltip = document.querySelector('#graphTooltip');
    const wrap = container.closest('.graph-wrap');
    let scale = 1, tx = 0, ty = 0;
    let dragging = false, lastX = 0, lastY = 0;

    function applyTransform() {
        viewport.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
    }

    function zoomBy(factor, cx = 500, cy = 290) {
        const next = Math.min(3.2, Math.max(0.45, scale * factor));
        tx = cx - ((cx - tx) / scale) * next;
        ty = cy - ((cy - ty) / scale) * next;
        scale = next;
        applyTransform();
    }

    svg.addEventListener('wheel', event => {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * 1000;
        const py = ((event.clientY - rect.top) / rect.height) * 580;
        zoomBy(event.deltaY < 0 ? 1.12 : 0.89, px, py);
    }, { passive: false });

    svg.addEventListener('mousedown', event => {
        dragging = true; lastX = event.clientX; lastY = event.clientY;
    });
    window.addEventListener('mousemove', event => {
        if (!dragging) return;
        const rect = svg.getBoundingClientRect();
        tx += ((event.clientX - lastX) / rect.width) * 1000;
        ty += ((event.clientY - lastY) / rect.height) * 580;
        lastX = event.clientX; lastY = event.clientY;
        applyTransform();
    }, { signal });
    window.addEventListener('mouseup', () => { dragging = false; }, { signal });

    document.querySelector('#zoomIn')?.addEventListener('click', () => zoomBy(1.25), { signal });
    document.querySelector('#zoomOut')?.addEventListener('click', () => zoomBy(0.8), { signal });
    document.querySelector('#zoomReset')?.addEventListener('click', () => { scale = 1; tx = 0; ty = 0; applyTransform(); }, { signal });

    const nodeGroups = container.querySelectorAll('.node');
    const edgeGroups = container.querySelectorAll('.edge-group');

    function moveTooltip(event) {
        const rect = wrap.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left}px`;
        tooltip.style.top = `${event.clientY - rect.top - 10}px`;
    }

    function showNodeTooltip(target, event) {
        const text = target.dataset.text ? target.dataset.text.slice(0, 130) + (target.dataset.text.length > 130 ? '…' : '') : 'Tidak ada teks.';
        const sim = (Number(target.dataset.similarity) * 100).toFixed(1);
        const platform = target.dataset.platform;
        tooltip.innerHTML = `
      <span class="tt-tag ${platform === 'X' ? 'x' : 'threads'}">${escapeHtml(platform)}</span>
      <strong>${escapeHtml(target.dataset.username || 'tidak diketahui')}</strong>
      ${escapeHtml(text)}
      <div class="tt-meta">Similarity ${sim}% · ${target.dataset.interaksi} interaksi</div>
    `;
        tooltip.classList.remove('hidden');
        moveTooltip(event);
    }

    function showEdgeTooltip(edgeGroup, event) {
        const sourceId = edgeGroup.dataset.source;
        const targetId = edgeGroup.dataset.target;
        const edgeType = edgeGroup.dataset.edgeType;
        const similarityScore = parseFloat(edgeGroup.dataset.similarity || '0');

        const sourcePost = postById[sourceId] || {};
        const targetPost = postById[targetId] || {};

        const sourcePlatform = sourcePost.platform || (sourceId.startsWith('platform_') ? sourceId.replace('platform_', '') : 'Medsos');
        const targetPlatform = targetPost.platform || (targetId.startsWith('platform_') ? targetId.replace('platform_', '') : 'Medsos');

        const sourceText = sourcePost.teks_postingan ? sourcePost.teks_postingan.slice(0, 130) + (sourcePost.teks_postingan.length > 130 ? '…' : '') : (sourcePost.teks_normalisasi ? sourcePost.teks_normalisasi.slice(0, 130) + '…' : 'Teks tidak ditemukan.');
        const targetText = targetPost.teks_postingan ? targetPost.teks_postingan.slice(0, 130) + (targetPost.teks_postingan.length > 130 ? '…' : '') : (targetPost.teks_normalisasi ? targetPost.teks_normalisasi.slice(0, 130) + '…' : 'Teks tidak ditemukan.');

        const isConv = edgeType === 'conversation';

        if (isConv) {
            // Deteksi apakah target adalah komentar (nested reply) atau postingan utama (root post)
            const isTargetAComment = Boolean(targetPost.parent_post_id || targetPost.reply_to);
            const badgeTitle = isTargetAComment ? '💬 Relasi Balasan Komentar' : '💬 Relasi Percakapan Utas';
            const targetLabel = isTargetAComment ? 'Komentar yang Ditanggapi' : 'Postingan Utama (Utas)';
            const sourceLabel = isTargetAComment ? 'Balasan Komentar' : 'Komentar / Balasan';
            const meaningText = isTargetAComment
                ? 'Balasan komentar menanggapi komentar sebelumnya dalam utas percakapan.'
                : 'Komentar menanggapi postingan utama pembuat utas.';

            tooltip.innerHTML = `
        <div class="tt-edge-card">
          <div class="tt-edge-badge conv">${escapeHtml(badgeTitle)}</div>
          <div class="tt-edge-field">
            <div class="tt-edge-title"><span class="tt-tag ${targetPlatform === 'X' ? 'x' : 'threads'}">${escapeHtml(targetPlatform)}</span> ${escapeHtml(targetLabel)}:</div>
            <div class="tt-edge-text">${escapeHtml(targetText)}</div>
          </div>
          <div class="tt-edge-field">
            <div class="tt-edge-title"><span class="tt-tag ${sourcePlatform === 'X' ? 'x' : 'threads'}">${escapeHtml(sourcePlatform)}</span> ${escapeHtml(sourceLabel)}:</div>
            <div class="tt-edge-text">${escapeHtml(sourceText)}</div>
          </div>
          <div class="tt-edge-meta-grid">
            <div>
              <div class="tt-edge-title">${isTargetAComment ? 'ID Komentar Induk:' : 'ID Post Utama:'}</div>
              <div class="tt-edge-code">${escapeHtml(targetId)}</div>
            </div>
            <div>
              <div class="tt-edge-title">ID Balasan:</div>
              <div class="tt-edge-code">${escapeHtml(sourceId)}</div>
            </div>
          </div>
          <div class="tt-edge-field" style="margin-top:2px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;">
            <div class="tt-edge-title">Hubungan:</div>
            <div class="tt-edge-meaning">${escapeHtml(meaningText)}</div>
          </div>
        </div>
      `;
        } else {
            // Relasi Kemiripan Lintas Platform (Similarity)
            const simPercent = (similarityScore * 100).toFixed(1);
            tooltip.innerHTML = `
        <div class="tt-edge-card">
          <div class="tt-edge-badge sim">🔗 Relasi Kemiripan Lintas Platform</div>
          <div class="tt-edge-field">
            <div class="tt-edge-title"><span class="tt-tag ${sourcePlatform === 'X' ? 'x' : 'threads'}">${escapeHtml(sourcePlatform)}</span> Postingan ${escapeHtml(sourcePlatform)}:</div>
            <div class="tt-edge-text">${escapeHtml(sourceText)}</div>
          </div>
          <div class="tt-edge-field">
            <div class="tt-edge-title"><span class="tt-tag ${targetPlatform === 'X' ? 'x' : 'threads'}">${escapeHtml(targetPlatform)}</span> Postingan ${escapeHtml(targetPlatform)}:</div>
            <div class="tt-edge-text">${escapeHtml(targetText)}</div>
          </div>
          <div class="tt-edge-meta-grid">
            <div>
              <div class="tt-edge-title">Skor Kemiripan:</div>
              <div class="tt-edge-code" style="color: #38bdf8; font-weight: 700;">${simPercent}% (${similarityScore.toFixed(4)})</div>
            </div>
            <div>
              <div class="tt-edge-title">ID Relasi:</div>
              <div class="tt-edge-code">${escapeHtml(sourceId)} ↔ ${escapeHtml(targetId)}</div>
            </div>
          </div>
          <div class="tt-edge-field" style="margin-top:2px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;">
            <div class="tt-edge-title">Hubungan:</div>
            <div class="tt-edge-meaning" style="color: #67e8f9;">Kesamaan narasi/isu antar platform berdasarkan kalkulasi Cosine Similarity.</div>
          </div>
        </div>
      `;
        }
        tooltip.classList.remove('hidden');
        moveTooltip(event);
    }

    // Interaksi Node Hover
    nodeGroups.forEach(node => {
        const id = node.dataset.id;
        node.addEventListener('mouseenter', event => {
            nodeGroups.forEach(n => n.classList.remove('active', 'dim'));
            const connected = new Set([id]);
            edgeGroups.forEach(eg => {
                const p = eg.querySelector('.edge');
                if (eg.dataset.source === id || eg.dataset.target === id) {
                    p?.classList.add('active');
                    p?.classList.remove('dim');
                    connected.add(eg.dataset.source);
                    connected.add(eg.dataset.target);
                } else {
                    p?.classList.remove('active');
                    p?.classList.add('dim');
                }
            });
            nodeGroups.forEach(n => {
                if (connected.has(n.dataset.id)) n.classList.add('active');
                else n.classList.add('dim');
            });
            showNodeTooltip(node, event);
        });
        node.addEventListener('mousemove', moveTooltip);
        node.addEventListener('mouseleave', () => {
            nodeGroups.forEach(n => n.classList.remove('active', 'dim'));
            edgeGroups.forEach(eg => {
                const p = eg.querySelector('.edge');
                p?.classList.remove('active', 'dim');
            });
            tooltip.classList.add('hidden');
        });
    });

    // Interaksi Edge Hover
    edgeGroups.forEach(eg => {
        const src = eg.dataset.source;
        const tgt = eg.dataset.target;
        eg.addEventListener('mouseenter', event => {
            nodeGroups.forEach(n => {
                if (n.dataset.id === src || n.dataset.id === tgt) {
                    n.classList.add('active');
                    n.classList.remove('dim');
                } else {
                    n.classList.remove('active');
                    n.classList.add('dim');
                }
            });
            edgeGroups.forEach(other => {
                const p = other.querySelector('.edge');
                if (other === eg) {
                    p?.classList.add('active');
                    p?.classList.remove('dim');
                } else {
                    p?.classList.remove('active');
                    p?.classList.add('dim');
                }
            });
            showEdgeTooltip(eg, event);
        });
        eg.addEventListener('mousemove', moveTooltip);
        eg.addEventListener('mouseleave', () => {
            nodeGroups.forEach(n => n.classList.remove('active', 'dim'));
            edgeGroups.forEach(other => {
                const p = other.querySelector('.edge');
                p?.classList.remove('active', 'dim');
            });
            tooltip.classList.add('hidden');
        });
    });
}

updateCount();
checkBackendStatus();
