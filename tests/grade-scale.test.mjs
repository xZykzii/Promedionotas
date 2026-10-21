import assert from "node:assert/strict";
import { parseScaleConfig, generateScale, scoreToGrade, scaleRow, scaleNumber,
    scaleCsv, formatScaleNumber } from "../grade-scale.mjs";

const FLOAT_TOLERANCE = 1e-9;
let passed = 0;
function check(name, actual, expected) {
    assert.deepEqual(actual, expected, name);
    passed++;
}
function near(name, actual, expected) {
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= FLOAT_TOLERANCE,
        `${name}: se esperaba ${expected}; recibido ${actual}`);
    passed++;
}
function configuration(overrides = {}) {
    return { maxScore: "100", requirement: "60", minGrade: "1.0", passGrade: "4.0",
        maxGrade: "7.0", increment: "1", order: "asc", ...overrides };
}
function valid(overrides = {}) {
    const result = generateScale(configuration(overrides));
    assert.equal(result.error, "");
    return result;
}
function invalid(name, overrides) {
    const result = generateScale(configuration(overrides));
    assert.ok(result.error, name);
    assert.equal(result.rows.length, 0, `${name}: no genera una tabla engañosa`);
    passed++;
}

// Tres puntos de anclaje de la escala de referencia.
const base = valid();
check("tabla de 0 a 100 tiene 101 puntajes", base.rows.length, 101);
near("cero da la nota mínima", scoreToGrade(0, base.config), 1);
near("sesenta por ciento da cuatro", scoreToGrade(60, base.config), 4);
near("puntaje máximo da siete", scoreToGrade(100, base.config), 7);
near("primer tramo, veinte puntos", scoreToGrade(20, base.config), 2);
near("primer tramo, cuarenta puntos", scoreToGrade(40, base.config), 3);
near("segundo tramo, ochenta puntos", scoreToGrade(80, base.config), 5.5);
near("segundo tramo, noventa puntos", scoreToGrade(90, base.config), 6.25);
check("cero se incluye", base.rows[0].score, 0);
check("máximo se incluye", base.rows.at(-1).score, 100);

// Las notas redondeadas y la aprobación exacta son conceptos distintos.
const below = scaleRow(59, base.config);
near("59 da 3,95 exacto", below.grade, 3.95);
near("59 muestra 4,0", below.rounded, 4);
check("59 no se marca aprobado", below.hasPassed, false);
check("60 ya está aprobado", scaleRow(60, base.config).hasPassed, true);
check("60,1 está aprobado", scaleRow(60.1, base.config).hasPassed, true);
near("redondea 62 con criterio decimal", scaleRow(62, base.config).rounded, 4.2);
check("nota mostrada usa coma y un decimal", formatScaleNumber(4, 1, 1), "4,0");
check("puntajes decimales usan coma", formatScaleNumber(12.25), "12,25");
check("sin separadores de miles para Excel", formatScaleNumber(1000), "1000");

// Exigencia configurable y rangos de notas diferentes.
const seventy = valid({ requirement: "70" });
near("70 por ciento mueve la aprobación", scoreToGrade(70, seventy.config), 4);
near("35 puntos con 70 por ciento", scoreToGrade(35, seventy.config), 2.5);
near("85 puntos con 70 por ciento", scoreToGrade(85, seventy.config), 5.5);
const otherScale = valid({ maxScore: "50", minGrade: "0", passGrade: "10", maxGrade: "20" });
near("rango alternativo parte en cero", scoreToGrade(0, otherScale.config), 0);
near("rango alternativo aprueba en 30", scoreToGrade(30, otherScale.config), 10);
near("rango alternativo termina en veinte", scoreToGrade(50, otherScale.config), 20);
const decimalRequirement = valid({ maxScore: "80", requirement: "62,5" });
near("exigencia decimal", scoreToGrade(50, decimalRequirement.config), 4);
const customPass = valid({ passGrade: "5" });
near("nota de aprobación configurable", scoreToGrade(60, customPass.config), 5);
near("nota superior configurable", scoreToGrade(80, customPass.config), 6);

// Incrementos fraccionarios, máximo no divisible y orden descendente.
const quarters = valid({ maxScore: "2", increment: "0,25" });
check("cuartos tienen nueve filas", quarters.rows.length, 9);
check("cuartos no acumulan error decimal", quarters.rows.map(row => row.score), [0, .25, .5, .75, 1, 1.25, 1.5, 1.75, 2]);
const notDivisible = valid({ maxScore: "10", increment: "3" });
check("siempre incluye máximo no divisible", notDivisible.rows.map(row => row.score), [0, 3, 6, 9, 10]);
check("nota máxima en el último extra", notDivisible.rows.at(-1).rounded, 7);
const descending = valid({ maxScore: "10", increment: "3", order: "desc" });
check("orden descendente real", descending.rows.map(row => row.score), [10, 9, 6, 3, 0]);
const tenths = valid({ maxScore: "0,3", increment: "0,1" });
check("décimas sin filas duplicadas", tenths.rows.map(row => row.score), [0, .1, .2, .3]);
const singleStep = valid({ maxScore: "10", increment: "10" });
check("incremento igual al máximo", singleStep.rows.map(row => row.score), [0, 10]);
const thousand = valid({ maxScore: "1000", increment: "10" });
check("escala de mil puntos sigue acotada", thousand.rows.length, 101);
near("escala de mil aprueba en seiscientos", scoreToGrade(600, thousand.config), 4);

// Continuidad y crecimiento: no hay saltos en el umbral ni notas decrecientes.
const threshold = base.config.maxScore * base.config.requirement / 100;
assert.ok(scoreToGrade(threshold - .0001, base.config) < 4);
assert.ok(scoreToGrade(threshold + .0001, base.config) > 4);
passed++;
for (let index = 1; index < base.rows.length; index++) {
    assert.ok(base.rows[index].grade > base.rows[index - 1].grade,
        `La escala debe crecer en ${index}`);
}
passed++;
for (const row of base.rows) {
    assert.ok(row.grade >= 1 && row.grade <= 7);
    assert.equal(row.hasPassed, row.score >= 60);
}
passed++;

// Validación estricta: no recorta puntajes inválidos ni admite texto como números.
for (const maxScore of ["0", "-1", "1000001", "abc", "100abc", "Infinity", ""]) {
    invalid(`máximo inválido ${maxScore}`, { maxScore });
}
for (const requirement of ["0", "100", "101", "-10", "60%", "", "1e2"]) {
    invalid(`exigencia inválida ${requirement}`, { requirement });
}
for (const increment of ["0", "-1", "101", "0,0000001", "a", ""]) {
    invalid(`incremento inválido ${increment}`, { increment });
}
invalid("nota mínima igual a aprobación", { minGrade: "4" });
invalid("nota mínima mayor a aprobación", { minGrade: "5" });
invalid("aprobación igual a máxima", { passGrade: "7" });
invalid("aprobación mayor a máxima", { passGrade: "8" });
invalid("máxima fuera del rango", { maxGrade: "101" });
invalid("nota negativa", { minGrade: "-1" });
invalid("nota vacía", { passGrade: "" });
invalid("orden desconocido", { order: "desconocido" });
invalid("valor objeto como input", { maxScore: { value: 100 } });
check("entrada nula se rechaza", !!parseScaleConfig(null).error, true);
check("entrada array se rechaza", !!parseScaleConfig([]).error, true);
check("booleano no es número", Number.isNaN(scaleNumber(true)), true);
check("texto con fórmula no es número", Number.isNaN(scaleNumber("=1+1")), true);
check("notación exponencial no se evalúa", Number.isNaN(scaleNumber("1e2")), true);
check("coma decimal se acepta", scaleNumber("3,5"), 3.5);
check("espacios exteriores se aceptan", scaleNumber(" 3,5 "), 3.5);
check("número no finito se rechaza", Number.isNaN(scaleNumber(Infinity)), true);
check("número negativo se rechaza", Number.isNaN(scaleNumber(-1)), true);
check("número nativo pequeño se preserva", scaleNumber(0.000001), 0.000001);
check("consulta fuera del mínimo no se recorta", Number.isNaN(scoreToGrade(-1, base.config)), true);
check("consulta fuera del máximo no se recorta", Number.isNaN(scoreToGrade(101, base.config)), true);
check("consulta NaN se rechaza", Number.isNaN(scoreToGrade(NaN, base.config)), true);

// Límite de tabla y carga grande: filas previsibles sin bloquear el navegador.
const limit = valid({ maxScore: "1999" });
check("límite de 2000 filas permitido", limit.rows.length, 2000);
invalid("2001 filas se rechazan", { maxScore: "2000" });
const hugeScore = valid({ maxScore: "1000000", increment: "1000" });
check("puntaje máximo permitido con paso grande", hugeScore.rows.length, 1001);
check("el máximo grande se conserva", hugeScore.rows.at(-1).score, 1000000);
const tiny = valid({ maxScore: "0.000003", increment: "0.000001" });
check("incremento mínimo permitido", tiny.rows.map(row => row.score), [0, .000001, .000002, .000003]);

// Exportación para Excel: UTF-8, separador local, datos numéricos y estado exacto.
const csv = scaleCsv(base);
check("CSV tiene BOM UTF-8", csv.charCodeAt(0), 0xFEFF);
check("CSV declara separador", csv.startsWith("\uFEFFsep=;\r\nPuntaje;Nota;Estado\r\n"), true);
check("CSV usa final de línea Windows", csv.includes("\r\n"), true);
check("CSV incluye primer puntaje", csv.includes("\r\n0;1,0;Bajo aprobación\r\n"), true);
check("CSV no aprueba 59 por redondeo", csv.includes("\r\n59;4,0;Bajo aprobación\r\n"), true);
check("CSV aprueba 60", csv.includes("\r\n60;4,0;Aprobado\r\n"), true);
check("CSV termina en el máximo", csv.endsWith("100;7,0;Aprobado\r\n"), true);
check("CSV contiene 101 datos", csv.trimEnd().split("\r\n").length, 103);
const reverseCsv = scaleCsv(descending);
check("CSV respeta orden descendente", reverseCsv.split("\r\n")[2], "10;7,0;Aprobado");
assert.throws(() => scaleCsv(null), /escala válida/);
passed++;
assert.throws(() => scaleCsv(generateScale(configuration({ requirement: "0" }))), /escala válida/);
passed++;
for (const line of csv.slice(1).split("\r\n").slice(2).filter(Boolean)) {
    const [score, grade, status] = line.split(";");
    assert.match(score, /^\d+(?:,\d+)?$/);
    assert.match(grade, /^\d+,\d$/);
    assert.ok(["Aprobado", "Bajo aprobación"].includes(status));
}
passed++;

// Guardado y restauración numéricos conservan la configuración exacta.
const restored = JSON.parse(JSON.stringify(decimalRequirement.config));
check("restaurar parámetros reproduce la tabla", generateScale(restored).rows, decimalRequirement.rows);
const restoredTiny = JSON.parse(JSON.stringify(tiny.config));
check("restaurar números pequeños también funciona", generateScale(restoredTiny).rows, tiny.rows);
check("los defaults están disponibles sin datos previos", parseScaleConfig().config.maxScore, 100);
check("las claves ajenas no influyen", valid({ arbitrary: "=not used" }).rows, base.rows);

// Propiedades con escalas fraccionarias y exigencias en los extremos válidos.
for (const requirement of ["0.1", "25", "50", "75", "99.9"]) {
    const scale = valid({ requirement });
    const point = scale.config.maxScore * scale.config.requirement / 100;
    near(`umbral exacto con exigencia ${requirement}`, scoreToGrade(point, scale.config), 4);
    near(`máximo conserva siete con exigencia ${requirement}`, scoreToGrade(100, scale.config), 7);
}
const fractions = valid({ minGrade: "0", passGrade: "0.5", maxGrade: "1" });
near("notas fraccionarias en el umbral", scoreToGrade(60, fractions.config), .5);
near("notas fraccionarias superiores", scoreToGrade(80, fractions.config), .75);
const oddMax = valid({ maxScore: "2.5" });
check("máximo fraccionario se agrega al final", oddMax.rows.map(row => row.score), [0, 1, 2, 2.5]);
const originalInput = configuration();
const originalSnapshot = JSON.stringify(originalInput);
generateScale(originalInput);
check("generar no modifica los parámetros del llamador", JSON.stringify(originalInput), originalSnapshot);
near("consulta acepta puntajes fuera del paso", scoreToGrade(75.5, base.config), 5.1625);
check("CSV admite puntajes fraccionarios", scaleCsv(quarters).includes("0,25;1,6;Bajo aprobación"), true);
invalid("número de aprobación no finito", { passGrade: Infinity });
invalid("valor null no se interpreta como cero", { minGrade: "null" });

console.log(`${passed} comprobaciones de escala, validación y CSV: correctas.`);
