/**
 * SpecAnalyzer DASA — Client-side specification analysis engine
 */

(function () {
  "use strict";

  /* ── DOM refs ─────────────────────────────────────────────── */
  const textarea       = document.getElementById("spec-input");
  const charCount      = document.getElementById("char-count");
  const analyzeBtn     = document.getElementById("analyze-btn");
  const clearBtn       = document.getElementById("clear-btn");
  const placeholder    = document.getElementById("results-placeholder");
  const resultsContent = document.getElementById("results-content");

  const summaryBar          = document.getElementById("summary-bar");
  const listRequirements    = document.getElementById("list-requirements");
  const listRestrictions    = document.getElementById("list-restrictions");
  const listInconsistencies = document.getElementById("list-inconsistencies");
  const keywordCloud        = document.getElementById("keyword-cloud");

  const badgeRequirements    = document.getElementById("badge-requirements");
  const badgeRestrictions    = document.getElementById("badge-restrictions");
  const badgeInconsistencies = document.getElementById("badge-inconsistencies");

  /* ── Helpers ──────────────────────────────────────────────── */

  /**
   * Sanitize a string for safe insertion as text content (no HTML injection).
   * We only need this when we build highlighted HTML from user input.
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /** Split text into non-empty sentences. */
  function toSentences(text) {
    return text
      .split(/(?<=[.!?;])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4);
  }

  /** Strip leading numbering / bullet characters from a sentence. */
  function stripLeading(s) {
    return s.replace(/^[\d]+[.)]\s*/, "").replace(/^[-•*]\s*/, "");
  }

  /* ── Analysis patterns ────────────────────────────────────── */

  // Requirement signal words (Portuguese + English for mixed specs)
  const REQ_PATTERNS = [
    /\bDEVE\b/i,
    /\bDEVEM\b/i,
    /\bPRECISA\b/i,
    /\bPRECISAM\b/i,
    /\bTEM QUE\b/i,
    /\bE OBRIGATORIO\b/i,
    /\bE NECESSARIO\b/i,
    /\bDEVERA\b/i,
    /\bDEVERAO\b/i,
    /\bshall\b/i,
    /\bmust\b/i,
    /\bshould\b/i,
    /\bwill\b/i,
    /\bhas to\b/i,
    /\bneeds to\b/i,
    /\brequired\b/i,
  ];

  // Restriction / negation patterns
  const NEG_PATTERNS = [
    /\bNAO\s+DEVE\b/i,
    /\bNAO\s+PODEM\b/i,
    /\bNAO\s+PODE\b/i,
    /\bNAO\s+DEVERA\b/i,
    /\bNAO\s+E\s+PERMITIDO\b/i,
    /\bNAO\s+E\s+PERMITIDA\b/i,
    /\bPROIBIDO\b/i,
    /\bVEDADO\b/i,
    /\bmust not\b/i,
    /\bshall not\b/i,
    /\bmust never\b/i,
    /\bnot allowed\b/i,
    /\bforbidden\b/i,
    /\bprohibited\b/i,
  ];

  /** Return the matching keyword string if a sentence matches any pattern. */
  function matchAny(sentence, patterns) {
    for (const pat of patterns) {
      const m = pat.exec(sentence);
      if (m) return m[0];
    }
    return null;
  }

  /** Highlight the matched keyword inside an already-escaped HTML string. */
  function highlight(escapedSentence, rawKeyword, cssClass) {
    const escapedKw = escapeHtml(rawKeyword);
    // Use a simple case-insensitive replace on the escaped string
    const re = new RegExp(escapedKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return escapedSentence.replace(re, `<em class="${cssClass}">$&</em>`);
  }

  /* ── Inconsistency detection ─────────────────────────────── */

  /**
   * Simple heuristic: if two sentences share a significant noun/verb stem
   * but one asserts a requirement and the other asserts a restriction,
   * they may be contradictory.
   */
  function detectInconsistencies(requirements, restrictions) {
    const issues = [];

    for (const req of requirements) {
      for (const rest of restrictions) {
        const sharedWords = significantSharedWords(req, rest);
        if (sharedWords.length > 0) {
          issues.push({
            a: req,
            b: rest,
            shared: sharedWords,
          });
        }
      }
    }
    return issues;
  }

  /** Return significant words (>4 chars) that appear in both sentences. */
  function significantSharedWords(a, b) {
    const normalize = (s) =>
      s
        .toLowerCase()
        .replace(/[^a-záàâãéêíóôõúüçña-z0-9\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4);

    const wordsA = new Set(normalize(a));
    return normalize(b).filter((w) => wordsA.has(w));
  }

  /* ── Keyword extraction ──────────────────────────────────── */

  /** Extract high-frequency meaningful words from the full text. */
  function extractKeywords(text) {
    const STOP_WORDS = new Set([
      "deve", "devem", "para", "como", "pelo", "pela", "pelos", "pelas",
      "com", "sem", "que", "uma", "mais", "menos", "todo", "toda",
      "todos", "todas", "este", "esta", "esse", "essa", "esses", "essas",
      "cada", "qualquer", "outro", "outra", "outros", "outras",
      "sobre", "entre", "quando", "onde", "from", "with", "that",
      "this", "must", "shall", "should", "will", "have", "been",
      "into", "also", "its", "and", "the", "for", "are", "can", "not",
      "nao", "por", "ser", "ter", "dos", "das", "nos", "nas",
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-záàâãéêíóôõúüçña-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP_WORDS.has(w));

    const freq = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }

    return Object.entries(freq)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /* ── Render helpers ──────────────────────────────────────── */

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

  /* ── Main analysis ───────────────────────────────────────── */

  function analyze(text) {
    const sentences = toSentences(text);

    const requirements = [];
    const restrictions = [];

    for (const raw of sentences) {
      const s = stripLeading(raw);
      const negKw = matchAny(s, NEG_PATTERNS);
      if (negKw) {
        restrictions.push({ text: s, keyword: negKw });
        continue;
      }
      const reqKw = matchAny(s, REQ_PATTERNS);
      if (reqKw) {
        requirements.push({ text: s, keyword: reqKw });
      }
    }

    const inconsistencies = detectInconsistencies(
      requirements.map((r) => r.text),
      restrictions.map((r) => r.text)
    );

    const keywords = extractKeywords(text);

    return { requirements, restrictions, inconsistencies, keywords };
  }

  /* ── Render results ──────────────────────────────────────── */

  function render(result) {
    const { requirements, restrictions, inconsistencies, keywords } = result;

    // Summary chips
    summaryBar.innerHTML = "";
    summaryBar.appendChild(
      createChip("✓", "requisitos", requirements.length, "ok")
    );
    summaryBar.appendChild(
      createChip("✕", "restricoes", restrictions.length, "warn")
    );
    summaryBar.appendChild(
      createChip("⚠", "inconsistencias", inconsistencies.length, "danger")
    );

    // Badges
    badgeRequirements.textContent    = requirements.length;
    badgeRestrictions.textContent    = restrictions.length;
    badgeInconsistencies.textContent = inconsistencies.length;

    // Requirements list
    renderList(
      listRequirements,
      requirements,
      ({ text, keyword }) => {
        const escaped   = escapeHtml(text);
        const innerHTML = highlight(escaped, keyword, "");
        return createResultItem(innerHTML, "");
      },
      "Nenhum requisito positivo identificado."
    );

    // Restrictions list
    renderList(
      listRestrictions,
      restrictions,
      ({ text, keyword }) => {
        const escaped   = escapeHtml(text);
        const innerHTML = highlight(escaped, keyword, "restriction-kw");
        return createResultItem(innerHTML, "restriction-item");
      },
      "Nenhuma restricao ou negacao identificada."
    );

    // Inconsistencies list
    renderList(
      listInconsistencies,
      inconsistencies,
      ({ a, b, shared }) => {
        const aEscaped = escapeHtml(a);
        const bEscaped = escapeHtml(b);
        const sharedStr = shared.map(escapeHtml).join(", ");
        return createResultItem(
          `<strong>Conflito potencial</strong> — termos em comum: <em>${sharedStr}</em><br>` +
            `↳ Requisito: "${aEscaped}"<br>` +
            `↳ Restricao: "${bEscaped}"`,
          "inconsistency-item"
        );
      },
      "Nenhuma inconsistencia detectada."
    );

    // Keyword cloud
    keywordCloud.innerHTML = "";
    if (keywords.length === 0) {
      const span = document.createElement("span");
      span.className = "keyword-tag";
      span.textContent = "Nenhuma palavra-chave recorrente encontrada.";
      keywordCloud.appendChild(span);
    } else {
      for (const kw of keywords) {
        const span = document.createElement("span");
        span.className = "keyword-tag";
        span.textContent = kw;
        keywordCloud.appendChild(span);
      }
    }

    // Show results, hide placeholder
    placeholder.classList.add("hidden");
    resultsContent.classList.remove("hidden");
  }

  /* ── Event listeners ─────────────────────────────────────── */

  textarea.addEventListener("input", function () {
    charCount.textContent = textarea.value.length + " caracteres";
  });

  analyzeBtn.addEventListener("click", function () {
    const text = textarea.value.trim();
    if (!text) {
      textarea.focus();
      return;
    }
    const result = analyze(text);
    render(result);
  });

  clearBtn.addEventListener("click", function () {
    textarea.value = "";
    charCount.textContent = "0 caracteres";
    placeholder.classList.remove("hidden");
    resultsContent.classList.add("hidden");
    textarea.focus();
  });
})();
