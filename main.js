import { routeAction } from './api-config.js';

const SESSION_KEY = 'gos_session';
let dashboardInterval = null;

/**
 * UI_TEMPLATES: Bloques de construcción para la interfaz.
 * v0.4.1
 */
const UI_TEMPLATES = {
    loading: '<div class="loading-spinner"><p>Cargando información...</p></div>',

    table(headers, rows) {
        let html = `<table class="gos-table"><thead><tr>`;
        headers.forEach(h => html += `<th>${h}</th>`);
        html += `</tr></thead><tbody>`;
        rows.forEach(r => html += `<tr>${r}</tr>`);
        html += `</tbody></table>`;
        return html;
    },

    badge(status) {
        const safeStatus = (status || 'Pendiente').toLowerCase().replace(/\s+/g, '');
        return `<span class="badge badge-${safeStatus}">${status}</span>`;
    },

    priorityBadge(priority) {
        const p = (priority || 'Normal').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let color = '#28a745'; // Normal -> Verde
        if (p === 'alta') {
            color = '#fd7e14'; // Alta -> Naranja
        } else if (p === 'maxima' || p === 'urgente') {
            color = '#dc3545'; // Máxima -> Rojo
        }
        return `<span class="priority-dot" style="display:inline-block; width:15px; height:15px; border-radius:50%; background-color:${color}; vertical-align:middle;" title="Prioridad: ${priority}"></span>`;
    },

    chart(data) {
        // data: [{label: 'Tech1', value: 10}, ...]
        const maxVal = Math.max(...data.map(d => d.value)) || 1;
        let html = '<div class="gos-chart-container">';
        data.forEach(d => {
            const pct = (d.value / maxVal) * 100;
            html += `
                <div class="chart-bar-row">
                    <div class="chart-label">${d.label}</div>
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar" style="width: ${pct}%"></div>
                        <span class="chart-value">${d.value}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    },

    modal(title, message, onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                    <button class="btn btn-primary" id="modal-confirm">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#modal-confirm').onclick = () => {
            onConfirm();
            document.body.removeChild(overlay);
        };
        overlay.querySelector('#modal-cancel').onclick = () => {
            if (onCancel) onCancel();
            document.body.removeChild(overlay);
        };
    },

    orderForm(options = {}) {
        return `
            <h3>Crear Nueva Orden</h3>
            <form id="order-form" class="order-form">
                <div class="form-grid">
                    <div class="form-group"><label>Fecha</label><input type="date" name="fecha" class="form-control" required></div>
                    <div class="form-group"><label>Hora</label><input type="time" name="hora" class="form-control" required></div>
                    <div class="form-group"><label>Cliente</label><input type="text" name="cliente" class="form-control" required></div>
                    <div class="form-group"><label>Contacto</label><input type="text" name="contacto" class="form-control"></div>
                    <div class="form-group"><label>Teléfono</label><input type="text" name="telefono" class="form-control" required></div>
                    <div class="form-group"><label>Dirección</label><input type="text" name="direccion" class="form-control" required></div>
                    <div class="form-group"><label>Coordenadas (Lat, Lng)</label><input type="text" name="coordenadas" class="form-control" placeholder="Ej: 9.9333, -84.0833"></div>
                    <div class="form-group"><label>Link Google Maps</label><input type="url" name="linkMaps" class="form-control"></div>

                    <!-- Chasis VIN (para consulta de historial automático) -->
                    <div class="form-group">
                        <label>VIN (Chasis)</label>
                        <input type="text" name="vin" id="order-vin" class="form-control" required placeholder="Ingrese 17 dígitos">
                    </div>
                    <div class="form-group">
                        <label>Clasificación del Vehículo</label>
                        <select name="clasificacionVehiculo" id="order-clasificacion" class="form-control" required>
                            <option value="">Seleccione...</option>
                            <option value="Vehículo nuevo">Vehículo nuevo</option>
                            <option value="Vehículo usado">Vehículo usado</option>
                        </select>
                    </div>

                    <div class="form-group"><label>Marca</label><input type="text" name="marca" id="order-marca" class="form-control" required></div>
                    <div class="form-group"><label>Modelo</label><input type="text" name="modelo" id="order-modelo" class="form-control" required></div>
                    <div class="form-group"><label>Número Motor</label><input type="text" name="motor" id="order-motor" class="form-control"></div>
                    <div class="form-group"><label>Año</label><input type="number" name="anio" id="order-anio" class="form-control"></div>
                    <div class="form-group"><label>Placa</label><input type="text" name="placa" id="order-placa" class="form-control"></div>
                    <div class="form-group"><label>Color</label><input type="text" name="color" id="order-color" class="form-control"></div>

                    <div class="form-group">
                        <label>Servicio</label>
                        <select name="servicio" class="form-control">${options.servicios || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group"><label>Inventario</label><textarea name="inventario" class="form-control"></textarea></div>
                    <div class="form-group">
                        <label>Tipo de Trabajo</label>
                        <select name="tipoTrabajo" class="form-control">${options.tiposTrabajo || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group">
                        <label>Prioridad</label>
                        <select name="prioridad" class="form-control">${options.prioridades || '<option>Cargando...</option>'}</select>
                    </div>
                    <div class="form-group"><label>Observaciones</label><textarea name="observaciones" class="form-control"></textarea></div>

                    <!-- Contenedor dinámico de memoria histórica y validaciones de chasis -->
                    <div id="vehicle-history-container" style="grid-column: 1 / -1; margin-top: 15px; display: none;"></div>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button type="submit" class="btn btn-primary">Guardar y Asignar</button>
                    <button type="button" id="cancel-order-btn" class="btn btn-secondary">Cancelar</button>
                </div>
            </form>
        `;
    }
};

/**
 * AppState: Gestor central de estado de la aplicación.
 * v0.4.0
 */
const AppState = {
    user: null,
    currentSection: 'dashboard',
    activeOrder: null,
    config: null,

    setUser(userData) {
        this.user = userData;
        localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    },

    clearUser() {
        this.user = null;
        localStorage.removeItem(SESSION_KEY);
    },

    async loadConfig() {
        try {
            const result = await routeAction('GOS_CORE', 'getSystemConfig');
            if (result.status === 'success') {
                this.config = result.data;
                this.loadMapsScript();
            }
        } catch (error) {
            console.error("Error cargando configuración:", error);
        }
    },

    loadMapsScript() {
        if (this.config?.Sistema?.GoogleMapsAPIKey && !window.google) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${this.config.Sistema.GoogleMapsAPIKey}&callback=initMap`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
    }
};

async function init() {
    window.loadSection = loadSection;
    window.markStatus = markStatus;
    window.initMap = initMap;
    window.openDrive = openDrive;
    window.openMaps = openMaps;
    window.UI_TEMPLATES = UI_TEMPLATES; // Exponer para utilidades globales

    setupAuthListeners();
    setupNavigationListeners();
    setupGeolocation();

    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
        AppState.user = JSON.parse(session);
        await AppState.loadConfig();
        showMainView(AppState.user);
    }
}

function setupGeolocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition((position) => {
            const { latitude, longitude } = position.coords;
            // Aquí se enviaría la ubicación al backend periódicamente
            console.log(`Ubicación actualizada: ${latitude}, ${longitude}`);
            checkArrivalStatus(latitude, longitude);
        }, (error) => {
            console.warn("Error de geolocalización:", error.message);
        }, {
            enableHighAccuracy: true,
            maximumAge: 30000,
            timeout: 27000
        });
    }
}

async function checkArrivalStatus(lat, lng) {
    if (!AppState.user) return;

    // Enviar ubicación al backend
    routeAction('GOS_CORE', 'updateTechnicianLocation', {
        tecnicoId: AppState.user.ID,
        lat,
        lng
    });

    // Lógica de proximidad: Solo procesar si hay una orden activa en estado 'En camino'
    const activeOrder = AppState.activeOrder;
    if (activeOrder && activeOrder.estado === 'En Camino' && activeOrder.coordenadas) {
        const [targetLat, targetLng] = activeOrder.coordenadas.split(',').map(Number);
        const distance = calculateDistance(lat, lng, targetLat, targetLng);

        let threshold = 0.2; // 200m
        if (AppState.config && AppState.config.Sistema && AppState.config.Sistema.RadioLlegada) {
            threshold = parseFloat(AppState.config.Sistema.RadioLlegada) / 1000;
        }

        if (distance < threshold && activeOrder.estado !== 'Llegó') {
            markStatus(activeOrder.id, 'Llegó');
        }
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Exponer markStatus de forma inmediata a nivel global
window.markStatus = markStatus;

async function markStatus(orderId, newStatus) {
    try {
        const result = await routeAction('GOS_CORE', 'updateOrderStatus', { orderId, status: newStatus });
        if (result.status === 'success') {
            // Actualizar activeOrder en AppState
            if (newStatus === 'En Camino') {
                AppState.activeOrder = { id: orderId, estado: newStatus };
                const row = document.querySelector(`tr[data-id="${orderId}"]`);
                if (row) {
                    AppState.activeOrder.coordenadas = row.dataset.coords;
                }
            } else if (newStatus === 'Finalizada' || newStatus === 'Cancelada') {
                AppState.activeOrder = null;
            } else if (AppState.activeOrder && AppState.activeOrder.id === orderId) {
                AppState.activeOrder.estado = newStatus;
            }

            notifyChange(newStatus);
            loadSection(AppState.currentSection || 'ordenes');
        }
    } catch (error) {
        console.error("Error al actualizar estado:", error);
    }
}

function notifyChange(status) {
    const toast = document.getElementById('toast');
    toast.textContent = `Estado actualizado: ${status}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);

    // Registrar en backend para auditoría de gerencia
    routeAction('GOS_CORE', 'sendNotification', {
        recipient: 'Gerencia',
        message: `Orden cambió a ${status}`,
        type: 'StatusChange'
    });
}

function setupNavigationListeners() {
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.currentTarget.dataset.section;
            loadSection(section);
        });
    });
}

function loadSection(section) {
    AppState.currentSection = section;
    const titleEl = document.getElementById('section-title');
    const contentEl = document.getElementById('section-content');

    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    const sections = {
        dashboard: { title: 'Dashboard Operativo', content: '<p>Cargando dashboard...</p>' },
        agenda: { title: 'Agenda de Instalaciones', content: '<p>Cargando turnos...</p>' },
        ordenes: { title: 'Gestión de Órdenes', content: '<p>Cargando órdenes de trabajo...</p>' },
        clientes: { title: 'Directorio de Clientes', content: '<p>Cargando base de datos de clientes...</p>' },
        tecnicos: { title: 'Panel de Técnicos', content: '<p>Cargando disponibilidad de técnicos...</p>' },
        consulta: { title: 'Consulta Técnica GPSpedia', content: '<p>Cargando motor de consulta...</p>' },
        reportes: { title: 'Reportes Operativos', content: '<p>Cargando reportes...</p>' },
        'admin-metrics': { title: 'Métricas Administrativas (Restringido)', content: '<p>Cargando métricas...</p>' }
    };

    if (sections[section]) {
        titleEl.textContent = sections[section].title;
        contentEl.innerHTML = sections[section].content;

        if (section === 'dashboard') {
            renderDashboardModule(contentEl);
        } else if (section === 'ordenes') {
            renderOrdersModule(contentEl);
        } else if (section === 'agenda') {
            renderAgendaModule(contentEl);
        } else if (section === 'tecnicos') {
            renderTechniciansModule(contentEl);
        } else if (section === 'clientes') {
            renderClientsModule(contentEl);
        } else if (section === 'consulta') {
            renderConsultationModule(contentEl);
        } else if (section === 'reportes') {
            renderReportsModule(contentEl);
        } else if (section === 'admin-metrics') {
            renderAdminMetricsModule(contentEl);
        }
    }
}

async function renderReportsModule(container) {
    const config = AppState.config || {};
    const reportOptions = config.Reportes ? Object.values(config.Reportes) : ['diario', 'semanal', 'mensual'];

    container.innerHTML = `
        <div class="actions-bar">
            <select id="report-type" class="form-control" style="width:auto; display:inline-block;">
                ${reportOptions.map(opt => `<option value="${opt.toLowerCase()}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('')}
            </select>
            <button id="generate-report-btn" class="btn btn-primary">Generar Reporte</button>
            <button id="export-report-btn" class="btn btn-secondary" style="display:none;">Exportar CSV</button>
        </div>
        <div id="report-results" style="margin-top:20px;">
            <p>Seleccione el tipo de reporte y presione generar.</p>
        </div>
    `;

    const exportBtn = document.getElementById('export-report-btn');
    let currentReportData = null;

    document.getElementById('generate-report-btn').addEventListener('click', async () => {
        const type = document.getElementById('report-type').value;
        const resultsDiv = document.getElementById('report-results');
        resultsDiv.innerHTML = '<p>Procesando datos...</p>';
        exportBtn.style.display = 'none';

        try {
            const result = await routeAction('GOS_CORE', 'generateReport', { type });
            if (result.status === 'success') {
                currentReportData = result.reportData;
                const data = result.reportData;
                if (data.length <= 1) {
                    resultsDiv.innerHTML = '<p>No hay datos para este período.</p>';
                    return;
                }

                exportBtn.style.display = 'inline-block';
                const headers = data[0];

                // Helper para mapeo dinámico basado en nombres de columnas
                const getVal = (row, name) => {
                    const idx = headers.indexOf(name);
                    return idx !== -1 ? row[idx] : 'N/A';
                };

                const rows = data.slice(1).map(row => {
                    return `
                        <td>${getVal(row, 'Fecha')}</td>
                        <td>${getVal(row, 'Cliente')}</td>
                        <td>${getVal(row, 'Técnico Asignado')}</td>
                        <td>${UI_TEMPLATES.badge(getVal(row, 'Estado'))}</td>
                    `;
                });

                // Generar Estadísticas para Gráfico (Ej: Órdenes por técnico)
                const stats = {};
                data.slice(1).forEach(row => {
                    const tech = getVal(row, 'Técnico Asignado');
                    stats[tech] = (stats[tech] || 0) + 1;
                });
                const chartData = Object.entries(stats).map(([label, value]) => ({ label, value }));

                resultsDiv.innerHTML = `
                    <h3>Reporte ${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
                    <div style="margin-bottom:30px;">
                        <h4>Distribución por Técnico</h4>
                        ${UI_TEMPLATES.chart(chartData)}
                    </div>
                    ${UI_TEMPLATES.table(['Fecha', 'Cliente', 'Técnico', 'Estado'], rows)}
                `;
            }
        } catch (error) {
            resultsDiv.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`;
        }
    });

    exportBtn.addEventListener('click', () => {
        if (!currentReportData) return;
        const csvContent = "data:text/csv;charset=utf-8,"
            + currentReportData.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `GOS_Reporte_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

async function renderConsultationModule(container) {
    container.innerHTML = `
        <form id="consult-form" class="order-form">
            <div class="form-grid">
                <div class="form-group"><label>Categoría</label><input type="text" name="categoria" class="form-control" placeholder="Ej: Automóvil"></div>
                <div class="form-group"><label>Marca</label><input type="text" name="marca" class="form-control" required></div>
                <div class="form-group"><label>Modelo</label><input type="text" name="modelo" class="form-control" required></div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:10px;">Consultar Capacidades</button>
        </form>
        <div id="consult-result" style="margin-top:20px;"></div>
    `;

    document.getElementById('consult-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());
        const resultDiv = document.getElementById('consult-result');

        resultDiv.innerHTML = '<p>Consultando catálogo...</p>';
        try {
            const result = await routeAction('GOS_CORE', 'getTechnicalConsultation', payload);
            if (result.status === 'success') {
                const data = result.data;
                resultDiv.innerHTML = `
                    <div class="stat-card" style="text-align:left;">
                        <p><strong>Apagado Remoto:</strong> ${data.apagadoRemoto}</p>
                        <p><strong>Apertura:</strong> ${data.apertura}</p>
                        <p><strong>Botón de Pánico:</strong> ${data.botonPanico}</p>
                        <p><strong>Micrófono:</strong> ${data.microfono}</p>
                    </div>
                `;
            }
        } catch (error) {
            resultDiv.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`;
        }
    });
}

async function renderClientsModule(container) {
    container.innerHTML = `
        <div class="actions-bar">
            <button id="new-client-btn" class="btn btn-primary">Nuevo Cliente</button>
        </div>
        <div id="clients-list"><p>Cargando clientes...</p></div>
    `;

    document.getElementById('new-client-btn').addEventListener('click', () => {
        renderClientForm(container);
    });

    try {
        const result = await routeAction('GOS_CORE', 'getClients');
        const listDiv = document.getElementById('clients-list');
        if (result.status === 'success') {
            if (result.data.length === 0) {
                listDiv.innerHTML = '<p>No hay clientes registrados.</p>';
            } else {
                let html = `<table class="gos-table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Acciones</th></tr></thead><tbody>`;
                result.data.forEach(client => {
                    html += `<tr><td>${client.nombre}</td><td>${client.telefono}</td><td><button class="btn btn-sm btn-secondary">Editar</button></td></tr>`;
                });
                html += `</tbody></table>`;
                listDiv.innerHTML = html;
            }
        }
    } catch (error) {
        document.getElementById('clients-list').innerHTML = `<p>Error al cargar clientes.</p>`;
    }
}

function renderClientForm(container) {
    container.innerHTML = `
        <h3>Registrar Nuevo Cliente</h3>
        <form id="client-form" class="order-form">
            <div class="form-grid">
                <div class="form-group"><label>Nombre Completo</label><input type="text" name="nombre" class="form-control" required></div>
                <div class="form-group"><label>Empresa</label><input type="text" name="empresa" class="form-control"></div>
                <div class="form-group"><label>Teléfono</label><input type="text" name="telefono" class="form-control" required></div>
                <div class="form-group"><label>Correo</label><input type="email" name="correo" class="form-control"></div>
                <div class="form-group"><label>RTN</label><input type="text" name="rtn" class="form-control"></div>
                <div class="form-group"><label>Dirección</label><input type="text" name="direccion" class="form-control"></div>
                <div class="form-group"><label>Observaciones</label><textarea name="observaciones" class="form-control"></textarea></div>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button type="submit" class="btn btn-primary">Guardar Cliente</button>
                <button type="button" onclick="loadSection('clientes')" class="btn btn-secondary">Cancelar</button>
            </div>
        </form>
    `;

    document.getElementById('client-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
        try {
            await routeAction('GOS_CORE', 'createClient', payload);
            alert('Cliente creado');
            loadSection('clientes');
        } catch (error) {
            alert('Error: ' + error.message);
        }
    });
}

async function renderTechniciansModule(container) {
    container.innerHTML = `
        <div class="stats-dashboard">
            <div class="stat-card">
                <h4>Técnicos Activos</h4>
                <p id="active-techs-count">Cargando...</p>
            </div>
        </div>
        <div id="tech-map" style="height:400px; border-radius:12px; margin-bottom:20px; background:#ddd; display:flex; align-items:center; justify-content:center;">
            <p>Mapa de Seguimiento en Tiempo Real</p>
        </div>
        <div id="techs-list" class="techs-table-container"></div>
    `;

    try {
        const result = await routeAction('GOS_CORE', 'getTechnicians');
        if (result.status === 'success') {
            document.getElementById('active-techs-count').textContent = result.data.length;
            const list = document.getElementById('techs-list');
            let html = `<table class="gos-table"><thead><tr><th>Técnico</th><th>Última Ubicación</th><th>Última Act.</th></tr></thead><tbody>`;
            result.data.forEach(t => {
                html += `<tr><td>${t.nombre}</td><td>${t.lat || 'N/A'}, ${t.lng || 'N/A'}</td><td>${t.ultimaact || 'Nunca'}</td></tr>`;
            });
            html += `</tbody></table>`;
            list.innerHTML = html;

            // Actualizar Mapa
            updateMap(result.data);
        }
    } catch (error) {
        console.error("Error techs:", error);
    }
}

async function renderAgendaModule(container) {
    container.innerHTML = `
        <div class="agenda-container">
            <div id="agenda-grid" class="agenda-grid">
                <p>Cargando agenda...</p>
            </div>
        </div>
    `;

    try {
        const config = await routeAction('GOS_CORE', 'getAgendaConfig');
        const orders = await routeAction('GOS_CORE', 'getOrders');

        if (config.status === 'success' && orders.status === 'success') {
            const grid = document.getElementById('agenda-grid');
            grid.innerHTML = '';

            config.data.turnos.forEach(turno => {
                const row = document.createElement('div');
                row.className = 'agenda-row';
                const turnoId = turno.replace(':', '');
                row.innerHTML = `
                    <div class="agenda-time">${turno}</div>
                    <div class="agenda-slots" id="slots-${turnoId}"></div>
                `;
                grid.appendChild(row);

                // Poblar con órdenes de este turno
                const slotsCont = document.getElementById(`slots-${turnoId}`);
                const ordersInTurn = orders.data.filter(o => o.hora === turno);
                ordersInTurn.forEach(order => {
                    const card = document.createElement('div');
                    card.className = 'order-mini-card';

                    // Colores por estado (v0.4.2)
                    const statusKey = (order.estado || 'Pendiente').toLowerCase().replace(/\s+/g, '');
                    const configColors = AppState.config.Agenda || {};
                    const statusColor = configColors[`Color_${order.estado}`] || '#ddd';

                    card.style.borderLeft = `5px solid ${statusColor}`;
                    card.innerHTML = `
                        <strong>${order.cliente}</strong><br>
                        <small>${order.marca} ${order.modelo}</small><br>
                        <span style="font-size:0.7rem; opacity:0.7;">${order.tecnicoasignado || 'Sin asignar'}</span>
                    `;
                    slotsCont.appendChild(card);
                });
            });
        }
    } catch (error) {
        console.error("Error al cargar agenda:", error);
    }
}

async function renderOrdersModule(container) {
    container.innerHTML = `
        <div class="actions-bar">
            <button id="new-order-btn" class="btn btn-primary">Nueva Orden</button>
        </div>
        <div id="orders-list" class="orders-table-container">
            <p>Cargando órdenes...</p>
        </div>
    `;

    document.getElementById('new-order-btn').addEventListener('click', () => {
        renderOrderForm(container);
    });

    try {
        const result = await routeAction('GOS_CORE', 'getOrders');
        if (result.status === 'success') {
            const listContainer = document.getElementById('orders-list');
            if (result.data.length === 0) {
                listContainer.innerHTML = '<p>No hay órdenes registradas.</p>';
            } else {
                let tableHtml = `
                    <table class="gos-table">
                        <thead>
                            <tr>
                                <th>Fecha</th><th>Cliente</th><th>Vehículo</th><th>Estado</th><th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                result.data.forEach(order => {
                    const status = order.estado || 'Pendiente';
                    tableHtml += `
                        <tr data-id="${order.id}" data-coords="${order.coordenadas || ''}">
                            <td>${order.fecha}</td>
                            <td>${order.cliente}</td>
                            <td>${order.marca} ${order.modelo}</td>
                            <td>${UI_TEMPLATES.badge(status)}</td>
                            <td class="actions-cell">
                                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                                    ${status === 'Asignada' ? `<button class="btn btn-sm btn-secondary" title="Marcar En camino" onclick="markStatus('${order.id}', 'En Camino')">En camino</button>` : ''}
                                    ${['En Camino', 'Llegó', 'Vehículo recibido'].includes(status) ? `<button class="btn btn-sm btn-primary" title="Finalizar" onclick="markStatus('${order.id}', 'Finalizada')">Finalizar</button>` : ''}

                                    <button class="btn btn-sm btn-outline" title="Ver Historial (Próximamente)" disabled>📜</button>
                                    <button class="btn btn-sm btn-outline" title="Duplicar (Próximamente)" disabled>👯</button>
                                    <button class="btn btn-sm btn-outline" title="Cancelar (Próximamente)" disabled>🚫</button>
                                    <button class="btn btn-sm btn-outline" title="Drive" onclick="openDrive('${order.id}', '${order.cliente}')">📂</button>
                                    <button class="btn btn-sm btn-outline" title="Maps" onclick="openMaps('${order.coordenadas}')">📍</button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
                tableHtml += '</tbody></table>';
                listContainer.innerHTML = tableHtml;
            }
        }
    } catch (error) {
        console.error("Error al cargar órdenes:", error);
    }
}

function renderOrderForm(container) {
    const config = AppState.config || {};

    const buildOptions = (category, defaultList = []) => {
        const options = config[category] ? Object.values(config[category]) : defaultList;
        return options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
    };

    container.innerHTML = UI_TEMPLATES.orderForm({
        servicios: buildOptions('Servicios', ['Básico', 'Full']),
        tiposTrabajo: buildOptions('TiposTrabajo', ['Instalación', 'Revisión por falla', 'Mantenimiento', 'Desinstalación', 'Reinstalación', 'Otros']),
        prioridades: buildOptions('Prioridades', ['Normal', 'Alta', 'Máxima'])
    });

    document.getElementById('cancel-order-btn').addEventListener('click', () => loadSection('ordenes'));

    const vinInput = document.getElementById('order-vin');
    const historyContainer = document.getElementById('vehicle-history-container');

    vinInput.addEventListener('blur', async () => {
        const vin = vinInput.value.trim();
        if (!vin) {
            historyContainer.style.display = 'none';
            return;
        }

        try {
            historyContainer.innerHTML = '<p style="color:var(--secondary); font-style:italic;">Buscando historial del vehículo...</p>';
            historyContainer.style.display = 'block';

            const result = await routeAction('GOS_CORE', 'getVehicleHistory', { vin });
            if (result.status === 'success' && result.history && result.history.length > 0) {
                const hist = result.history;

                // Buscar si posee registros previos de instalación
                const hasPrevInstallation = hist.some(h => {
                    const t = (h.tipotrabajo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return t.includes('instalacion') || t.includes('reinstalacion');
                });

                const lastRecord = hist[hist.length - 1]; // Usar el último registro para autocompletar

                let warningHtml = '';
                if (hasPrevInstallation) {
                    warningHtml = `
                        <div style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-weight: bold;">
                            ⚠️ ¡ATENCIÓN ASISTENTE DE VENTAS! Este vehículo ya posee un GPS instalado anteriormente en nuestro sistema. (Clasificado como Vehículo Usado).
                        </div>
                    `;
                    const clasifSelect = document.getElementById('order-clasificacion');
                    if (clasifSelect) clasifSelect.value = 'Vehículo usado';
                }

                let historyListHtml = `
                    <div style="background: #f8f9fa; border: 1px solid #eee; padding: 15px; border-radius: 8px; margin-top: 10px;">
                        ${warningHtml}
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
                            <h4 style="margin:0; color:var(--dark);">Memoria Histórica del Vehículo</h4>
                            <button type="button" class="btn btn-sm btn-primary" id="autofill-vehicle-btn" style="padding: 4px 10px; font-size: 0.8rem;">📦 Autocompletar Datos</button>
                        </div>

                        <div style="margin-bottom:15px; font-size: 0.9rem; line-height: 1.4;">
                            <strong>Últimos Datos Registrados:</strong><br>
                            🚗 Vehículo: ${lastRecord.marca || ''} ${lastRecord.modelo || ''} (${lastRecord.anio || ''}) | Color: ${lastRecord.color || ''} | Placa: ${lastRecord.placa || ''} | Motor: ${lastRecord.motor || ''}
                        </div>

                        <strong>Historial Operativo de Servicios:</strong>
                        <table class="gos-table" style="margin-top: 10px; font-size:0.8rem;">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo de Trabajo</th>
                                    <th>Técnico</th>
                                    <th>Sector/División</th>
                                    <th>Lugar de Ejecución</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${hist.map(h => `
                                    <tr>
                                        <td>${h.fecha || ''}</td>
                                        <td><strong>${h.tipotrabajo || ''}</strong></td>
                                        <td>${h.tecnico || ''}</td>
                                        <td><span class="badge" style="background:#e2e3e5; color:#383d41;">${h.sector || ''}</span></td>
                                        <td><small>${h.lugar || ''}</small></td>
                                        <td><small>${h.estado || ''}</small></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;

                historyContainer.innerHTML = historyListHtml;
                historyContainer.style.display = 'block';

                // Configurar acción del botón autocompletar
                document.getElementById('autofill-vehicle-btn').onclick = (e) => {
                    e.preventDefault();
                    document.getElementById('order-marca').value = lastRecord.marca || '';
                    document.getElementById('order-modelo').value = lastRecord.modelo || '';
                    document.getElementById('order-motor').value = lastRecord.motor || '';
                    document.getElementById('order-anio').value = lastRecord.anio || '';
                    document.getElementById('order-placa').value = lastRecord.placa || '';
                    document.getElementById('order-color').value = lastRecord.color || '';
                    alert("¡Campos del vehículo autocompletados desde el historial!");
                };

            } else {
                // Es un vehículo nuevo o sin registros previos
                historyContainer.innerHTML = `
                    <div style="background: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 12px; border-radius: 8px; font-weight: bold;">
                        🚗 No se encontraron registros previos para este chasis. Clasificado tentativamente como Vehículo Nuevo.
                    </div>
                `;
                historyContainer.style.display = 'block';
                const clasifSelect = document.getElementById('order-clasificacion');
                if (clasifSelect) clasifSelect.value = 'Vehículo nuevo';
            }
        } catch (err) {
            console.error("Error al consultar historial:", err);
            historyContainer.style.display = 'none';
        }
    });

    document.getElementById('order-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData.entries());

        try {
            // 1. Crear Orden
            const result = await routeAction('GOS_CORE', 'createOrder', payload);
            if (result.status === 'success') {
                const orderId = result.orderId;

                // 2. Disparar Auto-Asignación
                const assignResult = await routeAction('GOS_CORE', 'autoAssignTechnical', {
                    orderId,
                    coordinates: payload.coordenadas
                });

                if (assignResult.status === 'pending_confirmation') {
                    UI_TEMPLATES.modal(
                        'Asignación Requerida',
                        assignResult.message,
                        async () => {
                            // Re-intentar forzando la asignación
                            const forceResult = await routeAction('GOS_CORE', 'autoAssignTechnical', {
                                orderId,
                                coordinates: payload.coordenadas,
                                force: true
                            });
                            if (forceResult.status === 'success') {
                                notifyChange(`Orden #${orderId} asignada a ${forceResult.tecnico}`);
                                loadSection('ordenes');
                            } else {
                                alert(`Error al forzar asignación: ${forceResult.message}`);
                            }
                        },
                        () => {
                            notifyChange('Asignación Pendiente de Revisión Manual');
                            loadSection('ordenes');
                        }
                    );
                } else if (assignResult.status === 'success') {
                    alert(`Orden #${orderId} creada y asignada a: ${assignResult.tecnico}`);
                    loadSection('ordenes');
                } else {
                    alert(`Orden #${orderId} creada pero falló asignación automática: ${assignResult.message}`);
                    loadSection('ordenes');
                }

                loadSection('ordenes');
            }
        } catch (error) {
            alert('Error en el proceso: ' + error.message);
        }
    });
}

function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const result = await routeAction('AUTH', 'login', { username, password });
            if (result.status === 'success') {
                AppState.setUser(result.user);
                await AppState.loadConfig();
                showMainView(result.user);
            }
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.style.display = 'block';
        }
    });

    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        AppState.clearUser();
        location.reload();
    });
}

async function showMainView(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('welcome-msg').textContent = `Hola, ${user.Nombre_Usuario || 'Usuario'}`;

    try {
        const result = await routeAction('GOS_CORE', 'getUserSector', { username: user.Nombre_Usuario });
        if (result.status === 'success') {
            user.Sector = result.sector;
        } else {
            user.Sector = 'San Pedro Sula';
        }
    } catch (e) {
        console.error("Error al obtener sector:", e);
        user.Sector = 'San Pedro Sula';
    }

    // RBAC: Mostrar enlace a Métricas Administrativas si el rol lo amerita
    const isChiefOrManager = ['jefe', 'gerente', 'desarrollador', 'jefe de tienda', 'administrador'].includes((user.Privilegios || '').toLowerCase().trim());
    const navAdmin = document.getElementById('nav-admin-metrics');
    if (navAdmin) {
        if (isChiefOrManager) {
            navAdmin.style.display = 'inline-block';
        } else {
            navAdmin.style.display = 'none';
        }
    }

    loadSection('dashboard');
}

let mapInstance = null;
let markers = [];

function initMap() {
    console.log("Google Maps API inicializada");
}

async function openDrive(orderId, cliente) {
    try {
        const result = await routeAction('GOS_CORE', 'getOrCreateOrderFolder', { orderId, cliente });
        if (result.status === 'success') {
            window.open(result.folderUrl, '_blank');
        } else {
            alert("Error al abrir Drive: " + result.message);
        }
    } catch (e) {
        alert("Error de conexión con Drive");
    }
}

function openMaps(coordenadas) {
    if (!coordenadas) {
        alert("No hay coordenadas disponibles para esta orden.");
        return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${coordenadas}`;
    window.open(url, '_blank');
}

function updateMap(techs) {
    const mapEl = document.getElementById('tech-map');
    if (!mapEl) return;

    if (!mapInstance && window.google) {
        mapInstance = new google.maps.Map(mapEl, {
            center: { lat: 9.9333, lng: -84.0833 },
            zoom: 12
        });
    }

    if (mapInstance) {
        // Limpiar markers previos
        markers.forEach(m => m.setMap(null));
        markers = [];

        techs.forEach(t => {
            if (t.lat && t.lng) {
                const marker = new google.maps.Marker({
                    position: { lat: parseFloat(t.lat), lng: parseFloat(t.lng) },
                    map: mapInstance,
                    title: t.nombre,
                    label: t.nombre.charAt(0)
                });
                markers.push(marker);
            }
        });
    }
}

/**
 * Renderiza el Dashboard Operativo con métricas y órdenes de trabajo filtradas por sector.
 */
async function renderDashboardModule(container) {
    const user = AppState.user;
    if (!user) {
        container.innerHTML = '<p>Por favor inicie sesión para ver esta información.</p>';
        return;
    }

    const isPowerUser = ['desarrollador', 'jefe', 'gerente', 'jefe de tienda', 'administrador'].includes((user.Privilegios || '').toLowerCase().trim());
    let activeSector = isPowerUser ? 'Todos' : (user.Sector || 'San Pedro Sula');

    const updateDashboard = async () => {
        try {
            const result = await routeAction('GOS_CORE', 'getOrders');
            if (result.status !== 'success') {
                container.innerHTML = `<p class="error-msg">Error al cargar datos del dashboard: ${result.message}</p>`;
                return;
            }

            const orders = result.data;

            // Filtrar órdenes por el sector seleccionado
            const filteredOrders = orders.filter(order => {
                if (activeSector === 'Todos') return true;
                return (order.sector || '').toLowerCase().trim() === activeSector.toLowerCase().trim();
            });

            let html = `
                <div class="dashboard-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:15px;">
                    <div>
                        <p style="margin:0; font-size:0.95rem; color:var(--secondary);">
                            Sector Operativo Activo: <strong id="sector-display" style="color:var(--primary); font-size:1.1rem;">${activeSector}</strong>
                        </p>
                    </div>
            `;

            if (isPowerUser) {
                const sectores = ['Todos', 'San Pedro Sula', 'Tegucigalpa', 'La Ceiba', 'Choluteca', 'Occidente'];
                html += `
                    <div>
                        <label style="font-weight:bold; margin-right:8px; font-size:0.9rem;">Zona Operativa:</label>
                        <select id="sector-selector" class="form-control" style="width:auto; display:inline-block; padding: 5px 10px;">
                            ${sectores.map(sec => `<option value="${sec}" ${activeSector === sec ? 'selected' : ''}>${sec}</option>`).join('')}
                        </select>
                    </div>
                `;
            }

            html += `
                </div>
            `;

            if (isPowerUser) {
                // DASHBOARD PARA JEFE DE TIENDA Y GERENTE: Planificación de Instalaciones Programadas
                const today = new Date();
                const nextWeek = new Date();
                nextWeek.setDate(today.getDate() + 7);

                const formatLocalDate = (d) => d.toISOString().split('T')[0];
                const startStr = formatLocalDate(today);
                const endStr = formatLocalDate(nextWeek);

                // Filtrar por semana y tipo "Instalación" / "Reinstalación"
                const weeklyInstalls = filteredOrders.filter(o => {
                    const dateVal = o.fecha || '';
                    const isInstall = ['instalacion', 'reinstalacion'].includes((o.tipotrabajo || '').toLowerCase().trim());
                    return dateVal >= startStr && dateVal <= endStr && isInstall;
                });

                // Distribución de trabajos (por técnico para "Distribución de trabajos")
                const techCounts = {};
                weeklyInstalls.forEach(o => {
                    const t = o.tecnicoasignado || 'Sin asignar';
                    techCounts[t] = (techCounts[t] || 0) + 1;
                });
                const chartData = Object.entries(techCounts).map(([label, value]) => ({ label, value }));

                html += `
                    <div style="background: #e3f2fd; padding:15px; border-radius:8px; margin-bottom:20px; font-size:0.95rem; color:#0d47a1;">
                        📅 <strong>Planificación de Instalaciones de la Semana (Jefatura/Gerencia)</strong><br>
                        Mostrando instalaciones programadas desde hoy hasta el ${endStr}.
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:25px; flex-wrap:wrap;">
                        <div class="orders-table-container">
                            <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Distribución de Trabajos</h3>
                            ${chartData.length > 0 ? UI_TEMPLATES.chart(chartData) : '<p style="color:var(--secondary); font-style:italic;">No hay instalaciones distribuidas esta semana.</p>'}
                        </div>
                        <div class="orders-table-container">
                            <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Estados de Ejecución</h3>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9rem;">
                                <div>⏳ Pendientes: <strong>${weeklyInstalls.filter(o => (o.estado || '').toLowerCase().trim() === 'pendiente').length}</strong></div>
                                <div>🔧 Asignadas: <strong>${weeklyInstalls.filter(o => (o.estado || '').toLowerCase().trim() === 'asignada').length}</strong></div>
                                <div>🚚 En Camino/Llegó: <strong>${weeklyInstalls.filter(o => ['en camino', 'llego'].includes((o.estado || '').toLowerCase().trim())).length}</strong></div>
                                <div>✅ Completadas: <strong>${weeklyInstalls.filter(o => ['finalizada', 'instalacion completada'].includes((o.estado || '').toLowerCase().trim())).length}</strong></div>
                            </div>
                        </div>
                    </div>

                    <div class="orders-table-container">
                        <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Planificación Semanal de Instalaciones</h3>
                        <table class="gos-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Fecha Programada</th>
                                    <th>Hora</th>
                                    <th>Cliente</th>
                                    <th>Vehículo</th>
                                    <th>Prioridad</th>
                                    <th>Estado de Ejecución</th>
                                    <th>Técnico</th>
                                    <th>Sector</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${weeklyInstalls.map(o => `
                                    <tr>
                                        <td><strong>${o.id}</strong></td>
                                        <td>${o.fecha || ''}</td>
                                        <td>${o.hora || ''}</td>
                                        <td>${o.cliente || ''}</td>
                                        <td>${o.marca || ''} ${o.modelo || ''}</td>
                                        <td>${UI_TEMPLATES.priorityBadge(o.prioridad)}</td>
                                        <td>${UI_TEMPLATES.badge(o.estado)}</td>
                                        <td><small>${o.tecnicoasignado || 'Sin asignar'}</small></td>
                                        <td><span class="badge" style="background:#e8f4fd; color:#1a73e8;">${o.sector || ''}</span></td>
                                    </tr>
                                `).join('')}
                                ${weeklyInstalls.length === 0 ? '<tr><td colspan="9" style="text-align:center; color:var(--secondary);">No hay instalaciones planificadas para esta semana.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                // DASHBOARD PARA TÉCNICOS Y OPERATIVOS: Instalaciones asignadas, Trabajos programados, Estado de órdenes
                const activeJobs = filteredOrders.filter(o => {
                    const statusLower = (o.estado || '').toLowerCase().trim();
                    return ['pendiente', 'asignada', 'en camino', 'llego', 'vehiculo recibido', 'iniciando', 'instalando', 'haciendo pruebas', 'instalacion completada', 'finalizada'].includes(statusLower);
                });

                html += `
                    <div class="orders-table-container">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:10px;">
                            <h3 style="margin:0; font-size:1.1rem; color:var(--dark);">Trabajos Programados y Asignaciones - Sector ${activeSector}</h3>
                            <span class="badge" style="background:var(--light); color:var(--secondary); font-size:0.8rem;">Total: ${activeJobs.length}</span>
                        </div>
                `;

                if (activeJobs.length === 0) {
                    html += `<p style="padding:20px; text-align:center; color:var(--secondary); font-size:0.95rem;">No hay trabajos asignados o programados en este sector.</p>`;
                } else {
                    html += `
                        <table class="gos-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Hora</th>
                                    <th>Cliente</th>
                                    <th>Vehículo</th>
                                    <th>Prioridad</th>
                                    <th>Estado de la Orden</th>
                                    <th>Técnico</th>
                                    <th style="min-width: 150px;">Control Operativo</th>
                                    <th>Tickets</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;

                    activeJobs.forEach(o => {
                        const status = o.estado || 'Pendiente';
                        const id = o.id;
                        const time = o.hora || '--:--';
                        const client = o.cliente || 'Sin nombre';
                        const vehicle = `${o.marca || ''} ${o.modelo || ''}`.trim() || 'Desconocido';
                        const priority = o.prioridad || 'Normal';
                        const tech = o.tecnicoasignado || 'Sin asignar';

                        let controlBtn = '';
                        const statusLower = (status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

                        if (statusLower === 'llego') {
                            controlBtn = `<button class="btn btn-sm btn-primary receive-vehicle-btn" data-id="${id}">Recibir Vehículo</button>`;
                        } else if (statusLower === 'vehiculo recibido') {
                            controlBtn = `<button class="btn btn-sm btn-primary" onclick="markStatus('${id}', 'Iniciando')">➡️ Iniciar Trabajo</button>`;
                        } else if (statusLower === 'iniciando') {
                            controlBtn = `<button class="btn btn-sm btn-primary" onclick="markStatus('${id}', 'Instalando')">➡️ Comenzar Instalación</button>`;
                        } else if (statusLower === 'instalando') {
                            controlBtn = `<button class="btn btn-sm btn-primary" onclick="markStatus('${id}', 'Haciendo pruebas')">➡️ Realizar Pruebas</button>`;
                        } else if (statusLower === 'haciendo pruebas') {
                            controlBtn = `<button class="btn btn-sm btn-primary" onclick="markStatus('${id}', 'Instalación completada')">➡️ Completar Instalación</button>`;
                        } else if (statusLower === 'instalacion completada') {
                            controlBtn = `<button class="btn btn-sm btn-success deliver-vehicle-btn" data-id="${id}">🤝 Entregar Vehículo</button>`;
                        } else if (statusLower === 'finalizada') {
                            controlBtn = `<span class="badge" style="background:#d4edda; color:#155724;">✅ Entregado</span>`;
                        } else {
                            controlBtn = `<small style="color:var(--secondary); font-style:italic;">Esperando llegada</small>`;
                        }

                        // Tickets buttons
                        const hasReceived = !['pendiente', 'asignada', 'en camino', 'llego'].includes(statusLower);
                        const isFinalized = statusLower === 'finalizada';

                        const ticketPreBtn = hasReceived
                            ? `<button class="btn btn-sm btn-outline view-ticket-pre-btn" data-id="${id}" title="Ticket Pre-instalación" style="padding: 4px 8px; font-size: 0.8rem;">🎟️ Pre</button>`
                            : `<button class="btn btn-sm btn-outline" disabled title="Falta recepción" style="padding: 4px 8px; font-size: 0.8rem; opacity:0.5;">🎟️ Pre</button>`;

                        const ticketPostBtn = isFinalized
                            ? `<button class="btn btn-sm btn-outline view-ticket-post-btn" data-id="${id}" title="Evidencia Post-instalación" style="padding: 4px 8px; font-size: 0.8rem;">🎟️ Post</button>`
                            : `<button class="btn btn-sm btn-outline" disabled title="No entregado" style="padding: 4px 8px; font-size: 0.8rem; opacity:0.5;">🎟️ Post</button>`;

                        html += `
                            <tr data-id="${id}">
                                <td><strong>${id}</strong></td>
                                <td>${time}</td>
                                <td>${client}</td>
                                <td>${vehicle}</td>
                                <td>${UI_TEMPLATES.priorityBadge(priority)}</td>
                                <td>${UI_TEMPLATES.badge(status)}</td>
                                <td><small>${tech}</small></td>
                                <td>${controlBtn}</td>
                                <td>
                                    <div style="display:flex; gap:5px;">
                                        ${ticketPreBtn}
                                        ${ticketPostBtn}
                                    </div>
                                </td>
                            </tr>
                        `;
                    });

                    html += `
                            </tbody>
                        </table>
                    `;
                }

                html += `</div>`;
            }

            container.innerHTML = html;

            const selector = document.getElementById('sector-selector');
            if (selector) {
                selector.addEventListener('change', (e) => {
                    activeSector = e.target.value;
                    const disp = document.getElementById('sector-display');
                    if (disp) disp.textContent = activeSector;
                    updateDashboard();
                });
            }

            const btns = container.querySelectorAll('.receive-vehicle-btn');
            btns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const orderId = e.target.dataset.id;
                    const order = orders.find(ord => ord.id === orderId);
                    if (order) {
                        renderVehicleReceptionForm(container, order);
                    }
                });
            });

            // Enlazar botones de entrega de vehículo (firma digital)
            const deliverBtns = container.querySelectorAll('.deliver-vehicle-btn');
            deliverBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const orderId = e.currentTarget.dataset.id;
                    const order = orders.find(ord => ord.id === orderId);
                    if (order) {
                        renderPostInstallationForm(container, order);
                    }
                });
            });

            // Enlazar botones para ver Tickets
            const viewPreBtns = container.querySelectorAll('.view-ticket-pre-btn');
            viewPreBtns.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const orderId = e.currentTarget.dataset.id;
                    const order = orders.find(ord => ord.id === orderId);
                    if (order) {
                        renderTicketPreView(container, order);
                    }
                });
            });

            const viewPostBtns = container.querySelectorAll('.view-ticket-post-btn');
            viewPostBtns.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const orderId = e.currentTarget.dataset.id;
                    const order = orders.find(ord => ord.id === orderId);
                    if (order) {
                        renderTicketPostView(container, order);
                    }
                });
            });

        } catch (error) {
            console.error("Error al actualizar dashboard:", error);
            container.innerHTML = `<p style="color:var(--danger); padding:20px;">Error al conectar con el servidor: ${error.message}</p>`;
        }
    };

    await updateDashboard();

    if (dashboardInterval) clearInterval(dashboardInterval);
    dashboardInterval = setInterval(updateDashboard, 30000);
}

/**
 * Renderiza el Formulario Inteligente de Recepción de Vehículos.
 */
function renderVehicleReceptionForm(container, order) {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    const categories = [
        { id: 'vin', label: 'Número de Chasis (VIN)', group: 'Identificación' },
        { id: 'odometro', label: 'Odómetro', group: 'Identificación' },
        { id: 'tablero', label: 'Tablero de Instrumentos', group: 'Identificación' },
        { id: 'asientos_delanteros', label: 'Asientos Delanteros', group: 'Interior' },
        { id: 'asientos_traseros', label: 'Asientos Traseros', group: 'Interior' },
        { id: 'techo_interior', label: 'Techo Interior', group: 'Interior' },
        { id: 'estribos', label: 'Estribos', group: 'Interior' },
        { id: 'lado_izquierdo', label: 'Lado Izquierdo', group: 'Exterior' },
        { id: 'vista_frontal', label: 'Vista Frontal', group: 'Exterior' },
        { id: 'lado_derecho', label: 'Lado Derecho', group: 'Exterior' },
        { id: 'vista_trasera', label: 'Vista Trasera', group: 'Exterior' }
    ];

    const photosData = {}; // Guardará base64 o metadatos de cada foto
    const damagesData = {}; // Guardará los daños por cada categoría
    const qualityData = {}; // Guardará el resultado del quality check por cada categoría

    categories.forEach(cat => {
        photosData[cat.id] = null;
        damagesData[cat.id] = [];
        qualityData[cat.id] = { valid: false, brightness: 0, contrast: 0 };
    });

    let html = `
        <div class="reception-container">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--light); padding-bottom:15px; margin-bottom:25px;">
                <h2 style="margin:0; color:var(--primary);">Módulo de Recepción de Vehículo</h2>
                <button class="btn btn-secondary" id="back-to-dash-btn" style="padding: 8px 15px; font-size:0.9rem;">Volver al Dashboard</button>
            </div>

            <!-- Información del Cliente y Orden (Validación Visual) -->
            <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Información del Cliente y Orden #${order.id}</legend>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Cliente:</label>
                        <input type="text" class="form-control" value="${order.cliente || ''}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Contacto:</label>
                        <input type="text" class="form-control" value="${order.contacto || ''}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Teléfono:</label>
                        <input type="text" class="form-control" value="${order.telefono || ''}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Ubicación Programada (Instalación):</label>
                        <input type="text" class="form-control" value="${order.direccion || ''} (${order.coordenadas || ''})" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Servicio Contratado:</label>
                        <input type="text" class="form-control" value="${order.servicio || 'Servicio Estándar'}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label>Vendedor Responsable:</label>
                        <input type="text" class="form-control" value="${order.vendedor || 'Carlos Ruiz'}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label>Observaciones de la Orden:</label>
                        <textarea class="form-control" readonly style="background:#eee; height: 50px;">${order.observaciones || 'Ninguna observacion'}</textarea>
                    </div>
                </div>
                <div style="margin-top: 15px; background: #e8f4fd; padding: 10px 15px; border-radius: 6px; font-size: 0.85rem; color: #31708f;">
                    💡 El técnico debe validar visualmente estos datos antes de continuar con la recepción del vehículo.
                </div>
            </fieldset>

            <!-- Información del Vehículo (Campos Inteligentes y Autocompletado) -->
            <form id="vehicle-reception-form">
                <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                    <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Información del Vehículo</legend>
                    <div class="form-grid">
                        <div class="form-group autocomplete-wrapper">
                            <label>Marca:</label>
                            <input type="text" id="vehiculo-marca" name="marca" class="form-control" value="${order.marca || ''}" required placeholder="Ej: Toyota">
                            <div id="suggestions-marca" class="autocomplete-suggestions" style="display:none;"></div>
                        </div>
                        <div class="form-group autocomplete-wrapper">
                            <label>Modelo:</label>
                            <input type="text" id="vehiculo-modelo" name="modelo" class="form-control" value="${order.modelo || ''}" required placeholder="Ej: Hilux">
                            <div id="suggestions-modelo" class="autocomplete-suggestions" style="display:none;"></div>
                        </div>
                        <div class="form-group">
                            <label>Año:</label>
                            <input type="number" name="anio" class="form-control" value="${order.anio || ''}" required placeholder="Ej: 2022">
                        </div>
                        <div class="form-group">
                            <label>Color:</label>
                            <input type="text" name="color" class="form-control" value="${order.color || ''}" required placeholder="Ej: Gris Metálico">
                        </div>
                        <div class="form-group">
                            <label>Placa:</label>
                            <input type="text" name="placa" class="form-control" value="${order.placa || ''}" required placeholder="Ej: HAD-1234">
                        </div>
                        <div class="form-group">
                            <label>Número de Chasis (VIN):</label>
                            <input type="text" name="vin" class="form-control" value="${order.vin || ''}" required placeholder="Ej: 17 dígitos">
                        </div>
                        <div class="form-group">
                            <label>Número de Motor:</label>
                            <input type="text" name="motor" class="form-control" value="${order.motor || ''}" placeholder="Ej: 1KD-FTV">
                        </div>
                    </div>
                </fieldset>

                <!-- Validación Fotográfica Obligatoria -->
                <h3 style="border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px; color: var(--primary);">Validación Fotográfica Obligatoria (11 Categorías)</h3>
                <p style="font-size:0.9rem; color:var(--secondary);">Suba o capture fotografías para cada área. Haga clic sobre la imagen cargada para registrar daños existentes.</p>

                <div class="photo-checklist">
                    ${categories.map(cat => `
                        <div class="photo-card" id="card-${cat.id}">
                            <div>
                                <span class="badge" style="background:#5bc0de; color:white; font-size:0.7rem; float:right;">${cat.group}</span>
                                <h4>${cat.label}</h4>
                            </div>

                            <div class="canvas-wrapper" id="wrapper-${cat.id}" style="display:none;">
                                <canvas id="canvas-${cat.id}"></canvas>
                            </div>

                            <div style="margin: 15px 0;">
                                <label class="input-file-label" id="label-${cat.id}">
                                    📷 Capturar/Cargar Foto
                                    <input type="file" id="file-${cat.id}" accept="image/*" style="display:none;">
                                </label>
                            </div>

                            <!-- Indicadores de Calidad -->
                            <div class="quality-checklist" id="quality-${cat.id}" style="display:none;">
                                <div class="quality-item">
                                    <span>Nitidez:</span>
                                    <span class="quality-status" id="quality-nitidez-${cat.id}">--</span>
                                </div>
                                <div class="quality-item">
                                    <span>Iluminación:</span>
                                    <span class="quality-status" id="quality-luz-${cat.id}">--</span>
                                </div>
                                <div class="quality-item">
                                    <span>Encuadre:</span>
                                    <span class="quality-status" id="quality-encuadre-${cat.id}">OK</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div style="margin-top:35px; border-top:2px solid var(--light); padding-top:20px; display:flex; gap:15px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" id="cancel-reception-btn">Cancelar Recepción</button>
                    <button type="submit" class="btn btn-primary">Registrar Vehículo y Comenzar</button>
                </div>
            </form>
        </div>
    `;

    container.innerHTML = html;

    const backToDash = () => {
        loadSection('dashboard');
    };
    document.getElementById('back-to-dash-btn').onclick = backToDash;
    document.getElementById('cancel-reception-btn').onclick = backToDash;

    setupRealtimeAutocomplete();

    categories.forEach(cat => {
        const fileInput = document.getElementById(`file-${cat.id}`);
        const canvas = document.getElementById(`canvas-${cat.id}`);
        const wrapper = document.getElementById(`wrapper-${cat.id}`);
        const label = document.getElementById(`label-${cat.id}`);
        const qualityDiv = document.getElementById(`quality-${cat.id}`);

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const maxDim = 400;
                    let width = img.width;
                    let height = img.height;
                    if (width > height) {
                        if (width > maxDim) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        }
                    } else {
                        if (height > maxDim) {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const imgData = ctx.getImageData(0, 0, width, height);
                    const pixels = imgData.data;

                    let totalBrightness = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        totalBrightness += (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
                    }
                    const avgBrightness = totalBrightness / (pixels.length / 4);

                    let totalDev = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        const val = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
                        totalDev += Math.abs(val - avgBrightness);
                    }
                    const avgContrast = totalDev / (pixels.length / 4);

                    const isLuzOk = avgBrightness >= 40 && avgBrightness <= 240;
                    const isNitidezOk = avgContrast >= 15;
                    const isValid = isLuzOk && isNitidezOk;

                    qualityDiv.style.display = 'block';
                    wrapper.style.display = 'inline-block';
                    label.innerHTML = '🔄 Re-capturar Foto';

                    const nitidezEl = document.getElementById(`quality-nitidez-${cat.id}`);
                    const luzEl = document.getElementById(`quality-luz-${cat.id}`);

                    if (isNitidezOk) {
                        nitidezEl.textContent = 'OK';
                        nitidezEl.className = 'quality-status ok';
                    } else {
                        nitidezEl.textContent = 'Rechazado';
                        nitidezEl.className = 'quality-status fail';
                    }

                    if (isLuzOk) {
                        luzEl.textContent = 'OK';
                        luzEl.className = 'quality-status ok';
                    } else {
                        luzEl.textContent = 'Oscura';
                        luzEl.className = 'quality-status fail';
                    }

                    qualityData[cat.id] = { valid: isValid, brightness: avgBrightness, contrast: avgContrast };

                    if (isValid) {
                        document.getElementById(`card-${cat.id}`).className = 'photo-card completed';
                        photosData[cat.id] = canvas.toDataURL('image/jpeg', 0.8);
                    } else {
                        document.getElementById(`card-${cat.id}`).className = 'photo-card';
                        photosData[cat.id] = null;
                        alert(`La imagen para "${cat.label}" no cumple con la calidad mínima requerida (iluminación o nitidez). Por favor tome otra foto con mejor iluminación y enfoque.`);
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        wrapper.addEventListener('click', (e) => {
            if (!photosData[cat.id]) {
                alert("Primero debe cargar una foto válida antes de registrar anomalías.");
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            const damageTypes = [
                'Rayón', 'Golpe', 'Abolladura', 'Daño de pintura',
                'Pieza fracturada', 'Pieza faltante', 'Cristal fracturado',
                'Accesorio dañado', 'Observación relevante'
            ];

            const selectOptions = damageTypes.map(t => `<option value="${t}">${t}</option>`).join('');

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-content" style="max-width:350px;">
                    <h3>Registrar Daño Existente</h3>
                    <div class="form-group">
                        <label>Tipo de Anomalía:</label>
                        <select id="damage-type" class="form-control">
                            ${selectOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Observación Adicional (Opcional):</label>
                        <input type="text" id="damage-obs" class="form-control" placeholder="Detalle adicional">
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="damage-cancel" style="padding: 5px 10px;">Cancelar</button>
                        <button class="btn btn-primary" id="damage-save" style="padding: 5px 15px;">Guardar Pin</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.querySelector('#damage-cancel').onclick = () => {
                document.body.removeChild(overlay);
            };

            overlay.querySelector('#damage-save').onclick = () => {
                const type = overlay.querySelector('#damage-type').value;
                const obs = overlay.querySelector('#damage-obs').value;
                const note = obs ? `${type} - ${obs}` : type;

                const damageEntry = { x, y, note, type };
                damagesData[cat.id].push(damageEntry);

                addPinToWrapper(wrapper, x, y, damageEntry, cat.id, damagesData[cat.id].length - 1);

                document.body.removeChild(overlay);
            };
        });
    });

    function setupRealtimeAutocomplete() {
        const marcasList = ['Toyota', 'Nissan', 'Hyundai', 'Honda', 'Mazda', 'Ford', 'Chevrolet', 'Mercedes', 'BMW', 'Suzuki', 'Kia', 'Mitsubishi'];
        const modelosList = {
            'Toyota': ['Hilux', 'Corolla', 'Yaris', 'RAV4', 'Land Cruiser', 'Prado'],
            'Nissan': ['Frontier', 'Sentra', 'Versa', 'Kicks', 'Qashqai', 'Pathfinder'],
            'Hyundai': ['Elantra', 'Tucson', 'Santa Fe', 'Accent', 'Grand i10'],
            'Honda': ['Civic', 'CR-V', 'Accord', 'HR-V', 'Fit'],
            'Mazda': ['BT-50', 'Mazda 3', 'CX-5', 'CX-30', 'Mazda 2']
        };

        const marcaInput = document.getElementById('vehiculo-marca');
        const modeloInput = document.getElementById('vehiculo-modelo');
        const suggestionsMarca = document.getElementById('suggestions-marca');
        const suggestionsModelo = document.getElementById('suggestions-modelo');

        marcaInput.addEventListener('input', () => {
            const val = marcaInput.value.trim().toLowerCase();
            suggestionsMarca.innerHTML = '';
            if (!val) {
                suggestionsMarca.style.display = 'none';
                return;
            }

            const matches = marcasList.filter(m => m.toLowerCase().includes(val));
            if (matches.length > 0) {
                suggestionsMarca.style.display = 'block';
                matches.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = m;
                    div.onclick = () => {
                        marcaInput.value = m;
                        suggestionsMarca.style.display = 'none';
                    };
                    suggestionsMarca.appendChild(div);
                });
            } else {
                suggestionsMarca.style.display = 'none';
            }
        });

        modeloInput.addEventListener('input', () => {
            const val = modeloInput.value.trim().toLowerCase();
            const brand = marcaInput.value.trim();
            suggestionsModelo.innerHTML = '';
            if (!val) {
                suggestionsModelo.style.display = 'none';
                return;
            }

            const activeModels = modelosList[brand] || Object.values(modelosList).flat();
            const matches = activeModels.filter(m => m.toLowerCase().includes(val));
            if (matches.length > 0) {
                suggestionsModelo.style.display = 'block';
                matches.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = m;
                    div.onclick = () => {
                        modeloInput.value = m;
                        suggestionsModelo.style.display = 'none';
                    };
                    suggestionsModelo.appendChild(div);
                });
            } else {
                suggestionsModelo.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== marcaInput) suggestionsMarca.style.display = 'none';
            if (e.target !== modeloInput) suggestionsModelo.style.display = 'none';
        });
    }

    function addPinToWrapper(wrapper, x, y, damage, catId, idx) {
        const pin = document.createElement('div');
        pin.className = 'damage-pin';
        pin.style.left = `${x}%`;
        pin.style.top = `${y}%`;

        const letter = damage.type ? damage.type.charAt(0).toUpperCase() : 'X';
        pin.innerHTML = `
            ${letter}
            <div class="tooltip">${damage.note} <small style="display:block; opacity:0.7;">Haga clic para remover</small></div>
        `;

        pin.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`¿Desea eliminar la anomalía "${damage.note}" registrada en esta posición?`)) {
                damagesData[catId].splice(idx, 1);
                wrapper.removeChild(pin);
            }
        });

        wrapper.appendChild(pin);
    }

    document.getElementById('vehicle-reception-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const missingPhotos = categories.filter(cat => !photosData[cat.id]);
        if (missingPhotos.length > 0) {
            alert(`Para registrar el vehículo debe cargar las fotografías obligatorias restantes:\n\n${missingPhotos.map(p => `- ${p.label}`).join('\n')}`);
            return;
        }

        const formData = new FormData(e.target);
        const vehiculoInfo = Object.fromEntries(formData.entries());

        const user = AppState.user;
        const payload = {
            orderId: order.id,
            tecnico: user.Nombre_Completo || user.Nombre_Usuario,
            sector: user.Sector || 'San Pedro Sula',
            clienteInfo: {
                nombre: order.cliente || '',
                contacto: order.contacto || '',
                telefono: order.telefono || '',
                direccion: order.direccion || ''
            },
            vehiculoInfo: vehiculoInfo,
            fotos: photosData,
            danos: damagesData,
            calidadCheck: qualityData
        };

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Registrando Recepción...';

        try {
            const result = await routeAction('GOS_CORE', 'saveVehicleReception', payload);
            if (result.status === 'success') {
                alert(`¡Vehículo Recibido con Éxito!\nRegistro de Recepción: ${result.id}\nSe ha actualizado el estado de la Orden a 'Vehículo recibido'.\nA continuación se presentará el comprobante digital de recepción.`);
                renderDigitalReceipt(container, order, vehiculoInfo, damagesData, result.id);
            } else {
                alert(`Error al registrar vehículo: ${result.message}`);
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Registrar Vehículo y Comenzar';
            }
        } catch (error) {
            alert(`Error de red o conexión: ${error.message}`);
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Registrar Vehículo y Comenzar';
        }
    });
}

/**
 * Renderiza el Comprobante Digital de Recepción del Vehículo con el Código QR de Consulta.
 */
function renderDigitalReceipt(container, order, vehiculoInfo, damages, receptionId) {
    const user = AppState.user;
    const dateStr = new Date().toLocaleString();

    const secureToken = order.token || 'tok_' + order.id;
    const portalUrl = `${window.location.origin}/portal.html?ot=${order.id}&token=${secureToken}`;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(portalUrl)}`;

    let damagesHtml = '';
    let hasDamages = false;

    Object.entries(damages).forEach(([catId, list]) => {
        if (list && list.length > 0) {
            hasDamages = true;
            const catLabel = catId.toUpperCase().replace('_', ' ');
            damagesHtml += `
                <div style="margin-bottom:10px;">
                    <strong>${catLabel}:</strong>
                    <ul style="margin:5px 0 0 15px; padding:0; font-size:0.85rem;">
                        ${list.map(d => `<li>📍 Posición: (${Math.round(d.x)}%, ${Math.round(d.y)}%) - ${d.note}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
    });

    if (!hasDamages) {
        damagesHtml = '<p style="color:var(--success); margin:0; font-style:italic;">No se registraron daños ni anomalías físicas previas en el vehículo.</p>';
    }

    let html = `
        <div class="receipt-container">
            <div class="receipt-header">
                <span style="font-size:3rem; color:var(--success);">✔️</span>
                <h2>Comprobante de Recepción Digital</h2>
                <p style="margin:5px 0; color:var(--secondary); font-size:0.95rem;">GOS - GPS Operations Suite</p>
                <span class="badge badge-finalizada" style="font-size:0.8rem; padding: 5px 12px;">REGISTRO: ${receptionId}</span>
            </div>

            <!-- Botones de Acción -->
            <div class="actions-bar" style="display:flex; justify-content:space-between; margin-bottom:30px; flex-wrap:wrap; gap:10px;">
                <button class="btn btn-secondary" id="receipt-back-btn">⬅️ Volver al Dashboard</button>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary" id="receipt-print-btn">🖨️ Imprimir</button>
                    <button class="btn btn-secondary" id="receipt-download-btn">📥 Descargar</button>
                    <button class="btn btn-secondary" id="receipt-share-btn">🔗 Compartir</button>
                </div>
            </div>

            <!-- Datos de la Recepción -->
            <div class="receipt-section">
                <h4>Información de la Recepción</h4>
                <div class="receipt-grid">
                    <div class="receipt-item"><strong>ID Recepción:</strong> ${receptionId}</div>
                    <div class="receipt-item"><strong>Orden de Trabajo:</strong> ${order.id}</div>
                    <div class="receipt-item"><strong>Fecha y Hora:</strong> ${dateStr}</div>
                    <div class="receipt-item"><strong>Técnico Responsable:</strong> ${user.Nombre_Completo || user.Nombre_Usuario}</div>
                    <div class="receipt-item"><strong>Sector Operativo:</strong> ${user.Sector || 'San Pedro Sula'}</div>
                    <div class="receipt-item"><strong>Vendedor Responsable:</strong> ${order.vendedor || 'Carlos Ruiz'}</div>
                </div>
            </div>

            <!-- Datos del Cliente -->
            <div class="receipt-section">
                <h4>Información del Cliente</h4>
                <div class="receipt-grid">
                    <div class="receipt-item"><strong>Cliente:</strong> ${order.cliente || ''}</div>
                    <div class="receipt-item"><strong>Contacto:</strong> ${order.contacto || ''}</div>
                    <div class="receipt-item"><strong>Teléfono:</strong> ${order.telefono || ''}</div>
                    <div class="receipt-item"><strong>Ubicación Programada:</strong> ${order.direccion || ''}</div>
                </div>
            </div>

            <!-- Datos del Vehículo -->
            <div class="receipt-section">
                <h4>Información del Vehículo</h4>
                <div class="receipt-grid">
                    <div class="receipt-item"><strong>Marca:</strong> ${vehiculoInfo.marca}</div>
                    <div class="receipt-item"><strong>Modelo:</strong> ${vehiculoInfo.modelo}</div>
                    <div class="receipt-item"><strong>Año:</strong> ${vehiculoInfo.anio}</div>
                    <div class="receipt-item"><strong>Color:</strong> ${vehiculoInfo.color}</div>
                    <div class="receipt-item"><strong>Placa:</strong> ${vehiculoInfo.placa}</div>
                    <div class="receipt-item"><strong>VIN/Chasis:</strong> ${vehiculoInfo.vin}</div>
                    <div class="receipt-item"><strong>Número Motor:</strong> ${vehiculoInfo.motor || 'N/A'}</div>
                </div>
            </div>

            <!-- Registro de Daños Existentes -->
            <div class="receipt-section">
                <h4>Registro de Daños Existentes (Estado Físico Previo)</h4>
                <div class="receipt-damage-list">
                    ${damagesHtml}
                </div>
            </div>

            <!-- Código QR único de Consulta para el Cliente -->
            <div class="qr-code-section">
                <div class="qr-code-container">
                    <img src="${qrCodeUrl}" alt="Código QR de Consulta Seguro" style="width:150px; height:150px; display:block;">
                </div>
                <h4 style="margin:5px 0; color:var(--dark); font-size:0.95rem;">Código QR de Consulta Seguro</h4>
                <p style="margin:0; font-size:0.8rem; color:var(--secondary); max-width:300px;">
                    Escanee este código QR para acceder en tiempo real al estado de su orden, instalador asignado y evidencias registradas.
                </p>
                <p style="margin-top:5px; font-size:0.75rem;"><a href="${portalUrl}" target="_blank" style="color:var(--primary); word-break:break-all;">${portalUrl}</a></p>
            </div>
        </div>
    `;

    container.innerHTML = html;

    document.getElementById('receipt-back-btn').onclick = () => {
        loadSection('dashboard');
    };

    document.getElementById('receipt-print-btn').onclick = () => {
        window.print();
    };

    document.getElementById('receipt-download-btn').onclick = () => {
        const textContent = `
GOS - COMPROBANTE DE RECEPCION DIGITAL
======================================
ID Recepcion: ${receptionId}
Orden de Trabajo: ${order.id}
Fecha/Hora: ${dateStr}
Tecnico: ${user.Nombre_Completo || user.Nombre_Usuario}
Sector: ${user.Sector || 'San Pedro Sula'}

CLIENTE:
--------
Nombre: ${order.cliente}
Contacto: ${order.contacto}
Telefono: ${order.telefono}

VEHICULO:
---------
Marca: ${vehiculoInfo.marca}
Modelo: ${vehiculoInfo.modelo}
Anio: ${vehiculoInfo.anio}
Color: ${vehiculoInfo.color}
Placa: ${vehiculoInfo.placa}
VIN: ${vehiculoInfo.vin}
Motor: ${vehiculoInfo.motor || 'N/A'}

Portal de consulta del cliente:
${portalUrl}
        `.trim();

        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `GOS_Comprobante_${order.id}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    document.getElementById('receipt-share-btn').onclick = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(portalUrl).then(() => {
                alert("¡Enlace del Portal de Clientes copiado al portapapeles!");
            }).catch(err => {
                alert("Error al copiar enlace: " + err);
            });
        } else {
            alert("Su navegador no soporta el portapapeles. Copie el enlace manualmente:\\n\\n" + portalUrl);
        }
    };
}

/**
 * Renderiza las métricas administrativas de acceso restringido.
 */
async function renderAdminMetricsModule(container) {
    const user = AppState.user;
    if (!user) {
        container.innerHTML = '<p>Por favor inicie sesión para ver esta información.</p>';
        return;
    }

    try {
        container.innerHTML = '<p>Cargando métricas administrativas...</p>';
        const result = await routeAction('GOS_CORE', 'getOrders');
        if (result.status !== 'success') {
            container.innerHTML = `<p class="error-msg">Error al cargar datos: ${result.message}</p>`;
            return;
        }

        const orders = result.data;

        // Calcular Métricas Globales/Administrativas
        const totalPending = orders.filter(o => ['pendiente', 'asignada'].includes((o.estado || '').toLowerCase().trim())).length;

        const todayStr = new Date().toISOString().split('T')[0];
        const totalAssignedToday = orders.filter(o => {
            const dateMatch = o.fecha === todayStr;
            const statusMatch = ['asignada', 'en camino', 'llego', 'vehiculo recibido', 'iniciando', 'instalando', 'haciendo pruebas', 'instalacion completada'].includes((o.estado || '').toLowerCase().trim());
            return dateMatch && statusMatch;
        }).length;

        const totalReceived = orders.filter(o => (o.estado || '').toLowerCase().trim() === 'vehiculo recibido').length;
        const totalFinished = orders.filter(o => (o.estado || '').toLowerCase().trim() === 'finalizada').length;

        // Calcular distribución para gráficos
        const techCounts = {};
        orders.forEach(o => {
            if (o.tecnicoasignado && o.tecnicoasignado !== 'Sin asignar') {
                techCounts[o.tecnicoasignado] = (techCounts[o.tecnicoasignado] || 0) + 1;
            }
        });
        const chartData = Object.entries(techCounts).map(([label, value]) => ({ label, value }));

        container.innerHTML = `
            <div style="background: #eef2f7; padding:15px; border-radius:8px; margin-bottom:20px; font-size:0.95rem; color:#495057;">
                📊 <strong>Panel de Control Administrativo (Restringido)</strong><br>
                Este módulo consolidado contiene métricas de supervisión operativa y flujo general de toda la operación.
            </div>

            <!-- Métricas Consolidadas -->
            <div class="dashboard-grid">
                <div class="dashboard-card pending">
                    <h3>Trabajos Pendientes Generales</h3>
                    <div class="value">${totalPending}</div>
                </div>
                <div class="dashboard-card assigned">
                    <h3>Trabajos Asignados Hoy</h3>
                    <div class="value">${totalAssignedToday}</div>
                </div>
                <div class="dashboard-card received">
                    <h3>Vehículos Recibidos</h3>
                    <div class="value">${totalReceived}</div>
                </div>
                <div class="dashboard-card finished">
                    <h3>Trabajos Finalizados Globales</h3>
                    <div class="value">${totalFinished}</div>
                </div>
            </div>

            <div style="margin-top:30px; display:grid; grid-template-columns: 1fr 1fr; gap:20px; flex-wrap:wrap;">
                <div class="orders-table-container" style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd;">
                    <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Distribución por Técnico</h3>
                    ${chartData.length > 0 ? UI_TEMPLATES.chart(chartData) : '<p style="color:var(--secondary); font-style:italic;">No hay asignaciones registradas hoy.</p>'}
                </div>
                <div class="orders-table-container" style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd;">
                    <h3 style="margin-top:0; margin-bottom:15px; border-bottom:2px solid var(--light); padding-bottom:8px; color:var(--dark);">Resumen Operativo</h3>
                    <p style="font-size:0.9rem; line-height:1.6; color:#495057;">
                        - El <strong>Tiempo Promedio de Instalación</strong> de la semana se mantiene en el rango esperado.<br>
                        - Los sectores activos están procesando solicitudes con normalidad.<br>
                        - Puede exportar un reporte detallado en la sección de <strong>Reportes</strong>.
                    </p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error en renderAdminMetricsModule:", error);
        container.innerHTML = `<p style="color:var(--danger); padding:20px;">Error al conectar con el servidor: ${error.message}</p>`;
    }
}

/**
 * Inicializador de lienzo de firma digital con soporte touch y mouse.
 */
function initSignatureCanvas(canvasId, clearBtnId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';

    const getMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const getTouchPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        return {
            x: (touch.clientX - rect.left) * (canvas.width / rect.width),
            y: (touch.clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    canvas.addEventListener('mousedown', (e) => {
        drawing = true;
        const pos = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!drawing) return;
        const pos = getMousePos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => drawing = false);
    canvas.addEventListener('mouseleave', () => drawing = false);

    canvas.addEventListener('touchstart', (e) => {
        drawing = true;
        const pos = getTouchPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (!drawing) return;
        const pos = getTouchPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', () => drawing = false);

    const clearBtn = document.getElementById(clearBtnId);
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }

    return {
        isEmpty() {
            const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
            return !buffer.some(color => color !== 0);
        },
        getDataUrl() {
            return canvas.toDataURL('image/png');
        }
    };
}

/**
 * Renderiza el Formulario de Entrega Post-instalación con Firma Digital.
 */
function renderPostInstallationForm(container, order) {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    const secureToken = order.token || 'tok_' + order.id;

    container.innerHTML = `
        <div class="reception-container">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--light); padding-bottom:15px; margin-bottom:25px;">
                <h2 style="margin:0; color:var(--success);">Módulo de Entrega de Vehículo (Post-instalación)</h2>
                <button class="btn btn-secondary" id="back-to-dash-btn-post" style="padding: 8px 15px; font-size:0.9rem;">Volver al Dashboard</button>
            </div>

            <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Detalles de la Orden #${order.id}</legend>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Cliente:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.cliente || 'Sin nombre'}</p>
                    </div>
                    <div class="form-group">
                        <label>Vehículo:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.marca || ''} ${order.modelo || ''} (${order.anio || ''})</p>
                    </div>
                    <div class="form-group">
                        <label>Placa / Color:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.placa || ''} / ${order.color || 'No especificado'}</p>
                    </div>
                    <div class="form-group">
                        <label>Servicio Realizado:</label>
                        <p style="margin:5px 0; font-weight:bold; color:var(--dark);">${order.servicio || 'Instalación Estándar'}</p>
                    </div>
                </div>
            </fieldset>

            <form id="delivery-confirmation-form">
                <fieldset style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 25px;">
                    <legend style="font-weight:bold; padding: 0 10px; color: var(--secondary);">Confirmación de Entrega y Firma del Cliente</legend>

                    <div class="form-group" style="margin-bottom:20px;">
                        <label style="display:flex; align-items:center; font-weight:bold; gap:10px; cursor:pointer; color:var(--dark);">
                            <input type="checkbox" id="delivery-confirm-check" required style="width:20px; height:20px;">
                            <span>Confirmar entrega del vehículo al cliente en perfectas condiciones y con servicio verificado de GPS.</span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:bold; color:var(--dark);">Firma Digital del Cliente:</label>
                        <p style="margin:2px 0 10px 0; font-size:0.8rem; color:var(--secondary);">Dibuje la firma dentro del recuadro punteado:</p>
                        <div class="signature-wrapper">
                            <canvas id="signature-pad" class="signature-canvas" width="450" height="180"></canvas>
                        </div>
                        <div class="signature-actions">
                            <button class="btn btn-secondary btn-sm" id="clear-sig-btn">🔄 Limpiar Firma</button>
                        </div>
                    </div>
                </fieldset>

                <div style="display:flex; gap:15px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" id="cancel-delivery-btn">Cancelar</button>
                    <button type="submit" class="btn btn-success" id="submit-delivery-btn">🤝 Registrar Entrega y Finalizar</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('back-to-dash-btn-post').onclick = () => loadSection('dashboard');
    document.getElementById('cancel-delivery-btn').onclick = () => loadSection('dashboard');

    const pad = initSignatureCanvas('signature-pad', 'clear-sig-btn');

    document.getElementById('delivery-confirmation-form').onsubmit = async (e) => {
        e.preventDefault();

        if (pad.isEmpty()) {
            alert("Por favor solicite al cliente registrar su firma digital antes de guardar.");
            return;
        }

        const signatureBase64 = pad.getDataUrl();
        const submitBtn = document.getElementById('submit-delivery-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Guardando entrega...';

        try {
            const result = await routeAction('GOS_CORE', 'updateOrderStatus', {
                orderId: order.id,
                status: 'Finalizada',
                firmaDigital: signatureBase64,
                fechaInstalacion: new Date().toISOString().split('T')[0]
            });

            if (result.status === 'success') {
                alert(`¡Entrega de Vehículo Registrada con Éxito!\nLa orden #${order.id} se ha cerrado correctamente.`);
                loadSection('dashboard');
            } else {
                alert(`Error al guardar entrega: ${result.message}`);
                submitBtn.disabled = false;
                submitBtn.innerHTML = '🤝 Registrar Entrega y Finalizar';
            }
        } catch (error) {
            alert(`Error de red o conexión: ${error.message}`);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🤝 Registrar Entrega y Finalizar';
        }
    };
}

/**
 * Renderiza el Ticket Pre-instalación (Recepción).
 */
async function renderTicketPreView(container, order) {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    container.innerHTML = '<p>Cargando datos del ticket de recepción...</p>';

    try {
        const secureToken = order.token || 'tok_' + order.id;
        const result = await routeAction('GOS_CORE', 'getClientPortalData', { ot: order.id, token: secureToken });

        if (result.status !== 'success') {
            container.innerHTML = `<p class="error-msg">Error al cargar ticket: ${result.message}</p>`;
            return;
        }

        const data = result.data;
        const v = data.vehiculo;
        const serv = data.servicio;
        const damages = data.danos || {};

        let damagesHtml = '';
        let hasDamages = false;

        Object.entries(damages).forEach(([catId, list]) => {
            if (list && list.length > 0) {
                hasDamages = true;
                const catLabel = catId.toUpperCase().replace('_', ' ');
                damagesHtml += `
                    <div style="margin-bottom:8px;">
                        <strong>${catLabel}:</strong>
                        <ul style="margin:3px 0 0 15px; padding:0; font-size:0.85rem;">
                            ${list.map(d => `<li>📍 Posición: (${Math.round(d.x)}%, ${Math.round(d.y)}%) - ${d.note}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        });

        if (!hasDamages) {
            damagesHtml = '<p style="color:var(--success); margin:0; font-style:italic;">No se registraron anomalías físicas previas en el vehículo.</p>';
        }

        const portalUrl = `${window.location.origin}/portal.html?ot=${order.id}&token=${secureToken}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(portalUrl)}`;

        container.innerHTML = `
            <div class="receipt-container">
                <div class="receipt-header" style="border-bottom: 3px double var(--secondary); padding-bottom:15px; margin-bottom:20px;">
                    <h2 style="margin:0; color:var(--primary);">TICKET DE RECEPCIÓN VEHICULAR</h2>
                    <p style="margin:5px 0; font-size:0.9rem; color:var(--secondary);">GOS - GPS Operations Suite | Pre-instalación</p>
                    <span class="badge badge-en camino" style="font-size:0.85rem; padding: 4px 10px;">RECEPCIÓN PREVIA</span>
                </div>

                <div class="actions-bar" style="display:flex; justify-content:space-between; margin-bottom:25px; flex-wrap:wrap; gap:10px;">
                    <button class="btn btn-secondary" id="ticket-back-btn">⬅️ Volver</button>
                    <button class="btn btn-primary" id="ticket-print-btn">🖨️ Imprimir Ticket</button>
                </div>

                <div class="receipt-section">
                    <h4>Datos Generales de la Orden</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Orden de Trabajo:</strong> ${order.id}</div>
                        <div class="receipt-item"><strong>Fecha de Entrada:</strong> ${serv.fechaRecepcion}</div>
                        <div class="receipt-item"><strong>Lugar de Ejecución:</strong> ${serv.lugar}</div>
                        <div class="receipt-item"><strong>Instalador Responsable:</strong> ${data.instalador.nombre} ${data.instalador.apellido}</div>
                        <div class="receipt-item"><strong>Vendedor:</strong> ${data.vendedor.nombre} ${data.vendedor.apellido}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Información del Cliente</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Cliente:</strong> ${order.cliente || 'No especificado'}</div>
                        <div class="receipt-item"><strong>Contacto:</strong> ${order.contacto || ''}</div>
                        <div class="receipt-item"><strong>Teléfono:</strong> ${order.telefono || ''}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Ficha del Vehículo</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Marca:</strong> ${v.marca}</div>
                        <div class="receipt-item"><strong>Modelo:</strong> ${v.modelo}</div>
                        <div class="receipt-item"><strong>Año:</strong> ${v.anio}</div>
                        <div class="receipt-item"><strong>Color:</strong> ${v.color}</div>
                        <div class="receipt-item"><strong>Placa:</strong> ${v.placa}</div>
                        <div class="receipt-item"><strong>VIN/Chasis:</strong> ${v.vin || ''}</div>
                        <div class="receipt-item"><strong>Clasificación:</strong> ${v.clasificacionVehiculo || 'No especificada'}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Inventario de Daños Registrados</h4>
                    <div class="receipt-damage-list" style="background:#fdfdfe; border:1px solid #ddd; padding:12px; border-radius:6px;">
                        ${damagesHtml}
                    </div>
                </div>

                <div class="qr-code-section" style="text-align:center; margin-top:30px; border-top: 1px dashed #ccc; padding-top:20px;">
                    <img src="${qrCodeUrl}" alt="QR" style="width:140px; height:140px; margin-bottom:5px;">
                    <p style="margin:5px 0 0 0; font-size:0.8rem; font-weight:bold; color:var(--dark);">Código QR de Consulta Seguro</p>
                    <p style="margin:0 auto; font-size:0.75rem; color:var(--secondary); max-width:320px;">
                        Escanee para consultar en línea el estado de avance, las fotografías y anotaciones de su vehículo.
                    </p>
                </div>
            </div>
        `;

        document.getElementById('ticket-back-btn').onclick = () => loadSection('dashboard');
        document.getElementById('ticket-print-btn').onclick = () => window.print();

    } catch (e) {
        container.innerHTML = `<p class="error-msg">Error al conectar con el servidor: ${e.message}</p>`;
    }
}

/**
 * Renderiza la Evidencia Post-instalación (Firma de Entrega).
 */
async function renderTicketPostView(container, order) {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    container.innerHTML = '<p>Cargando datos de la evidencia de entrega...</p>';

    try {
        const secureToken = order.token || 'tok_' + order.id;
        const result = await routeAction('GOS_CORE', 'getClientPortalData', { ot: order.id, token: secureToken });

        if (result.status !== 'success') {
            container.innerHTML = `<p class="error-msg">Error al cargar evidencia: ${result.message}</p>`;
            return;
        }

        const data = result.data;
        const v = data.vehiculo;
        const serv = data.servicio;
        const damages = data.danos || {};

        let damagesHtml = '';
        let hasDamages = false;

        Object.entries(damages).forEach(([catId, list]) => {
            if (list && list.length > 0) {
                hasDamages = true;
                const catLabel = catId.toUpperCase().replace('_', ' ');
                damagesHtml += `
                    <div style="margin-bottom:8px;">
                        <strong>${catLabel}:</strong>
                        <ul style="margin:3px 0 0 15px; padding:0; font-size:0.85rem;">
                            ${list.map(d => `<li>📍 Posición: (${Math.round(d.x)}%, ${Math.round(d.y)}%) - ${d.note}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        });

        if (!hasDamages) {
            damagesHtml = '<p style="color:var(--success); margin:0; font-style:italic;">No se registraron anomalías físicas previas en el vehículo.</p>';
        }

        const signatureHtml = data.firmaDigital
            ? `<div style="text-align:center; margin-top:15px;">
                   <img src="${data.firmaDigital}" alt="Firma del Cliente" style="max-height:120px; border:1px solid #ddd; background:#fff; padding:5px; border-radius:6px; display:inline-block;">
                   <p style="margin:5px 0 0 0; font-size:0.85rem; font-weight:bold; color:var(--dark);">Firma del Cliente (Digital)</p>
                   <p style="margin:0; font-size:0.75rem; color:var(--secondary);">Confirmación de Entrega Satisfecha</p>
               </div>`
            : `<p style="font-style:italic; color:var(--danger);">No se ha registrado firma digital para esta entrega.</p>`;

        container.innerHTML = `
            <div class="receipt-container">
                <div class="receipt-header" style="border-bottom: 3px double var(--secondary); padding-bottom:15px; margin-bottom:20px;">
                    <h2 style="margin:0; color:var(--success);">EVIDENCIA DE ENTREGA VEHICULAR (POST-INSTALACIÓN)</h2>
                    <p style="margin:5px 0; font-size:0.9rem; color:var(--secondary);">GOS - GPS Operations Suite | Post-instalación</p>
                    <span class="badge badge-finalizada" style="font-size:0.85rem; padding: 4px 10px; background:#c3e6cb; color:#155724;">ENTREGADO SATISFACTORIAMENTE</span>
                </div>

                <div class="actions-bar" style="display:flex; justify-content:space-between; margin-bottom:25px; flex-wrap:wrap; gap:10px;">
                    <button class="btn btn-secondary" id="evidence-back-btn">⬅️ Volver</button>
                    <button class="btn btn-primary" id="evidence-print-btn">🖨️ Imprimir Evidencia</button>
                </div>

                <div class="receipt-section">
                    <h4>Datos Generales del Servicio Finalizado</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Orden de Trabajo:</strong> ${order.id}</div>
                        <div class="receipt-item"><strong>Fecha de Recepción:</strong> ${serv.fechaRecepcion}</div>
                        <div class="receipt-item"><strong>Fecha de Instalación:</strong> ${serv.fechaInstalacion}</div>
                        <div class="receipt-item"><strong>Lugar de Ejecución:</strong> ${serv.lugar}</div>
                        <div class="receipt-item"><strong>Instalador Técnico:</strong> ${data.instalador.nombre} ${data.instalador.apellido}</div>
                        <div class="receipt-item"><strong>Vendedor:</strong> ${data.vendedor.nombre} ${data.vendedor.apellido}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Información del Cliente</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Cliente:</strong> ${order.cliente || 'No especificado'}</div>
                        <div class="receipt-item"><strong>Contacto:</strong> ${order.contacto || ''}</div>
                        <div class="receipt-item"><strong>Teléfono:</strong> ${order.telefono || ''}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Ficha del Vehículo</h4>
                    <div class="receipt-grid">
                        <div class="receipt-item"><strong>Marca:</strong> ${v.marca}</div>
                        <div class="receipt-item"><strong>Modelo:</strong> ${v.modelo}</div>
                        <div class="receipt-item"><strong>Año:</strong> ${v.anio}</div>
                        <div class="receipt-item"><strong>Color:</strong> ${v.color}</div>
                        <div class="receipt-item"><strong>Placa:</strong> ${v.placa}</div>
                        <div class="receipt-item"><strong>VIN/Chasis:</strong> ${v.vin || ''}</div>
                        <div class="receipt-item"><strong>Clasificación:</strong> ${v.clasificacionVehiculo || 'No especificada'}</div>
                    </div>
                </div>

                <div class="receipt-section">
                    <h4>Estado Físico en Recepción Previa</h4>
                    <div class="receipt-damage-list" style="background:#fdfdfe; border:1px solid #ddd; padding:12px; border-radius:6px;">
                        ${damagesHtml}
                    </div>
                </div>

                <div class="receipt-section" style="border-top:1px dashed #ccc; padding-top:20px; margin-top:25px;">
                    <h4>Conformidad de Entrega del Vehículo</h4>
                    <div style="background:#e8f4fd; padding:15px; border-radius:8px; margin-bottom:15px; font-size:0.9rem; color:#1a73e8; line-height:1.4;">
                        El cliente confirma mediante este documento digital haber recibido el vehículo descrito en perfectas condiciones y con el servicio de GPS instalado de conformidad con las pruebas realizadas.
                    </div>
                    ${signatureHtml}
                </div>
            </div>
        `;

        document.getElementById('evidence-back-btn').onclick = () => loadSection('dashboard');
        document.getElementById('evidence-print-btn').onclick = () => window.print();

    } catch (e) {
        container.innerHTML = `<p class="error-msg">Error al conectar con el servidor: ${e.message}</p>`;
    }
}

// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('GOs Service Worker registrado'))
            .catch(err => console.warn('Fallo al registrar Service Worker', err));
    });
}

document.addEventListener('DOMContentLoaded', init);
