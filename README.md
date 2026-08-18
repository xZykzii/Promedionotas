# Promedionotas

Calculadora de promedios ponderados para estudiantes. Organiza semestres, asignaturas y
evaluaciones, y recalcula el promedio en tiempo real a medida que se editan las notas.

**En vivo:** https://xzykzii.github.io/Promedionotas/

## Qué hace

- Estructura en tres niveles: semestres → asignaturas → evaluaciones, con subevaluaciones
  y ponderaciones propias.
- Promedio por asignatura, por semestre y global, en versión exacta y redondeada
  (redondeo configurable, con opción de un decimal por ramo).
- Cálculo de la nota que se necesita en lo que queda para aprobar.
- Exportación de los datos a JSON.
- Dos modos de uso: local, con los datos guardados en el navegador, o con sesión de
  Google para sincronizarlos entre dispositivos.

## Tecnologías

HTML, CSS y JavaScript sin framework. Firebase para autenticación y sincronización
opcional. Service worker y manifest, de modo que se instala como PWA.
