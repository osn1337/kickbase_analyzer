module.exports = async function handler(req, res) {
    // CORS Headers setzen, damit das Frontend die Antwort akzeptiert
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const targetEndpoint = req.query.endpoint;
    if (!targetEndpoint) {
        return res.status(400).json({ error: 'Endpoint parameter is missing' });
    }

    const API_BASE = "https://api.kickbase.com/v4";
    const url = `${API_BASE}${targetEndpoint}`;

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "Kickbase/9.0.4 (iPhone; iOS 17.5; Scale/3.00)"
            }
        };

        if (req.headers.authorization) {
            fetchOptions.headers["Authorization"] = req.headers.authorization;
        }

        if (req.method === 'POST' && req.body) {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const apiResponse = await fetch(url, fetchOptions);
        const data = await apiResponse.json();

        return res.status(apiResponse.status).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
