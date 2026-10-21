const SCALE_DEFAULTS = Object.freeze({ maxScore: "100", requirement: "60", minGrade: "1.0",
    passGrade: "4.0", maxGrade: "7.0", increment: "1", order: "asc" });
const SCALE_STORAGE_KEY = "promedios_grade_scale_v1";
const MAX_SCALE_SCORE = 1_000_000;
const MAX_SCALE_GRADE = 100;
const MAX_SCALE_ROWS = 2_000;
const MIN_SCALE_INCREMENT = 0.000001;
const SCALE_ROWS_PER_BLOCK = 10;
const SCALE_PERCENT_TOTAL = 100;
const SCALE_EPSILON = 1e-9;
const SCALE_SCORE_FACTOR = 100_000_000;
const SCALE_GRADE_FACTOR = 10;
const SCALE_DOWNLOAD_DELAY = 1_000;
const SCALE_KEYS = Object.keys(SCALE_DEFAULTS);
let currentScale = null;

export function scaleNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : NaN;
    if (typeof value !== "string") return NaN;
    const text = String(value).trim().replace(",", ".");
    return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}

export function parseScaleConfig(raw = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Revisa los parámetros de la escala." };
    const config = {};
    for (const key of SCALE_KEYS.filter(key => key !== "order")) config[key] = scaleNumber(raw[key] ?? SCALE_DEFAULTS[key]);
    config.order = raw.order ?? SCALE_DEFAULTS.order;
    if (Object.values(config).some(value => typeof value === "number" && !Number.isFinite(value))) return { error: "Completa todos los valores numéricos con números válidos." };
    if (config.maxScore <= 0 || config.maxScore > MAX_SCALE_SCORE) return { error: `El puntaje máximo debe ser mayor que 0 y hasta ${MAX_SCALE_SCORE}.` };
    if (config.requirement <= 0 || config.requirement >= SCALE_PERCENT_TOTAL) return { error: "La exigencia debe ser mayor que 0 % y menor que 100 %." };
    if (!(config.minGrade < config.passGrade && config.passGrade < config.maxGrade) || config.maxGrade > MAX_SCALE_GRADE) return { error: "Las notas deben cumplir: mínima < aprobación < máxima (hasta 100)." };
    if (config.increment < MIN_SCALE_INCREMENT || config.increment > config.maxScore) return { error: "El incremento debe ser al menos 0,000001 y no superar el puntaje máximo." };
    if (!["asc", "desc"].includes(config.order)) return { error: "Selecciona un orden válido." };
    const steps = config.maxScore / config.increment;
    if (Math.ceil(steps) + 1 > MAX_SCALE_ROWS) return { error: `La tabla admite hasta ${MAX_SCALE_ROWS} filas. Aumenta el incremento.` };
    return { config, error: "" };
}

export function scoreToGrade(score, config) {
    if (!Number.isFinite(score) || score < 0 || score > config.maxScore) return NaN;
    const threshold = config.maxScore * config.requirement / SCALE_PERCENT_TOTAL;
    if (score <= threshold) return config.minGrade + (config.passGrade - config.minGrade) * score / threshold;
    return config.passGrade + (config.maxGrade - config.passGrade) * (score - threshold) / (config.maxScore - threshold);
}

export function scaleRow(score, config) {
    const grade = scoreToGrade(score, config);
    return { score, grade, rounded: Math.round((grade + SCALE_EPSILON) * SCALE_GRADE_FACTOR) / SCALE_GRADE_FACTOR,
        hasPassed: grade + SCALE_EPSILON >= config.passGrade };
}

export function generateScale(raw) {
    const parsed = parseScaleConfig(raw);
    if (parsed.error) return { ...parsed, rows: [] };
    const config = parsed.config;
    const rows = [];
    const steps = Math.floor(config.maxScore / config.increment);
    for (let index = 0; index <= steps; index++) {
        const score = Math.min(config.maxScore, Math.round(index * config.increment * SCALE_SCORE_FACTOR) / SCALE_SCORE_FACTOR);
        rows.push(scaleRow(score, config));
    }
    if (Math.abs(rows.at(-1).score - config.maxScore) > SCALE_EPSILON) rows.push(scaleRow(config.maxScore, config));
    if (config.order === "desc") rows.reverse();
    return { config, rows, error: "" };
}

export function formatScaleNumber(value, minDecimals = 0, maxDecimals = 8) {
    return value.toLocaleString("es-CL", { useGrouping: false, minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals });
}

export function scaleCsv(scale) {
    if (!scale?.config || scale.error || !scale.rows?.length) throw new Error("Genera una escala válida antes de exportar.");
    const lines = ["sep=;", "Puntaje;Nota;Estado"];
    for (const row of scale.rows) {
        lines.push([formatScaleNumber(row.score), formatScaleNumber(row.rounded, 1, 1), row.hasPassed ? "Aprobado" : "Bajo aprobación"].join(";"));
    }
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function scaleElement(id) { return document.getElementById(id); }

function loadScaleSettings() {
    try {
        const raw = JSON.parse(localStorage.getItem(SCALE_STORAGE_KEY) || "null");
        return parseScaleConfig(raw).error ? SCALE_DEFAULTS : raw;
    } catch (error) {
        console.warn("No se pudieron cargar los ajustes de la escala.", error);
        return SCALE_DEFAULTS;
    }
}

function saveScaleSettings(config) {
    try { localStorage.setItem(SCALE_STORAGE_KEY, JSON.stringify(config)); }
    catch (error) { console.warn("No se pudieron guardar los ajustes de la escala.", error); }
}

function selectScaleTool() {
    const isScale = window.location.hash === "#escala";
    document.querySelector(".app").classList.toggle("is-scale", isScale);
    scaleElement("viewScale").hidden = !isScale;
    scaleElement("scaleToolBtn").setAttribute("aria-pressed", String(isScale));
    scaleElement("averagesToolBtn").setAttribute("aria-pressed", String(!isScale));
}

function scaleFormValues() {
    const form = scaleElement("scaleForm");
    return Object.fromEntries(SCALE_KEYS.map(key => [key, form.elements.namedItem(key).value]));
}

function renderScaleSummary(scale) {
    const config = scale.config;
    const threshold = config.maxScore * config.requirement / SCALE_PERCENT_TOTAL;
    scaleElement("scaleMinimum").textContent = formatScaleNumber(threshold);
    scaleElement("scaleSummary").textContent = `Puntaje máximo: ${formatScaleNumber(config.maxScore)} · Exigencia: ${formatScaleNumber(config.requirement)} % · Notas: ${formatScaleNumber(config.minGrade, 1, 1)} a ${formatScaleNumber(config.maxGrade, 1, 1)} · Aprobación: ${formatScaleNumber(config.passGrade, 1, 1)} · Incremento: ${formatScaleNumber(config.increment)} · ${config.order === "asc" ? "Ascendente" : "Descendente"}`;
    scaleElement("scaleRowCount").textContent = `${scale.rows.length} puntajes`;
}

function buildScaleTable(rows) {
    const table = document.createElement("table");
    table.className = "scale-table";
    const caption = document.createElement("caption");
    caption.className = "sr-only";
    caption.textContent = `Puntajes ${formatScaleNumber(rows[0].score)} a ${formatScaleNumber(rows.at(-1).score)}`;
    const head = document.createElement("thead");
    const header = document.createElement("tr");
    for (const label of ["Puntaje", "Nota"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        header.append(th);
    }
    head.append(header);
    const body = document.createElement("tbody");
    for (const row of rows) {
        const line = document.createElement("tr");
        const score = document.createElement("td");
        score.textContent = formatScaleNumber(row.score);
        const grade = document.createElement("td");
        grade.textContent = formatScaleNumber(row.rounded, 1, 1);
        grade.className = row.hasPassed ? "scale-grade-pass" : "scale-grade-fail";
        grade.title = `${row.hasPassed ? "Aprobado" : "Bajo aprobación"} · Nota exacta: ${formatScaleNumber(row.grade)}`;
        line.append(score, grade);
        body.append(line);
    }
    table.append(caption, head, body);
    return table;
}

function renderScaleTables(scale) {
    const grid = scaleElement("scaleTableGrid");
    grid.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < scale.rows.length; index += SCALE_ROWS_PER_BLOCK) {
        fragment.append(buildScaleTable(scale.rows.slice(index, index + SCALE_ROWS_PER_BLOCK)));
    }
    grid.append(fragment);
}

function updateScaleLookup() {
    const raw = scaleElement("scaleScore").value;
    const output = scaleElement("scaleLookupResult");
    if (!raw.trim()) { output.textContent = "Ingresa tu puntaje para consultar la nota."; return; }
    if (!currentScale?.config) { output.textContent = "Corrige primero los parámetros de la escala."; return; }
    const score = scaleNumber(raw);
    const grade = scoreToGrade(score, currentScale.config);
    if (!Number.isFinite(grade)) { output.textContent = `Usa un puntaje entre 0 y ${formatScaleNumber(currentScale.config.maxScore)}.`; return; }
    const row = scaleRow(score, currentScale.config);
    output.textContent = `Nota ${formatScaleNumber(row.rounded, 1, 1)} · ${row.hasPassed ? "Aprobado" : "Bajo aprobación"} · Exacta: ${formatScaleNumber(row.grade)}`;
}

function renderGradeScale() {
    currentScale = generateScale(scaleFormValues());
    scaleElement("scaleError").textContent = currentScale.error;
    scaleElement("scaleError").hidden = !currentScale.error;
    scaleElement("scaleOutput").hidden = !!currentScale.error;
    for (const id of ["scaleExportBtn", "scalePrintBtn"]) scaleElement(id).disabled = !!currentScale.error;
    if (currentScale.error) { scaleElement("scaleTableGrid").replaceChildren(); updateScaleLookup(); return; }
    renderScaleSummary(currentScale);
    renderScaleTables(currentScale);
    updateScaleLookup();
    saveScaleSettings(currentScale.config);
}

function exportScaleCsv() {
    if (!currentScale?.config || currentScale.error) return;
    const blob = new Blob([scaleCsv(currentScale)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `escala_${currentScale.config.maxScore}pts_${currentScale.config.requirement}exigencia.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), SCALE_DOWNLOAD_DELAY);
}

function initGradeScale() {
    const settings = loadScaleSettings();
    const form = scaleElement("scaleForm");
    for (const key of SCALE_KEYS) form.elements.namedItem(key).value = settings[key] ?? SCALE_DEFAULTS[key];
    form.oninput = renderGradeScale;
    form.onsubmit = event => { event.preventDefault(); renderGradeScale(); };
    scaleElement("scaleScore").oninput = updateScaleLookup;
    scaleElement("scaleExportBtn").onclick = exportScaleCsv;
    scaleElement("scalePrintBtn").onclick = () => { if (!currentScale?.error) window.print(); };
    scaleElement("scaleToolBtn").onclick = () => { window.location.hash = "escala"; };
    scaleElement("averagesToolBtn").onclick = () => { window.location.hash = "promedios"; };
    window.addEventListener("hashchange", selectScaleTool);
    selectScaleTool();
    renderGradeScale();
}

if (typeof document !== "undefined") initGradeScale();
