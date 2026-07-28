import { routeAction } from './api-config.js';

const SESSION_KEY = 'gos_session';

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
                    <div class="form-group"><label>Marca</label><input type="text" name="marca" class="form-control" required></div>
                    <div class="form-group"><label>Modelo</label><input type="text" name="modelo" class="form-control" required></div>
                    <div class="form-group"><label>VIN (Chasis)</label><input type="text" name="vin" class="form-control"></div>
                    <div class="form-group"><label>Número Motor</label><input type="text" name="motor" class="form-control"></div>
                    <div class="form-group"><label>Año</label><input type="number" name="anio" class="form-control"></div>
                    <div class="form-group"><label>Placa</label><input type="text" name="placa" class="form-control"></div>
                    <div class="form-group"><label>Servicio</label>
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

    const sections = {
        agenda: { title: 'Agenda de Instalaciones', content: '<p>Cargando turnos...</p>' },
        ordenes: { title: 'Gestión de Órdenes', content: '<p>Cargando órdenes de trabajo...</p>' },
        clientes: { title: 'Directorio de Clientes', content: '<p>Cargando base de datos de clientes...</p>' },
        tecnicos: { title: 'Panel de Técnicos', content: '<p>Cargando disponibilidad de técnicos...</p>' },
        consulta: { title: 'Consulta Técnica GPSpedia', content: '<p>Cargando motor de consulta...</p>' },
        reportes: { title: 'Reportes Operativos', content: '<p>Cargando reportes...</p>' }
    };

    if (sections[section]) {
        titleEl.textContent = sections[section].title;
        contentEl.innerHTML = sections[section].content;

        if (section === 'ordenes') {
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
        tiposTrabajo: buildOptions('TiposTrabajo', ['Instalación', 'Revisión', 'Traspaso', 'Desinstalación', 'Mantenimiento Preventivo']),
        prioridades: buildOptions('Prioridades', ['Baja', 'Normal', 'Alta', 'Urgente'])
    });

    document.getElementById('cancel-order-btn').addEventListener('click', () => loadSection('ordenes'));

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

function showMainView(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('welcome-msg').textContent = `Hola, ${user.Nombre_Usuario || 'Usuario'}`;
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

// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('GOS Service Worker registrado'))
            .catch(err => console.warn('Fallo al registrar Service Worker', err));
    });
}

document.addEventListener('DOMContentLoaded', init);
