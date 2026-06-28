## GPS Operations Suite (GOS)

**Documento de Requerimientos del Proyecto**

*Descripción General*

*GPS Operations Suite (GOS)* es una aplicación web progresiva (PWA) independiente de GPSpedia, orientada a la gestión operativa de instalaciones de GPS vehicular.

La aplicación NO sustituye a GPSpedia. Ambos proyectos permanecerán independientes.

- GPSpedia: Catálogo técnico de instalaciones.
- GPS Operations Suite: Gestión de clientes, órdenes, técnicos, agenda, asignaciones, reportes y estadísticas.

La única integración será mediante los microservicios existentes de GPSpedia para consultar información técnica del vehículo.

---

#Arquitectura

*Frontend*

- HTML
- CSS
- JavaScript
- PWA

*Backend*

- Google Apps Script

*Base de datos*

- Google Spreadsheet

*Almacenamiento*

- Google Drive

*Arquitectura*

- Microservicios
- API REST
- Sin frameworks externos obligatorios.

---

# Spreadsheet principal

Utilizar exclusivamente el siguiente Spreadsheet.

https://docs.google.com/spreadsheets/d/1IiXxydi02QnVUVwWsEnC5lpB730mASI-6rTsmuI4XhE/edit?usp=drivesdk

---

*Gestión de hojas*

Si alguna hoja requerida no existe:

- Buscar primero mediante una función equivalente a FindOrCreateSheet.
- Crear únicamente cuando no exista.
- Nombrar todas las hojas en español.
- Nunca crear hojas duplicadas.
- Nunca crear una hoja por registro.

---

*Microservicios, html, js, y css existentes*

Los siguientes archivos ya existen.
index.html, add_corte.html, users.html, etc y sus hoja de estilos y de javascript deben de migrar a legacy y crear uno nuevo

los microservicios se encuentran en:

services/

estos archivos legacy No deben modificarse.

Únicamente deben utilizarse como referencia para consumir la información necesaria.

AUTH

https://script.google.com/macros/s/AKfycbwATstMSSnuYZMeGEjI7Q5cznO6kA8rqLo7zNZLmu_f29qwcyt4Fucn5VIBdB9tMoRg/exec

CATALOG

https://script.google.com/macros/s/AKfycbxenVjZe9C8-0RiYKLxpGfQtobRzydBke44IM4NdNNjh5VRdlB91Ce9dWvQ2xnDFXk0/exec

WRITE

https://script.google.com/macros/s/AKfycbwgpSXDpF9jW20mqvK8jP9clxs1Gacz-o6caOEBm1hBweAxkBe1lAW9hJTh1fMFcOvP/exec

USERS

https://script.google.com/macros/s/AKfycbxAqyEcAHetH6yN4qccGILL-L3IzMSPVuVJ1kpuO86GqfDXTKP8cHrrB7UkKN1r_0g5/exec

FEEDBACK

https://script.google.com/macros/s/AKfycbwHTr8MSFuNio8rky8tflcErlRlAb1YSH2jmszZp77SM5e_-SVMO2pBU1UmeGOH1Aig/exec

---

Integración con GPSpedia

La aplicación únicamente consultará información técnica.

No deberá modificar datos del catálogo.

La consulta deberá devolver únicamente respuestas simplificadas.

Ejemplo:

Apagado remoto

Sí

No

Apertura

Sí

No


Nunca mostrar detalles técnicos internos del catálogo.

---

Reglas de consulta

El sistema deberá consultar el catálogo para determinar si el vehículo admite:

- Apagado remoto
- Apertura
- Botón de pánico
- Micrófono

No deberá interpretar el tipo de corte.

Solamente responder:

Sí

No

---

Reglas especiales

Motocicletas

Nunca ofrecer

- Apertura
- Botón de pánico

---

Vehículos de alta gama

Ejemplos

- Mercedes
- BMW

Consultar el catálogo.

Si en cualquier parte de los detalles aparece una indicación equivalente a:

"No se recomienda"

Entonces:

Apagado remoto = No

Además:

- Apertura = No
- Botón de pánico = No

---

Tipos de trabajo

Instalación

Tiempo base

1 hora 30 minutos

---

Revisión por falla

Sin duración fija.

---

Traspaso

Tiempo base

3 horas.

---

Desinstalación

Tiempo base

1 hora.

---
Mantenimiento Preventivo

Tiempo base

15 minutos.

Los tiempos podrán modificarse desde la configuración del sistema en una hoja desde spreadsheet

---
Gestión de órdenes

Cada orden deberá contener como mínimo:

- ID
- Fecha
- Hora
- Cliente
- Contacto
- Teléfono
- Dirección
- Coordenadas GPS
- Link de Google Maps
- Marca
- Modelo
- Nunero de chasis (VIN)
- Numero de Motor
- Año
- Placa
- Servicio
- Inventario
- Tipo de trabajo 
- Prioridad
- Técnico asignado
- Estado
- Observaciones

---

Estados

- Pendiente
- Asignada
- En camino
- Llegó
- Vehículo recibido 
- Finalizada
- Cancelada

---

Agenda

Turnos configurables.

Inicialmente

- 08:00
- 10:00
- 13:00
- 15:00

Cantidad de técnicos configurable.

Inicialmente

4 técnicos.

---

Motor de asignación

El sistema asignará automáticamente.

No solicitará confirmación para el primer trabajo del técnico.

La rotación deberá respetarse.

Ejemplo

Técnico 1

↓

Técnico 2

↓

Técnico 3

↓

Técnico 4

↓

Técnico 1

---

Excepción

Únicamente solicitar confirmación cuando:

- Sea un segundo trabajo.
- El técnico esté muy cerca del nuevo trabajo.
- El técnico haya finalizado recientemente otro trabajo.
- El sistema determine una mejora operativa.

Si el técnico rechaza o no responde dentro del tiempo configurado, la orden será asignada al siguiente técnico según la rotación.

---

Geolocalización

La PWA deberá solicitar permiso de ubicación.

La ubicación del técnico se utilizará para:

- Detectar llegada.
- Calcular cercanía.
- Optimizar asignaciones.

Cuando el técnico se encuentre dentro del radio configurado del destino:

El sistema marcará automáticamente:

"Técnico llegó."

Y notificará a:

- Gerencia
- Asesor correspondiente

Sin requerir interacción manual.

---

Notificaciones

Técnico

- Nueva orden
- Cambio de orden
- Segunda asignación
- Recordatorios

Asesor

- Técnico asignado
- Técnico llegó
- Vehículo recibido
- Trabajo finalizado

Gerencia

- Todas las notificaciones relevantes
- Retrasos
- Cancelaciones
- Giras

---

Estadísticas

Registrar automáticamente:

- Hora inicio
- Hora llegada
- Hora finalización
- Tiempo total
- Tiempo de traslado
- Técnico
- Tipo de trabajo
- Marca
- Modelo
- Servicio
- Zona

---

Motor de aprendizaje

No utilizar inteligencia artificial.

Utilizar estadísticas acumuladas.

Aprender:

- Tiempo promedio por marca
- Tiempo promedio por modelo
- Tiempo promedio por técnico
- Tiempo promedio por servicio
- Tiempo promedio por tipo de trabajo
- Tiempo promedio por zona

---

Optimización

No recalcular toda la base de datos.

Actualizar las métricas únicamente cuando finalice un trabajo.

Mantener tablas agregadas con:

- Cantidad
- Promedio
- Última actualización

---

Archivado

Los registros históricos no deberán eliminarse.

Podrán archivarse periódicamente en hojas o archivos históricos independientes para mantener el rendimiento del sistema.

Las estadísticas acumuladas deberán permanecer disponibles sin recalcular el historial completo.

---

Reportes

Generar reportes:

- Diario
- Semanal
- Mensual
- Anual

Por:

- Técnico
- Cliente
- Tipo de trabajo
- Servicio
- Zona

---

Integración con Google Drive

Cada orden dispondrá de una carpeta para almacenar:

- Fotografías
- PDF
- Evidencias
- Documentación

La carpeta se creará automáticamente cuando sea necesario.

---

Objetivo del sistema

El objetivo principal es automatizar la operación diaria de la empresa, reducir tiempos muertos, optimizar la asignación de técnicos, aprovechar la información técnica existente en GPSpedia sin duplicarla y mantener una arquitectura modular, escalable y basada completamente en Google Apps Script, Google Sheets y una PWA.
