# Promedionotas

Calculadora de promedios ponderados para estudiantes. Organiza semestres, asignaturas y
evaluaciones, y recalcula el promedio en tiempo real a medida que se editan las notas.

**En vivo:** https://xzykzii.github.io/Promedionotas/

## Qué hace

- Interfaz clara y minimalista, con campos adaptados a pantallas de escritorio y celular.
- Estructura en tres niveles: semestres → asignaturas → evaluaciones, con subevaluaciones
  y ponderaciones propias. Las filas totalmente vacías sobrantes se limpian al abrir
  una asignatura; agregar una subevaluación reutiliza la fila vacía existente.
- Promedio por asignatura, por semestre y global, en versión exacta y redondeada
  (redondeo configurable, con opción de un decimal por ramo).
- Cálculo de la nota que se necesita en lo que queda para aprobar y ponderaciones iguales.
- Integradora/examen por asignatura: por defecto, presentación de 4,0 o más aprueba
  directamente; en otro caso, 60 % presentación + 40 % examen. Se pueden cambiar los
  porcentajes, la aprobación directa, la nota final requerida y un mínimo opcional del examen.
  No hay una restricción de acceso al examen por tramo de notas.
- Nota necesaria del examen redondeada hacia arriba a un decimal. La aprobación se
  compara con la nota exacta, sin redondear; si faltan evaluaciones, se muestra una proyección.
  Al ingresar el examen, su nota final se incorpora a los promedios del semestre y global.
- Limpiar notas conserva nombres, ponderaciones y reglas del ramo.
- Exportación de los datos a JSON.
- Dos modos de uso: local, con los datos guardados en el navegador, o con sesión de
  Google para sincronizarlos entre dispositivos.

## Tecnologías

HTML, CSS y JavaScript sin framework. Firebase para autenticación y sincronización
opcional. Service worker y manifest, de modo que se instala como PWA.

## Verificación

Ejecutar `node tests/calculations.cjs` desde el repositorio. Las pruebas comprueban la
sintaxis del módulo y los cálculos reales de `index.html`, sin instalar dependencias.
