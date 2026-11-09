// GPSpedia Image-SERVICE v2.0
// ============================================================================
// GPSPEDIA-IMAGE SERVICE (PROXY SEGURO DE IMÁGENES)
// ============================================================================
// COMPONENT VERSION: 1.1.0

/**
 * @summary Este servicio actúa como un proxy seguro para las imágenes de Google Drive.
 * @description Su única responsabilidad es recibir un fileId, obtener el archivo de
 * imagen correspondiente desde Google Drive y devolverlo como un blob de datos.
 * Esta capa de abstracción es CRÍTICA para la seguridad y estabilidad del sistema:
 * 1.  **Seguridad:** El frontend NUNCA conoce la URL real de Google Drive,
 *     previniendo el acceso no autorizado o el hotlinking.
 * 2.  **Estabilidad:** Centraliza la lógica de acceso a archivos. Si Google cambia
 *     sus formatos de URL, solo este servicio necesita ser actualizado.
 * 3.  **Rendimiento:** Permite la implementación de una caché en el servidor para
 *     reducir las lecturas directas a Drive y acelerar la entrega de imágenes
 *     frecuentemente solicitadas.
 */

// ============================================================================
// ROUTER PRINCIPAL (doGet)
// ============================================================================

function doGet(e) {
  const fileId = e.parameter.fileId;

  // 1. Validación del fileId
  if (!fileId) {
    return createErrorResponse('El parámetro "fileId" es requerido.', 400);
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = `image_${fileId}`;
  let cachedImage = null;

  // Intento de lectura de caché con manejo de errores
  try {
    cachedImage = cache.get(cacheKey);
  } catch (e) {
    console.error(`IMAGE-SERVICE: Error al leer la caché para fileId ${fileId}. Se procederá sin caché. Error: ${e.message}`);
    cachedImage = null;
  }

  // 2. Servir desde la caché si está disponible y es válida
  if (cachedImage) {
    try {
      const cached = JSON.parse(cachedImage);
      const imageBlob = Utilities.newBlob(
        Utilities.base64Decode(cached.data),
        cached.contentType
      );
      // Asigna un nombre al blob para que el navegador lo pueda interpretar.
      imageBlob.setName(fileId);
      return ContentService.createImage(imageBlob);
    } catch (cacheError) {
      // Si hay un error con los datos cacheados (ej. formato antiguo), proceder a obtenerlos de Drive.
    }
  }

  // 3. Obtener el archivo de Google Drive
  try {
    const file = DriveApp.getFileById(fileId);
    const imageBlob = file.getBlob();
    const contentType = imageBlob.getContentType();
    const base64Data = Utilities.base64Encode(imageBlob.getBytes());

    // 4. Guardar en caché solo si es seguro (tamaño < 90KB)
    // El límite de CacheService es 100KB. Se usa 90KB como margen de seguridad.
    if (base64Data.length < 90 * 1024) {
      try {
        const cacheData = JSON.stringify({ data: base64Data, contentType: contentType });
        cache.put(cacheKey, cacheData, 21600); // Expira en 6 horas
      } catch (e) {
        // Si la escritura en caché falla, la operación principal no se interrumpe.
        console.error(`IMAGE-SERVICE: Error al escribir en la caché para fileId ${fileId}. La imagen se servirá igualmente. Error: ${e.message}`);
      }
    }

    // 5. Devolver la imagen
    return ContentService.createImage(imageBlob);

  } catch (error) {
    // 6. Manejo de errores (ej. archivo no encontrado o permisos incorrectos)
    // Este bloque se ejecuta si DriveApp.getFileById(fileId) falla.
    return createErrorResponse(`No se pudo encontrar o acceder al archivo con ID: ${fileId}`, 404);
  }
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Crea una respuesta de error estandarizada en formato JSON.
 * @param {string} message - El mensaje de error.
 * @param {number} statusCode - Un código de estado similar a HTTP.
 * @returns {ContentService} - Una respuesta de texto JSON.
 */
function createErrorResponse(message, statusCode) {
  const error = {
    status: 'error',
    statusCode: statusCode,
    message: message
  };
  return ContentService.createTextOutput(JSON.stringify(error))
    .setMimeType(ContentService.MimeType.TEXT);
}
