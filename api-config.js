export const API_ENDPOINTS = {
    AUTH: "https://script.google.com/macros/s/AKfycbwATstMSSnuYZMeGEjI7Q5cznO6kA8rqLo7zNZLmu_f29qwcyt4Fucn5VIBdB9tMoRg/exec",
    CATALOG: "https://script.google.com/macros/s/AKfycbxenVjZe9C8-0RiYKLxpGfQtobRzydBke44IM4NdNNjh5VRdlB91Ce9dWvQ2xnDFXk0/exec",
    WRITE: "https://script.google.com/macros/s/AKfycbwgpSXDpF9jW20mqvK8jP9clxs1Gacz-o6caOEBm1hBweAxkBe1lAW9hJTh1fMFcOvP/exec",
    USERS: "https://script.google.com/macros/s/AKfycbxAqyEcAHetH6yN4qccGILL-L3IzMSPVuVJ1kpuO86GqfDXTKP8cHrrB7UkKN1r_0g5/exec",
    FEEDBACK: "https://script.google.com/macros/s/AKfycbwHTr8MSFuNio8rky8tflcErlRlAb1YSH2jmszZp77SM5e_-SVMO2pBU1UmeGOH1Aig/exec",
    GOS_CORE: "https://script.google.com/macros/s/AKfycbw9NwcejaXuiaK4MZIXmEWwvVa53GjJ9E4VRm3rrKCR8klAuGlKgLw260sP4JyKaxGE/exec"
};

export async function routeAction(service, action, payload = {}) {
    const targetUrl = API_ENDPOINTS[service];
    if (!targetUrl) throw new Error(`Servicio no definido: ${service}`);

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, payload }),
            redirect: 'follow'
        });

        if (!response.ok) throw new Error(`Error de red: ${response.status}`);
        const text = await response.text();
        const result = JSON.parse(text);

        if (result.status === 'error') {
            throw new Error(result.message || 'Error desconocido en el servidor');
        }
        return result;
    } catch (error) {
        console.error(`Error en routeAction (${service}/${action}):`, error);
        throw error;
    }
}
