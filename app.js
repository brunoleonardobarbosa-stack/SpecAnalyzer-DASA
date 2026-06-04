/**
 * SpecAnalyzer DASA — Client-side specification analysis engine
 */

(function () {
  "use strict";

  const STORAGE_KEY = "specanalyzer-draft-v1";
  const MAX_FILE_BYTES = 512 * 1024;

  const SAMPLE_SPEC = [
    "1. O sistema DEVE permitir login com email e senha.",
    "2. O sistema DEVE validar o formato do email no cadastro.",
    "3. O sistema DEVE enviar confirmacao por email apos o cadastro.",
    "4. O modulo de pagamento DEVE aceitar cartao de credito e boleto.",
    "5. O sistema NAO DEVE armazenar senhas em texto puro.",
    "6. O sistema NAO DEVE permitir mais de cinco tentativas de login falhas sem bloqueio temporario.",
    "7. Dados pessoais devem ser criptografados em repouso (requisito de seguranca).",
    "8. O painel administrativo sera acessivel apenas para usuarios com perfil gestor.",
  ].join("\n");

  /* ── DOM refs ─────────────────────────────────────────────── */
  const textarea = document.getElementById("spec-input");
  const charCount = document.getElementById("char-count");
  const analyzeBtn = document.getElementById("analyze-btn");
  const clearBtn = document.getElementById("clear-btn");
  const sampleBtn = document.getElementById("sample-btn");
  const placeholder = document.getElementById("results-placeholder");
  const resultsContent = document.getElementById("results-content");
  const resultsToolbar = document.getElementById("results-toolbar");
  const analysisMeta = document.getElementById("analysis-meta");
  const resultFilter = document.getElementById("result-filter");
  const exportBtn = document.getElementById("export-btn");
  const copyBtn = document.getElementById("copy-btn");
  const uploadZone = document.getElementById("upload-zone");
  const fileInput = document.getElementById("file-input");
  const toastEl = document.getElementById("toast");

  const summaryBar = document.getElementById("summary-bar");
  const listDuplicates = document.getElementById("list-duplicates");
  const listRequirements = document.getElementById("list-requirements");
  const listRestrictions = document.getElementById("list-restrictions");
  const listInconsistencies = document.getElementById("list-inconsistencies");
  const listNeutrals = document.getElementById("list-neutrals");
  const keywordCloud = document.getElementById("keyword-cloud");

  const badgeDuplicates = document.getElementById("badge-duplicates");
  const badgeRequirements = document.getElementById("badge-requirements");
  const badgeRestrictions = document.getElementById("badge-restrictions");
  const badgeInconsistencies = document.getElementById("badge-inconsistencies");
  const badgeNeutrals = document.getElementById("badge-neutrals");

  const sectionDuplicates = document.getElementById("section-duplicates");

  let lastResult = null;
  let lastAnalyzedText = "";
  let toastTimer = null;

  /* ── Patterns ─────────────────────────────────────────────── */

  const REQ_MANDATORY = [
    /\bDEVE\b/i,
    /\bDEVEM\b/i,
    /\bDEVERA\b/i,
    /\bDEVERAO\b/i,
    /\bE OBRIGATORIO\b/i,
    /\bE OBRIGATÓRIO\b/i,
    /\bmust\b/i,
    /\bshall\b/i,
    /\brequired\b/i,
  ];

  const REQ_RECOMMENDED = [
    /\bPRECISA\b/i,
    /\bPRECISAM\b/i,
    /\bTEM QUE\b/i,
    /\bE NECESSARIO\b/i,
    /\bE NECESSÁRIO\b/i,
    /\bshould\b/i,
    /\bwill\b/i,
    /\bhas to\b/i,
    /\bneeds to\b/i,
  ];

  const NEG_PATTERNS = [
    /\bNAO\s+DEVE\b/i,
    /\bNÃO\s+DEVE\b/i,
    /\bNAO\s+PODEM\b/i,
    /\bNÃO\s+PODEM\b/i,
    /\bNAO\s+PODE\b/i,
    /\bNÃO\s+PODE\b/i,
    /\bNAO\s+DEVERA\b/i,
    /\bNAO\s+E\s+PERMITIDO\b/i,
    /\bNÃO\s+E\s+PERMITIDO\b/i,
    /\bPROIBIDO\b/i,
    /\bVEDADO\b/i,
    /\bmust not\b/i,
    /\bshall not\b/i,
    /\bmust never\b/i,
    /\bnot allowed\b/i,
    /\bforbidden\b/i,
    /\bprohibited\b/i,
  ];

  const CONFLICT_STOP_WORDS = new Set([
    "sistema", "usuario", "usuário", "modulo", "módulo", "servico", "serviço",
    "deve", "devem", "nao", "não", "para", "com", "sem", "todo", "toda",
    "todos", "todas", "este", "esta", "esse", "essa", "dados", "apenas",
    "system", "user", "module", "service", "shall", "must", "will",
  ]);

  const STOP_WORDS = new Set([
    "deve", "devem", "para", "como", "pelo", "pela", "pelos", "pelas",
    "com", "sem", "que", "uma", "mais", "menos", "todo", "toda",
    "todos", "todas", "este", "esta", "esse", "essa", "esses", "essas",
    "cada", "qualquer", "outro", "outra", "outros", "outras",
    "sobre", "entre", "quando", "onde", "from", "with", "that",
    "this", "must", "shall", "should", "will", "have", "been",
    "into", "also", "its", "and", "the", "for", "are", "can", "not",
    "nao", "não", "por", "ser", "ter", "dos", "das", "nos", "nas",
  ]);

  /* ── Helpers ──────────────────────────────────────────────── */

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.add("hidden");
    }, 2800);
  }

  function updateCharCount() {
    const len = textarea.value.length;
    const sentences = toSentences(textarea.value).length;
    charCount.textContent =
      len + " caracteres" + (sentences > 0 ? " · " + sentences + " frases" : "");
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, textarea.value);
    } catch (_e) {
      /* quota or private mode */
    }
  }

  function loadDraft() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        textarea.value = saved;
        updateCharCount();
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function toSentences(text) {
    return text
      .split(/(?<=[.!?;])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4);
  }

  function stripLeading(s) {
    return s.replace(/^[\d]+[.)]\s*/, "").replace(/^[-•*]\s*/, "");
  }

  function matchAny(sentence, patterns) {
    for (const pat of patterns) {
      const m = pat.exec(sentence);
      if (m) return m[0];
    }
    return null;
  }

  function highlight(escapedSentence, rawKeyword, cssClass) {
    const escapedKw = escapeHtml(rawKeyword);
    const re = new RegExp(escapedKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return escapedSentence.replace(re, `<em class="${cssClass}">$&</em>`);
  }

  function normalizeKey(s) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(s) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
  }

  function significantSharedWords(a, b) {
    const wordsA = new Set(
      tokenize(a).filter((w) => !CONFLICT_STOP_WORDS.has(w))
    );
    return tokenize(b).filter((w) => wordsA.has(w) && !CONFLICT_STOP_WORDS.has(w));
  }

  function detectInconsistencies(requirements, restrictions) {
    const issues = [];
    const seen = new Set();

    for (const req of requirements) {
      for (const rest of restrictions) {
        const sharedWords = significantSharedWords(req.text, rest.text);
        const strong =
          sharedWords.length >= 2 ||
          sharedWords.some((w) => w.length >= 8);
        if (!strong) continue;

        const key = normalizeKey(req.text) + "|" + normalizeKey(rest.text);
        if (seen.has(key)) continue;
        seen.add(key);

        issues.push({
          a: req.text,
          b: rest.text,
          shared: sharedWords,
          severity: sharedWords.length >= 3 ? "alta" : "media",
        });
      }
    }
    return issues;
  }

  function detectDuplicates(items) {
    const map = new Map();
    const dups = [];

    for (const item of items) {
      const key = normalizeKey(item.text);
      if (!key) continue;
      const prev = map.get(key);
      if (prev) {
        dups.push({ text: item.text, count: prev.count + 1, keyword: item.keyword });
        prev.count += 1;
      } else {
        map.set(key, { count: 1, first: item });
      }
    }

    for (const [, entry] of map) {
      if (entry.count > 1) {
        dups.push({
          text: entry.first.text,
          count: entry.count,
          keyword: entry.first.keyword,
        });
      }
    }

    const unique = [];
    const seenKey = new Set();
    for (const d of dups) {
      const k = normalizeKey(d.text);
      if (seenKey.has(k)) continue;
      seenKey.add(k);
      unique.push(d);
    }
    return unique;
  }

  function extractKeywords(text) {
    const words = tokenize(text).filter(
      (w) => w.length > 4 && !STOP_WORDS.has(w)
    );

    const freq = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }

    return Object.entries(freq)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([word, count]) => ({ word, count }));
  }

  function classifyRequirement(sentence) {
    const mandatory = matchAny(sentence, REQ_MANDATORY);
    if (mandatory) return { keyword: mandatory, strength: "obrigatorio" };
    const recommended = matchAny(sentence, REQ_RECOMMENDED);
    if (recommended) return { keyword: recommended, strength: "recomendado" };
    return null;
  }

  /* ── Analysis ─────────────────────────────────────────────── */

  function analyze(text) {
    const sentences = toSentences(text);
    const requirements = [];
    const restrictions = [];
    const neutrals = [];

    for (const raw of sentences) {
      const s = stripLeading(raw);
      const negKw = matchAny(s, NEG_PATTERNS);
      if (negKw) {
        restrictions.push({ text: s, keyword: negKw });
        continue;
      }
      const req = classifyRequirement(s);
      if (req) {
        requirements.push({ text: s, keyword: req.keyword, strength: req.strength });
        continue;
      }
      neutrals.push({ text: s });
    }

    const duplicates = detectDuplicates(requirements);
    const inconsistencies = detectInconsistencies(requirements, restrictions);
    const keywords = extractKeywords(text);

    return {
      requirements,
      restrictions,
      inconsistencies,
      duplicates,
      neutrals,
      keywords,
      stats: {
        characters: text.length,
        sentences: sentences.length,
        words: text.split(/\s+/).filter(Boolean).length,
      },
    };
  }

  /* ── Render ───────────────────────────────────────────────── */

  function createResultItem(htmlContent, extraClass) {
    const li = document.createElement("li");
    li.className = "result-item" + (extraClass ? " " + extraClass : "");
    li.innerHTML = htmlContent;
    return li;
  }

  function renderList(listEl, items, renderFn, emptyMsg) {
    listEl.innerHTML = "";
    if (items.length === 0) {
      listEl.appendChild(
        createResultItem(escapeHtml(emptyMsg), "empty-notice")
      );
    } else {
      for (const item of items) {
        listEl.appendChild(renderFn(item));
      }
    }
  }

  function createChip(icon, label, count, chipClass) {
    const span = document.createElement("span");
    span.className = "summary-chip " + chipClass;
    span.textContent = icon + " " + count + " " + label;
    return span;
  }

  function toggleSection(sectionEl, visible) {
    sectionEl.classList.toggle("section-collapsed", !visible);
  }

  function applyResultFilter(query) {
    const q = query.trim().toLowerCase();
    const lists = resultsContent.querySelectorAll(".result-list");
    for (const list of lists) {
      for (const li of list.querySelectorAll(".result-item")) {
        if (li.classList.contains("empty-notice")) continue;
        const text = li.textContent.toLowerCase();
        li.classList.toggle("filter-hidden", q.length > 0 && !text.includes(q));
      }
    }
  }

  function render(result) {
    const {
      requirements,
      restrictions,
      inconsistencies,
      duplicates,
      neutrals,
      keywords,
      stats,
    } = result;

    summaryBar.innerHTML = "";
    summaryBar.appendChild(
      createChip("✓", "requisitos", requirements.length, "ok")
    );
    summaryBar.appendChild(
      createChip("✕", "restricoes", restrictions.length, "warn")
    );
    summaryBar.appendChild(
      createChip("⚠", "conflitos", inconsistencies.length, "danger")
    );
    summaryBar.appendChild(
      createChip("≈", "duplicatas", duplicates.length, "duplicate")
    );
    summaryBar.appendChild(
      createChip("○", "outras frases", neutrals.length, "neutral")
    );
    summaryBar.appendChild(
      createChip("#", "palavras", stats.words, "meta")
    );

    badgeDuplicates.textContent = duplicates.length;
    badgeRequirements.textContent = requirements.length;
    badgeRestrictions.textContent = restrictions.length;
    badgeInconsistencies.textContent = inconsistencies.length;
    badgeNeutrals.textContent = neutrals.length;

    toggleSection(sectionDuplicates, duplicates.length > 0);

    renderList(
      listDuplicates,
      duplicates,
      ({ text, count }) =>
        createResultItem(
          escapeHtml(text) +
            ' <span class="dup-count">(' +
            count +
            " ocorrencias)</span>",
          "duplicate-item"
        ),
      "Nenhuma duplicata encontrada."
    );

    renderList(
      listRequirements,
      requirements,
      ({ text, keyword, strength }) => {
        const escaped = escapeHtml(text);
        const innerHTML = highlight(escaped, keyword, "");
        const badge =
          strength === "obrigatorio"
            ? '<span class="strength-tag mandatory">obrigatorio</span>'
            : '<span class="strength-tag recommended">recomendado</span>';
        return createResultItem(badge + " " + innerHTML, "");
      },
      "Nenhum requisito positivo identificado."
    );

    renderList(
      listRestrictions,
      restrictions,
      ({ text, keyword }) => {
        const escaped = escapeHtml(text);
        const innerHTML = highlight(escaped, keyword, "restriction-kw");
        return createResultItem(innerHTML, "restriction-item");
      },
      "Nenhuma restricao ou negacao identificada."
    );

    renderList(
      listInconsistencies,
      inconsistencies,
      ({ a, b, shared, severity }) => {
        const sharedStr = shared.map(escapeHtml).join(", ");
        return createResultItem(
          `<span class="severity-tag ${severity === "alta" ? "high" : "med"}">${escapeHtml(severity)}</span> ` +
            `<strong>Conflito potencial</strong> — termos: <em>${sharedStr}</em><br>` +
            `↳ Requisito: "${escapeHtml(a)}"<br>` +
            `↳ Restricao: "${escapeHtml(b)}"`,
          "inconsistency-item"
        );
      },
      "Nenhuma inconsistencia detectada."
    );

    renderList(
      listNeutrals,
      neutrals,
      ({ text }) => createResultItem(escapeHtml(text), "neutral-item"),
      "Todas as frases foram classificadas como requisito ou restricao."
    );

    keywordCloud.innerHTML = "";
    if (keywords.length === 0) {
      const span = document.createElement("span");
      span.className = "keyword-tag";
      span.textContent = "Nenhuma palavra-chave recorrente encontrada.";
      keywordCloud.appendChild(span);
    } else {
      const max = keywords[0].count;
      for (const { word, count } of keywords) {
        const span = document.createElement("span");
        span.className = "keyword-tag";
        span.style.fontSize = 0.78 + (count / max) * 0.22 + "rem";
        span.title = count + " ocorrencias";
        span.textContent = word + " (" + count + ")";
        keywordCloud.appendChild(span);
      }
    }

    const now = new Date();
    analysisMeta.textContent =
      "Analise em " +
      now.toLocaleString("pt-BR") +
      " — " +
      stats.sentences +
      " frases, " +
      stats.words +
      " palavras.";
    analysisMeta.classList.remove("hidden");
    resultsToolbar.classList.remove("hidden");

    placeholder.classList.add("hidden");
    resultsContent.classList.remove("hidden");

    applyResultFilter(resultFilter.value);
  }

  function buildReportMarkdown(result, sourceText) {
    const lines = [
      "# Relatorio SpecAnalyzer DASA",
      "",
      "Gerado em: " + new Date().toISOString(),
      "",
      "## Resumo",
      "- Requisitos: " + result.requirements.length,
      "- Restricoes: " + result.restrictions.length,
      "- Inconsistencias: " + result.inconsistencies.length,
      "- Duplicatas: " + result.duplicates.length,
      "- Outras frases: " + result.neutrals.length,
      "",
      "## Requisitos",
    ];

    for (const r of result.requirements) {
      lines.push("- [" + r.strength + "] " + r.text);
    }
    lines.push("", "## Restricoes");
    for (const r of result.restrictions) {
      lines.push("- " + r.text);
    }
    lines.push("", "## Inconsistencias");
    for (const i of result.inconsistencies) {
      lines.push(
        "- (" + i.severity + ") Requisito: " + i.a + " | Restricao: " + i.b
      );
    }
    lines.push("", "## Texto original", "", "```", sourceText, "```");
    return lines.join("\n");
  }

  function runAnalysis() {
    const text = textarea.value.trim();
    if (!text) {
      textarea.focus();
      showToast("Cole ou importe uma especificacao antes de analisar.");
      return;
    }
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analisando…";
    requestAnimationFrame(function () {
      lastResult = analyze(text);
      lastAnalyzedText = text;
      render(lastResult);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analisar";
      saveDraft();
    });
  }

  function resetResults() {
    placeholder.classList.remove("hidden");
    resultsContent.classList.add("hidden");
    resultsToolbar.classList.add("hidden");
    analysisMeta.classList.add("hidden");
    lastResult = null;
    lastAnalyzedText = "";
    resultFilter.value = "";
  }

  /* ── File upload ──────────────────────────────────────────── */

  function readFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showToast("Arquivo muito grande. Limite: 512 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      textarea.value = String(reader.result || "");
      updateCharCount();
      saveDraft();
      showToast('Arquivo "' + file.name + '" importado.');
    };
    reader.onerror = function () {
      showToast("Nao foi possivel ler o arquivo.");
    };
    reader.readAsText(file, "UTF-8");
  }

  /* ── Events ───────────────────────────────────────────────── */

  textarea.addEventListener("input", function () {
    updateCharCount();
    saveDraft();
  });

  analyzeBtn.addEventListener("click", runAnalysis);

  clearBtn.addEventListener("click", function () {
    textarea.value = "";
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_e) {
      /* ignore */
    }
    updateCharCount();
    resetResults();
    textarea.focus();
  });

  sampleBtn.addEventListener("click", function () {
    textarea.value = SAMPLE_SPEC;
    updateCharCount();
    saveDraft();
    showToast("Exemplo carregado. Clique em Analisar.");
    textarea.focus();
  });

  textarea.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runAnalysis();
    }
  });

  resultFilter.addEventListener("input", function () {
    applyResultFilter(resultFilter.value);
  });

  copyBtn.addEventListener("click", function () {
    if (!lastResult) return;
    const md = buildReportMarkdown(lastResult, lastAnalyzedText);
    navigator.clipboard
      .writeText(md)
      .then(function () {
        showToast("Relatorio copiado para a area de transferencia.");
      })
      .catch(function () {
        showToast("Nao foi possivel copiar. Use Exportar.");
      });
  });

  exportBtn.addEventListener("click", function () {
    if (!lastResult) return;
    const md = buildReportMarkdown(lastResult, lastAnalyzedText);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "specanalyzer-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Relatorio exportado.");
  });

  uploadZone.addEventListener("click", function () {
    fileInput.click();
  });

  uploadZone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", function () {
    const file = fileInput.files && fileInput.files[0];
    if (file) readFile(file);
    fileInput.value = "";
  });

  uploadZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });

  uploadZone.addEventListener("dragleave", function () {
    uploadZone.classList.remove("drag-over");
  });

  uploadZone.addEventListener("drop", function (e) {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readFile(file);
  });

  loadDraft();
  updateCharCount();
})();
