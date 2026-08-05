/**
 * consultas.js - GPS Operations Suite (GOS)
 * Módulo de Consultas Técnicas por Vehículo
 *
 * Este módulo contiene la lógica de negocio para procesar búsquedas unificadas,
 * agrupamiento por marca/versión/encendido, determinación de rangos de años
 * con fallback al más cercano, y sanitización de capacidades técnicas.
 */

export const ConsultasEngine = {
    name: "GOS Consultas Engine",

    /**
     * Normaliza un texto para búsqueda (minúsculas, sin acentos ni espacios extra)
     */
    normalizeText(text) {
        if (!text) return "";
        return text.toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    },

    /**
     * Parseador de consulta unificada (marca, modelo, año)
     */
    parseQuery(rawQuery, catalogData) {
        const query = this.normalizeText(rawQuery);
        if (!query) {
            return { brand: "", model: "", year: null };
        }

        // 1. Extraer año (número de 4 dígitos entre 1900 y 2099)
        const yearMatch = rawQuery.match(/\b(19\d{2}|20\d{2})\b/);
        let year = null;
        let queryWithoutYear = query;
        if (yearMatch) {
            year = parseInt(yearMatch[1], 10);
            queryWithoutYear = query.replace(yearMatch[1], "").replace(/\s+/g, " ").trim();
        }

        // Obtener marcas únicas del catálogo para machacar coincidencia exacta o substring
        const brands = Array.from(new Set((catalogData.cortes || []).map(c => c.marca).filter(Boolean)));

        let detectedBrand = "";
        let detectedModel = "";

        // Intentar encontrar si hay una marca conocida en la query
        for (const b of brands) {
            const normB = this.normalizeText(b);
            if (normB && (queryWithoutYear === normB || queryWithoutYear.startsWith(normB + " ") || queryWithoutYear.endsWith(" " + normB))) {
                detectedBrand = b;
                detectedModel = queryWithoutYear.replace(normB, "").replace(/\s+/g, " ").trim();
                break;
            }
        }

        // Si no se detectó marca con coincidencia directa, pero hay términos de búsqueda
        if (!detectedBrand && queryWithoutYear) {
            // Busquemos si alguna palabra coincide con alguna marca
            const words = queryWithoutYear.split(" ");
            for (const word of words) {
                const found = brands.find(b => this.normalizeText(b) === word);
                if (found) {
                    detectedBrand = found;
                    detectedModel = queryWithoutYear.replace(this.normalizeText(found), "").replace(/\s+/g, " ").trim();
                    break;
                }
            }
        }

        // Si sigue sin haber marca, asumimos que toda la query de texto representa el modelo
        if (!detectedBrand && queryWithoutYear) {
            detectedModel = queryWithoutYear;
        }

        return {
            brand: detectedBrand,
            model: detectedModel,
            year: year
        };
    },

    /**
     * Realiza la búsqueda inteligente sobre el catálogo
     */
    search(rawQuery, catalogData) {
        const parsed = this.parseQuery(rawQuery, catalogData);
        const cuts = catalogData.cortes || [];

        // Caso especial: Solo ingresó año
        const rawTrim = rawQuery.trim();
        if (/^\d{4}$/.test(rawTrim)) {
            return {
                type: "error",
                message: "Ingrese el nombre del modelo.",
                parsed
            };
        }

        // Caso 1: Consulta vacía o solo marca
        if (!parsed.model && !parsed.year) {
            if (parsed.brand) {
                // Filtrar registros de esa marca y agrupar por modelo
                const brandRecords = cuts.filter(c => this.normalizeText(c.marca) === this.normalizeText(parsed.brand));
                const uniqueModels = Array.from(new Set(brandRecords.map(c => c.modelo).filter(Boolean)));
                return {
                    type: "brand_models",
                    brand: parsed.brand,
                    models: uniqueModels.sort(),
                    parsed
                };
            } else {
                // Mostrar logotipos de marcas
                return {
                    type: "brands_list",
                    parsed
                };
            }
        }

        // Caso 2: Filtrar candidatos por marca (si se detectó) y modelo
        let candidates = cuts;
        if (parsed.brand) {
            candidates = candidates.filter(c => this.normalizeText(c.marca) === this.normalizeText(parsed.brand));
        }

        if (parsed.model) {
            const normSearchModel = this.normalizeText(parsed.model);
            candidates = candidates.filter(c => {
                const normModel = this.normalizeText(c.modelo);
                return normModel.includes(normSearchModel) || normSearchModel.includes(normModel);
            });
        }

        if (candidates.length === 0) {
            return {
                type: "no_results",
                parsed
            };
        }

        // Caso 3: Si se especificó un año, filtrar por rango o aproximar al más cercano
        if (parsed.year) {
            const yearFiltered = candidates.filter(c => {
                const desde = c.anoDesde ? parseInt(c.anoDesde, 10) : null;
                const hasta = c.anoHasta ? parseInt(c.anoHasta, 10) : desde;
                if (!desde) return false;
                return parsed.year >= desde && parsed.year <= hasta;
            });

            if (yearFiltered.length > 0) {
                candidates = yearFiltered;
            } else {
                // Fallback al rango de años más cercano
                let closestRecord = null;
                let minDistance = Infinity;

                candidates.forEach(c => {
                    const desde = c.anoDesde ? parseInt(c.anoDesde, 10) : null;
                    const hasta = c.anoHasta ? parseInt(c.anoHasta, 10) : desde;
                    if (desde) {
                        let distance = 0;
                        if (parsed.year < desde) {
                            distance = desde - parsed.year;
                        } else if (parsed.year > hasta) {
                            distance = parsed.year - hasta;
                        }
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestRecord = c;
                        }
                    }
                });

                if (closestRecord) {
                    // Nos quedamos con los registros que tengan ese mismo modelo y rango más cercano
                    candidates = candidates.filter(c => c.anoDesde === closestRecord.anoDesde && c.anoHasta === closestRecord.anoHasta && this.normalizeText(c.modelo) === this.normalizeText(closestRecord.modelo));
                }
            }
        }

        // Agrupar los resultados candidatos por versión y tipo de encendido
        const grouped = {};
        candidates.forEach(c => {
            const version = c.versionesAplicables || "Estándar";
            const encendido = c.tipoEncendido || "Llave";
            const key = `${version} | ${encendido}`;

            if (!grouped[key]) {
                grouped[key] = {
                    version: version,
                    tipoEncendido: encendido,
                    records: []
                };
            }
            grouped[key].records.push(c);
        });

        return {
            type: "grouped_results",
            results: Object.values(grouped),
            parsed
        };
    },

    /**
     * Determina las capacidades técnicas de forma segura y sanitizada
     */
    getTechnicalCapabilities(vehicle) {
        const response = {
            apagadoRemoto: "No",
            apertura: "No",
            botonPanico: "No",
            microfono: "No"
        };

        if (!vehicle) return response;

        // Comprobación de alta gama o restricción de fábrica "no se recomienda"
        const nota = (vehicle.notaImportante || "").toLowerCase();
        const obs = (vehicle.observacion || "").toLowerCase();
        const brand = (vehicle.marca || "").toLowerCase();

        const isAltaGama = brand.includes("mercedes") || brand.includes("bmw") || nota.includes("no se recomienda") || obs.includes("no se recomienda");
        if (isAltaGama) {
            return response; // Todo "No"
        }

        // Apagado remoto y micrófono por defecto en vehículos normales
        response.apagadoRemoto = vehicle.tipoCorte1 ? "Sí" : "No";
        response.microfono = "Sí";

        // Regla especial para motocicletas
        const categoria = (vehicle.categoria || "").toLowerCase();
        const isMoto = categoria.includes("moto");

        if (isMoto) {
            response.apertura = "No";
            response.botonPanico = "No";
            response.microfono = "No"; // Deshabilitado por defecto en motocicletas
        } else {
            response.apertura = "Sí";
            response.botonPanico = "Sí";
        }

        return response;
    }
};
