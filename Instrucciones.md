# Procedimiento Obligatorio de Desarrollo

> **IMPORTANTE**
>
> **PROHIBIDO agregar cualquier contenido antes de este bloque.**
>
> Este procedimiento es de **cumplimiento obligatorio** para toda tarea de desarrollo, mantenimiento, corrección, refactorización o documentación del proyecto.
>
> Ninguna etapa podrá omitirse, alterarse, reordenarse o darse por concluida sin completar las verificaciones correspondientes.

---

# Flujo Obligatorio de Trabajo

## 1. Auditoría Inicial

Antes de realizar cualquier modificación efectuar una auditoría técnica completa del alcance de la tarea.

Como parte obligatoria de cada nueva auditoría, el desarrollador deberá revisar el registro generado en la auditoría inmediatamente anterior y comprobar que **todas las solicitudes documentadas en Instrucciones.txt y en Auditoria.txt fueron implementadas correctamente**.

La auditoría no podrá considerarse finalizada mientras exista al menos una solicitud registrada anteriormente que continúe pendiente, haya sido implementada parcialmente o no cumpla el alcance solicitado.

Registrar en Instrucciones.txt una nueva entrada con las implementaciones solicitadas en este prompt, conservando exactamente la redacción original.
Auditar que los requerimientos registrados previamente en Instrucciones.txt hayan sido implementados correctamente.
Registrar en la sección de auditoría los nuevos requerimientos, describiéndolos tal como fueron comprendidos y planificados por el agente desarrollador.
No solicitar confirmación al usuario sobre el enfoque de implementación; completar el trabajo sin interrupciones.
Finalizar todas las implementaciones en un único commit, siempre que sea posible. Si no es posible, registrar en Instrucciones.txt las tareas o implementaciones que queden pendientes.

La auditoría deberá realizarse:

- Archivo por archivo.
- Línea por línea.
- Función por función.
- Bloque por bloque.

Durante la etapa de auditoría, **antes del registro de hallazgos**, el desarrollador deberá documentar todas las solicitudes que originan tal y como se escribio el prompt, Se registraran en Instrucciones.txt y en el archivo de Auditoría.txt tal y como el desarollador entendio la asignacion, los cambios y las implemenraciones, la auditoría debe contener, incluyendo, entre otras:

- Nuevas implementaciones.
- Reportes de errores.
- Cambios funcionales.
- Cambios visuales.
- Cambios arquitectónicos.
- Solicitudes de optimización.
- Refactorizaciones.
- Requerimientos de documentación.

Este registro constituirá la justificación formal de la auditoría

despues de esa primera etapa se deberá identificar como mínimo:


- Estado actual.
- Dependencias directas e indirectas.
- Relaciones entre módulos.
- Flujo de ejecución.
- Alcance real de la modificación.
- Riesgos potenciales.
- Posibles efectos colaterales.
- Código relacionado que pueda verse afectado.

La auditoría es exclusivamente de análisis.

**Está estrictamente prohibido modificar código durante esta etapa.**

---

## 2. Registro de Hallazgos

Todos los hallazgos deberán documentarse antes de iniciar cualquier cambio.

Cada registro deberá indicar como mínimo:

- Descripción objetiva.
- Archivo involucrado.
- Línea o bloque afectado.
- Dependencias identificadas.
- Funciones relacionadas.
- Alcance estimado.
- Riesgos detectados.

No se permite eliminar información previamente registrada.

No se realizarán correcciones durante el proceso de auditoría.

---

## 3. Conversión de Hallazgos en Tareas

Finalizada la auditoría, cada hallazgo deberá transformarse en una tarea técnica claramente definida.

Cada tarea deberá especificar:

- Objetivo.
- Alcance.
- Restricciones.
- Componentes afectados.
- Resultado esperado.

No se permitirá ejecutar cambios cuya finalidad no haya sido previamente documentada.

---

## 4. Hallazgos Fuera del Alcance

Si durante la auditoría se detectan problemas ajenos a la tarea solicitada:

- Solo podrán corregirse cuando el riesgo sea mínimo y no alteren el alcance del trabajo.
- En cualquier otro caso deberán registrarse como tareas independientes para su futura atención.

Bajo ninguna circunstancia se ampliará el alcance original sin autorización.

---

## 5. Respaldo Obligatorio

Antes de editar cualquier archivo deberá generarse un respaldo íntegro.

El respaldo deberá conservar exactamente:

- Contenido.
- Estructura.
- Estado previo.

Su única finalidad será permitir una comparación posterior y facilitar una eventual reversión.

---

## 6. Ejecución de la Tarea

La implementación deberá limitarse exclusivamente al alcance aprobado.

Está prohibido:

- Modificar código no relacionado.
- Reestructurar componentes sin justificación.
- Cambiar estilos ajenos.
- Introducir optimizaciones no solicitadas.
- Alterar flujos existentes sin necesidad técnica.

Toda modificación deberá estar directamente relacionada con la tarea documentada.

---

## 7. Comparación Contra el Respaldo

Finalizada la implementación se realizará una comparación manual entre la versión modificada y el respaldo.

Se verificará:

- Líneas agregadas.
- Líneas eliminadas.
- Líneas modificadas.
- Bloques reemplazados.

Cada diferencia deberá justificarse por la tarea ejecutada.

Si se detectan cambios fuera del alcance:

- Deberán revertirse inmediatamente.
- La comparación deberá repetirse hasta eliminar todas las modificaciones no justificadas.

Las comparaciones automáticas no sustituyen esta revisión.

---

## 8. Verificación Funcional

Se comprobará el correcto funcionamiento de:

- La funcionalidad implementada.
- Los flujos relacionados.
- Las dependencias directas.
- Las dependencias indirectas.
- La compatibilidad con el resto del sistema.

Las pruebas deberán incluir escenarios normales, límites y casos relacionados.

Cuando sea posible deberán utilizarse entornos de prueba o mecanismos de *mocking* para evitar afectar información real.

---

## 9. Revisión de Integridad

Antes de finalizar la tarea deberá verificarse que:

- No existan regresiones.
- No se hayan introducido efectos colaterales.
- No existan inconsistencias lógicas.
- No se hayan roto dependencias.
- Se conserve la coherencia arquitectónica del proyecto.

---

## 10. Code Review Obligatorio

Toda modificación deberá someterse obligatoriamente a un proceso de Code Review.

El informe deberá analizarse completamente antes de continuar.

No podrá omitirse ninguna observación.

---

# Tratamiento del Resultado del Code Review

## Observaciones sin cambios requeridos

Si el Code Review únicamente contiene recomendaciones, sugerencias o mejoras no obligatorias, estas podrán evaluarse sin reiniciar el proceso.

---

## Observaciones que requieren cambios

Si el Code Review detecta:

- Errores.
- Riesgos.
- Defectos.
- Regresiones.
- Observaciones bloqueantes.
- Problemas de integración.
- Merge Assessment desfavorable.
- Flaws que impliquen modificaciones.

Entonces deberá reiniciarse el procedimiento completo desde la **Auditoría Inicial**.

No se permiten correcciones parciales.

---

## Solicitudes de Reversión

Cuando el Code Review recomiende revertir cambios, deberá realizarse una verificación obligatoria.

### Caso 1

Si los cambios sugeridos para revertirse pertenecen a:

- Commits anteriores.
- Tareas previamente aprobadas.
- Funcionalidades fuera del alcance actual.

La solicitud deberá ignorarse y documentarse el motivo.

No se modificarán trabajos previamente validados.

### Caso 2

Si los cambios fueron introducidos durante la tarea actual y no forman parte del alcance aprobado:

- Deberán revertirse.
- Se documentará el motivo.
- Se repetirá el proceso completo de verificación.

---

## Repetición del Ciclo

Después de aplicar cualquier corrección derivada del Code Review deberá ejecutarse nuevamente:

1. Auditoría.
2. Registro de hallazgos.
3. Conversión en tareas.
4. Respaldo.
5. Implementación.
6. Comparación.
7. Verificación funcional.
8. Revisión de integridad.
9. Nuevo Code Review.

El ciclo finalizará únicamente cuando el Code Review no reporte observaciones que requieran modificaciones.

---

## Limpieza del Repositorio

Antes de finalizar el trabajo deberán eliminarse todos los archivos temporales generados durante el proceso, incluyendo, cuando corresponda:

- Respaldos.
- Scripts de verificación.
- Capturas.
- Archivos de prueba.
- Recursos temporales.
- Evidencias utilizadas únicamente durante el desarrollo.

No deberán permanecer archivos temporales dentro del repositorio.

---

## Organización del Proyecto

Toda nueva implementación deberá respetar la arquitectura establecida.

Las funciones, módulos y componentes deberán permanecer organizados por responsabilidad, evitando mezclar áreas funcionales.

La estructura del proyecto deberá favorecer:

- Modularidad.
- Bajo acoplamiento.
- Alta cohesión.
- Reutilización.
- Escalabilidad.
- Mantenibilidad.

---

# Principios Generales

Durante todo el proceso deberán respetarse las siguientes reglas:

- No asumir comportamientos del código.
- No asumir dependencias.
- No asumir el impacto de una modificación.
- Verificar antes de modificar.
- Documentar antes de implementar.
- Justificar cada cambio realizado.
- Mantener el menor impacto posible sobre el sistema existente.

---

# Regla Final

**Si no se audita, no se modifica.**

**Si no se documenta, no existe.**

**Si no se verifica, no se considera terminado.**

El incumplimiento de cualquiera de estas etapas invalida el proceso de desarrollo.
