const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const moduleCode = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], {
  input: moduleCode, encoding: "utf8"
});
assert.equal(syntax.status, 0, syntax.stderr);

const CONSTANT_NAMES = [
  "GRADE_MIN", "GRADE_MAX", "PASS_GRADE", "PCT_TOLERANCE", "PERCENT_TOTAL",
  "COMPLETE_TOLERANCE", "NUMERIC_EPSILON", "DEFAULT_EXAM_PERCENT", "GRADE_DECIMALS_FACTOR"
];
const FUNCTION_NAMES = [
  "round1", "clamp", "norm", "parsePercent", "parseGrade", "safeFixed",
  "hasLegacySubGrades", "enableLegacySubGrades", "compactSubEvals", "evalGrade",
  "computeSubject", "computeNeeded", "aggregateSubjects", "computeSemester", "computeGlobal",
  "parseBoundedNumber", "normalizeExam", "evaluationPercent", "isEvaluationComplete",
  "isSubjectComplete", "examSettings", "ceilGrade", "examOutcome", "courseAverage"
];
const declarations = CONSTANT_NAMES.map(name => {
  const match = moduleCode.match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `Falta constante ${name}`);
  return `const ${name} = ${match[1]};`;
});
const functions = FUNCTION_NAMES.map(name => {
  const start = moduleCode.indexOf(`    function ${name}(`);
  const end = moduleCode.indexOf("\n    }", start) + 6;
  assert.ok(start >= 0 && end > start, `Falta función ${name}`);
  return moduleCode.slice(start, end);
});
const factories = ["emptyExam", "emptySubEval"].map(name => {
  const start = moduleCode.indexOf(`    const ${name} `);
  return moduleCode.slice(start, moduleCode.indexOf(";", start) + 1);
});
const context = vm.createContext({});
vm.runInContext([...declarations, ...factories, "let semestersData = [];", ...functions].join("\n"), context);

const FLOAT_TOLERANCE = 1e-9;
let passed = 0;
function call(name, ...args) {
  context.argumentValues = args;
  return vm.runInContext(`${name}(...argumentValues)`, context);
}
function check(name, actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), name);
  passed++;
}
function near(name, actual, expected) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < FLOAT_TOLERANCE,
    `${name}: se esperaba ${expected}; recibido ${actual}`);
  passed++;
}
function subject(presentation, exam = {}) {
  return {
    name: "Ramo de prueba", weight: "", useEqualWeights: false,
    evaluations: [{ grade: String(presentation), percent: "100" }],
    exam: { isEnabled: true, percent: "40", passGrade: "4", exemptionGrade: "4",
      minGrade: "", grade: "", ...exam }
  };
}

// Regla inicial: presentación >= 4 aprueba; sin restricción 3–3,9.
check("4,0 aprueba sin integradora", call("examOutcome", subject(4)).status, "exempt");
check("nota mayor a 4 aprueba", call("examOutcome", subject(6.2)).status, "exempt");
check("3,9 va a integradora", call("examOutcome", subject(3.9)).status, "pending");
check("2,0 también permite integradora", call("examOutcome", subject(2)).status, "pending");
near("presentación 3,5 necesita 4,8 seguro", call("examOutcome", subject(3.5)).needed, 4.8);
near("presentación 3,0 necesita 5,5", call("examOutcome", subject(3)).needed, 5.5);
check("nota requerida superior a 7", call("examOutcome", subject(1)).status, "impossible");

// El resultado final combina 60/40; usa comparación sin redondear.
const approved = call("examOutcome", subject(3.5, { grade: "4,8" }));
check("aprueba con integradora", approved.status, "passed");
near("final 3,5 y 4,8 es 4,02", approved.final, 4.02);
const failed = call("examOutcome", subject(3.5, { grade: "4,7" }));
check("3,98 no se declara aprobado", failed.status, "failed");
near("final bajo cuatro", failed.final, 3.98);
near("nota final alimenta promedio del ramo", call("courseAverage", subject(3.5, { grade: "4,8" })).avg, 4.02);
near("semestre usa nota final", call("computeSemester", { subjects: [subject(3.5, { grade: "4,8" })] }).normal, 4.02);
check("promedio pendiente es provisional", call("courseAverage", subject(3.5)).isProvisional, true);
check("final ya no es provisional", call("courseAverage", subject(3.5, { grade: "4,8" })).isProvisional, false);

// Porcentajes y reglas configurables, incluida integradora obligatoria.
near("examen de 50 por ciento", call("examOutcome", subject(3, { percent: "50" })).needed, 5);
near("examen de 30 por ciento", call("examOutcome", subject(3, { percent: "30" })).needed, 6.4);
check("sin eximición obliga examen", call("examOutcome", subject(6, { exemptionGrade: "" })).status, "pending");
near("basta un 1 si la presentación asegura cuatro", call("examOutcome", subject(6, { exemptionGrade: "" })).needed, 1);
check("eximición personalizada", call("examOutcome", subject(4.5, { exemptionGrade: "5" })).status, "pending");
check("eximición bajo la aprobación es inválida", call("examOutcome", subject(4.5, { passGrade: "5" })).status, "invalid");
const minimumRule = subject(5, { exemptionGrade: "", minGrade: "4", grade: "3.5" });
check("mínimo en examen puede reprobar", call("examOutcome", minimumRule).status, "failed");
near("necesaria respeta mínimo", call("examOutcome", minimumRule).needed, 4);
check("examen desactivado", call("examOutcome", subject(3.5, { isEnabled: false })).status, "disabled");
near("sin examen mantiene presentación", call("courseAverage", subject(3.5, { isEnabled: false })).avg, 3.5);

// Validación estricta de inputs, límites y casos de porcentaje completo.
for (const percent of ["", "0", "-10", "101", "40abc", "Infinity"]) {
  check(`porcentaje inválido ${percent}`, call("examOutcome", subject(3.5, { percent })).status, "invalid");
}
for (const grade of ["0", "8", "71", "3abc", "NaN"]) {
  check(`nota examen inválida ${grade}`, call("examOutcome", subject(3.5, { grade })).status, "invalid");
}
check("nota aprobación inválida", call("examOutcome", subject(3.5, { passGrade: "0" })).status, "invalid");
check("mínimo inválido", call("examOutcome", subject(3.5, { minGrade: "99" })).status, "invalid");
check("eximición inválida", call("examOutcome", subject(3.5, { exemptionGrade: "texto" })).status, "invalid");
near("examen acepta formato 55", call("examOutcome", subject(3, { grade: "55" })).final, 4);
check("examen cien por ciento", call("examOutcome", subject(3, { percent: "100", grade: "4" })).status, "passed");
const allExam = subject(3, { percent: "100", grade: "4" });
allExam.evaluations = [];
check("cien por ciento no exige presentación", call("examOutcome", allExam).status, "passed");
near("cien por ciento usa solo examen", call("courseAverage", allExam).avg, 4);

// Las evaluaciones incompletas nunca dan un aprobado definitivo.
const partial = subject(5);
partial.evaluations = [{ grade: "5", percent: "50" }, { grade: "", percent: "50" }];
check("faltan notas aunque promedio alto", call("examOutcome", partial).status, "provisional");
check("promedio parcial es provisional", call("courseAverage", partial).isProvisional, true);
const wrongWeights = subject(5);
wrongWeights.evaluations[0].percent = "80";
check("80 por ciento no exime", call("examOutcome", wrongWeights).status, "provisional");
const excessiveWeights = subject(5);
excessiveWeights.evaluations[0].percent = "101";
check("porcentaje fuera de rango no completa", call("isSubjectComplete", excessiveWeights), false);
const noGrades = subject(5);
noGrades.evaluations[0].grade = "";
check("sin notas espera datos", call("examOutcome", noGrades).status, "waiting");
check("sin notas no produce promedio", call("courseAverage", noGrades).avg, null);

// Ponderaciones iguales calculan con precisión y cuentan notas pendientes.
const equal = subject(3);
equal.useEqualWeights = true;
equal.evaluations = [{ grade: "3", percent: "5" }, { grade: "4", percent: "15" }, { grade: "5", percent: "80" }];
near("pesos iguales ignoran pesos manuales", call("computeSubject", equal).avg, 4);
check("tres tercios completan 100", call("isSubjectComplete", equal), true);
equal.evaluations[2].grade = "";
check("nota igual pendiente no exime", call("examOutcome", equal).status, "provisional");
near("necesita cinco en la evaluación pendiente", call("computeNeeded", equal), 5);

// Las subevaluaciones conservan su ponderación propia y deben estar completas.
const split = subject(3.5);
split.evaluations = [{ grade: "", useSubs: true, percent: "100", subs: [
  { name: "A", grade: "3", percent: "50" }, { name: "B", grade: "4", percent: "50" }
] }];
near("subnotas promedian 3,5", call("computeSubject", split).avg, 3.5);
check("subnotas completas habilitan examen", call("examOutcome", split).status, "pending");
split.evaluations[0].subs[1].grade = "";
check("subnota faltante es provisional", call("examOutcome", split).status, "provisional");
split.evaluations[0].subs[1].grade = "4";
split.evaluations[0].subs[1].percent = "20";
check("porcentaje interno incompleto es provisional", call("examOutcome", split).status, "provisional");

// Compatibilidad de datos guardados y limpieza de filas vacías.
const oldData = { subjects: [{ evaluations: [{ grade: "", useSubs: false,
  subs: [{ grade: "6", percent: "100" }] }] }] };
check("subnotas antiguas se migran", call("enableLegacySubGrades", [oldData])[0].subjects[0].evaluations[0].useSubs, true);
const manualData = { subjects: [{ evaluations: [{ grade: "", useSubs: false, hasExplicitSubMode: true,
  subs: [{ grade: "6", percent: "100" }] }] }] };
check("modo manual explícito se conserva", call("enableLegacySubGrades", [manualData])[0].subjects[0].evaluations[0].useSubs, false);
check("filas vacías sobrantes se compactan", call("compactSubEvals", [{ name: "" }, { name: "" }]).length, 1);
check("fila con nombre se conserva", call("compactSubEvals", [{ name: "" }, { name: "Test" }])[0].name, "Test");
check("configuración antigua recibe 40 por ciento", call("normalizeExam", undefined).percent, "40");
check("configuración antigua recibe aprobación directa en 4", call("normalizeExam", undefined).exemptionGrade, "4");
check("configuración malformada usa defaults", call("normalizeExam", []).isEnabled, true);
check("valor objeto no se acepta como porcentaje", Number.isNaN(call("parseBoundedNumber", {}, 0, 100)), true);

// Promedios finales exactos, ponderación por créditos y redondeo requerido.
const weighted = { useWeights: true, subjects: [
  { ...subject(5.24), weight: "2" }, { ...subject(4.1), weight: "1" }
] };
near("promedio exacto ponderado", call("computeSemester", weighted).normal, 4.86);
check("promedio exacto sin redondear por curso", call("computeSemester", { subjects: [subject(5.24)] }).normal, 5.24);
near("redondeo del curso por separado", call("computeSemester", { subjects: [subject(5.24)] }).rounded, 5.2);
near("redondeo seguro hacia arriba", call("ceilGrade", 4.75000000001), 4.8);
near("no sube décima por error binario", call("ceilGrade", 5.500000000000001), 5.5);

// El promedio global combina notas finales y marca las presentaciones pendientes.
context.globalFixture = [{ subjects: [subject(3.5, { grade: "4.8" }), subject(5.24)] }];
vm.runInContext("semestersData = globalFixture;", context);
near("global mezcla finales exactos", call("computeGlobal").normal, 4.63);
near("global redondea por asignatura", call("computeGlobal").rounded, 4.6);
check("global completo no es provisional", call("computeGlobal").isProvisional, false);
context.globalFixture = [{ subjects: [subject(3.5), subject(5.24)] }];
vm.runInContext("semestersData = globalFixture;", context);
check("global señala examen pendiente", call("computeGlobal").isProvisional, true);
partial.exam.grade = "6";
check("examen ingresado no completa evaluaciones pendientes", call("examOutcome", partial).status, "provisional");
near("promedio parcial no se sustituye por final proyectado", call("courseAverage", partial).avg, 5);
const ignored = subject(4);
ignored.evaluations.push({ grade: "", percent: "0" });
check("evaluación con peso cero no impide terminar", call("isSubjectComplete", ignored), true);
ignored.evaluations[0].grade = "texto";
check("nota inválida no produce promedio", call("computeSubject", ignored).avg, null);
const malformedSplit = { useSubs: true, subs: [{ grade: "8", percent: "100" }] };
check("subnota fuera de escala no completa", call("isEvaluationComplete", malformedSplit), false);
check("subnota fuera de escala no calcula", Number.isNaN(call("evalGrade", malformedSplit)), true);
check("valor booleano en igualdad no se toma de una cadena", call("isSubjectComplete", {
  useEqualWeights: "false", evaluations: [{ grade: "4", percent: "50" }]
}), false);
check("eximición ignora mínimo de examen innecesario", call("examOutcome", subject(4, { minGrade: "7" })).status, "exempt");
near("límite exacto de siete sigue posible", call("examOutcome", subject(2)).needed, 7);

console.log(`${passed} comprobaciones de integradora, ponderaciones y compatibilidad: correctas.`);
