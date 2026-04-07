/**
 * ============================================
 * CONFIGURACIÓN DEL SISTEMA - EDITABLE
 * Modificar código y versión aquí
 * ============================================
 */
const CONFIG = {
    documento: {
        titulo: "Listado del control de información en resguardo",
        codigo: "L1/AC-P21",
        version: "002/Ene-25"
    },
    app: {
        nombre: "Listado de estudios",
        subtitulo: "Control de información",
        syncInterval: 12000,
        sessionTimeout: 120000
    },
    cloud: {
        id: "2283f7bf-3b73-41d3-ae69-fada5210e5ab",
        baskets: { main: "listado_v4", online: "online_v4" }
    },
    ubicaciones: ["DEBBIOM", "Archivo"],
    resguardos: ["HDD", "HDD y Caja", "HDD y Mueble", "Mueble"],
    areas: ["analitica", "calidad", "clinica", "estadistico"],
    alertas: { destruccion: 180, warning: 365, solicitud: 30 }
};
CONFIG.getApiUrl = (b) => `https://getpantry.cloud/apiv1/pantry/${CONFIG.cloud.id}/basket/${b}`;
