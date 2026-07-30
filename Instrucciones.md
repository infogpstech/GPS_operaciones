# Procedimiento Obligatorio de Desarrollo

> [!IMPORTANT]
> **Prohibido agregar cualquier contenido antes de este bloque.**
>
> Este procedimiento es de **cumplimiento obligatorio** para toda tarea de desarrollo, mantenimiento, corrección, refactorización o documentación del proyecto.
>
> Ninguna etapa podrá omitirse, alterarse, reordenarse o darse por concluida sin completar las verificaciones correspondientes.

---

# Flujo Obligatorio de Trabajo

## 1. Auditoría Inicial

Antes de modificar cualquier archivo, realizar una auditoría técnica completa del alcance de la tarea.

Como parte de esta etapa, se deberá:

* Revisar la auditoría inmediatamente anterior.
* Verificar que **todas las solicitudes registradas previamente en `Instrucciones.txt` y `Auditoria.txt` hayan sido implementadas correctamente**.
* Registrar en `Instrucciones.txt` una nueva entrada con **las implementaciones solicitadas en el prompt**, conservando exactamente la redacción original.
* Registrar en `Auditoria.txt` los nuevos requerimientos, describiendo cómo fueron interpretados y planificados por el desarrollador.
* Auditar nuevamente todos los requerimientos pendientes o previamente registrados antes de iniciar cualquier implementación.
* No solicitar confirmación al usuario sobre el enfoque de trabajo. La tarea deberá completarse en un solo proceso.
* Finalizar el trabajo en un único **commit** siempre que sea posible. Si no lo es, registrar en `Instrucciones.txt` las tareas pendientes.

La auditoría deberá realizarse:

* Archivo por archivo.
* Línea por línea.
* Función por función.
* Bloque por bloque.

Antes de registrar cualquier hallazgo, documentar todas las solicitudes que originan la tarea.

Los registros deberán incluir, cuando corresponda:

* Nuevas implementaciones.
* Correcciones.
* Reportes de errores.
* Cambios funcionales.
* Cambios visuales.
* Cambios arquitectónicos.
* Refactorizaciones.
* Optimizaciones solicitadas.
* Actualización de documentación.

Posteriormente identificar como mínimo:

* Estado actual.
* Dependencias directas e indirectas.
* Relaciones entre módulos.
* Flujo de ejecución.
* Alcance real de la modificación.
* Riesgos potenciales.
* Posibles efectos colaterales.
* Código relacionado que pueda verse afectado.

> [!WARNING]
> Durante esta etapa está **prohibido modificar código**.

---

## 2. Registro de Hallazgos

Documentar todos los hallazgos antes de iniciar cualquier implementación.

Cada registro deberá incluir:

* Descripción objetiva.
* Archivo involucrado.
* Línea o bloque afectado.
* Dependencias identificadas.
* Funciones relacionadas.
* Alcance estimado.
* Riesgos detectados.

No eliminar registros previos.

---

## 3. Conversión de Hallazgos en Tareas

Cada hallazgo deberá convertirse en una tarea técnica.

Cada tarea deberá definir:

* Objetivo.
* Alcance.
* Restricciones.
* Componentes afectados.
* Resultado esperado.

No se implementarán cambios que no hayan sido documentados previamente.

---

## 4. Hallazgos Fuera del Alcance

Si durante la auditoría se detectan problemas ajenos a la solicitud:

* Corregirlos únicamente cuando representen un riesgo mínimo y no modifiquen el alcance.
* En cualquier otro caso, registrarlos como tareas independientes.

No ampliar el alcance original sin autorización.

---

## 5. Respaldo Obligatorio

Antes de editar cualquier archivo, generar un respaldo íntegro.

El respaldo deberá conservar:

* Contenido.
* Estructura.
* Estado original.

Su finalidad será facilitar la comparación y una posible reversión.

---

## 6. Implementación

La implementación deberá limitarse al alcance documentado.

Está prohibido:

* Modificar código no relacionado.
* Reestructurar componentes sin justificación.
* Alterar estilos ajenos.
* Introducir optimizaciones no solicitadas.
* Modificar flujos existentes sin necesidad técnica.

Cada cambio deberá estar respaldado por una tarea previamente documentada.

---

## 7. Comparación con el Respaldo

Al finalizar la implementación, comparar manualmente los archivos modificados con el respaldo.

Verificar:

* Líneas agregadas.
* Líneas eliminadas.
* Líneas modificadas.
* Bloques reemplazados.

Cada diferencia deberá justificarse.

Si se detectan cambios fuera del alcance:

* Revertirlos.
* Repetir la comparación hasta eliminarlos.

Las herramientas automáticas no sustituyen esta revisión.

---

## 8. Verificación Funcional

Comprobar el funcionamiento de:

* La funcionalidad implementada.
* Los flujos relacionados.
* Dependencias directas.
* Dependencias indirectas.
* Compatibilidad con el resto del sistema.

Siempre que sea posible, utilizar entornos de prueba o mecanismos de *mocking* para evitar afectar información real.

---

## 9. Revisión de Integridad

Antes de finalizar la tarea verificar que:

* No existan regresiones.
* No existan efectos colaterales.
* No existan inconsistencias lógicas.
* No se hayan roto dependencias.
* Se conserve la arquitectura del proyecto.

---

## 10. Code Review Obligatorio

Toda modificación deberá pasar por un **Code Review**.

El informe deberá revisarse completamente antes de continuar.

Ninguna observación podrá omitirse.

---

# Tratamiento del Code Review

## Observaciones sin cambios requeridos

Las recomendaciones o sugerencias podrán evaluarse sin reiniciar el procedimiento.

---

## Observaciones que requieren modificaciones

Si el Code Review detecta:

* Errores.
* Riesgos.
* Defectos.
* Regresiones.
* Observaciones bloqueantes.
* Problemas de integración.
* *Merge Assessment* desfavorable.
* *Flaws* que requieran modificaciones.

Se deberá reiniciar el procedimiento completo desde la **Auditoría Inicial**.

No se permiten correcciones parciales.

---

## Solicitudes de Reversión

### Cambios pertenecientes a trabajos anteriores

Si la reversión afecta:

* Commits anteriores.
* Tareas previamente aprobadas.
* Funcionalidades fuera del alcance.

La solicitud deberá documentarse e ignorarse.

### Cambios realizados durante la tarea actual

Si los cambios no forman parte del alcance aprobado:

* Revertirlos.
* Documentar el motivo.
* Repetir el procedimiento de verificación.

---

## Repetición del Ciclo

Después de cualquier corrección derivada del Code Review deberá repetirse:

1. Auditoría.
2. Registro de hallazgos.
3. Conversión en tareas.
4. Respaldo.
5. Implementación.
6. Comparación.
7. Verificación funcional.
8. Revisión de integridad.
9. Code Review.

El proceso concluirá únicamente cuando el Code Review no requiera nuevas modificaciones.

---

## Limpieza del Repositorio

Antes de finalizar el trabajo eliminar todos los archivos temporales generados durante el desarrollo, incluyendo:

* Respaldos.
* Scripts temporales.
* Capturas.
* Archivos de prueba.
* Recursos temporales.
* Evidencias utilizadas únicamente durante el desarrollo.

El repositorio no deberá contener archivos temporales.

---

## Organización del Proyecto

Toda implementación deberá respetar la arquitectura existente.

Los módulos, componentes y funciones deberán mantenerse organizados por responsabilidad, favoreciendo:

* Modularidad.
* Bajo acoplamiento.
* Alta cohesión.
* Reutilización.
* Escalabilidad.
* Mantenibilidad.

---

# Principios Generales

Durante todo el proceso deberán cumplirse las siguientes reglas:

* No asumir el comportamiento del código.
* No asumir dependencias.
* No asumir el impacto de una modificación.
* Verificar antes de modificar.
* Documentar antes de implementar.
* Justificar cada cambio realizado.
* Mantener el menor impacto posible sobre el sistema.
* No confundir los archivos backup .bkp con los archivos oficiales.
---

# Regla Final

> **Si no se audita, no se modifica.**
>
> **Si no se documenta, no existe.**
>
> **Si no se verifica, no se considera terminado.**

El incumplimiento de cualquiera de estas etapas invalida el proceso de desarrollo.
