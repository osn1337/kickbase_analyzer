document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
    const loginSection = document.getElementById("login-section");
    const leagueSection = document.getElementById("league-section");
    const dashboardSection = document.getElementById("dashboard-section");
    const fetchBtn = document.getElementById("fetch-data-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const errorMessage = document.getElementById("error-message");
    const leagueButtonsContainer = document.getElementById("league-buttons");
    const nextMatchLabel = document.getElementById("next-match");
    
    // --- State ---
    let token = "";
    let currentBudget = 0;
    let playersData = [];
    let sellSet = new Set();
    let daysToNextMatch = 0;

    const POSITIONS = { 1: "Tor", 2: "Abwehr", 3: "Mittelfeld", 4: "Sturm" };

    // Das erweiterte Mapping mit Full und Short
    const TEAM_MAPPING = {
        "1": { full: "FC Augsburg", short: "FCA" },
        "2": { full: "FC Bayern München", short: "FCB" },
        "3": { full: "Borussia Dortmund", short: "BVB" },
        "4": { full: "Eintracht Frankfurt", short: "SGE" },
        "5": { full: "SC Freiburg", short: "SCF" },
        "6": { full: "Hamburger SV", short: "HSV" },
        "7": { full: "Bayer 04 Leverkusen", short: "B04" },
        "8": { full: "FC Schalke 04", short: "S04" },
        "9": { full: "VfB Stuttgart", short: "VFB" },
        "10": { full: "SV Werder Bremen", short: "SVW" },
        "11": { full: "VfL Wolfsburg", short: "WOB" },
        "13": { full: "FC Augsburg", short: "FCA" },
        "14": { full: "TSG Hoffenheim", short: "TSG" },
        "15": { full: "Bor. Mönchengladbach", short: "BMG" },
        "18": { full: "FSV Mainz 05", short: "M05" },
        "28": { full: "1. FC Köln", short: "KOE" },
        "29": { full: "SC Paderborn 07", short: "SCP" },
        "39": { full: "FC St. Pauli", short: "STP" },
        "40": { full: "1. FC Union Berlin", short: "FCU" },
        "41": { full: "VfL Bochum", short: "BOC" },
        "42": { full: "Holstein Kiel", short: "KIE" },
        "43": { full: "RB Leipzig", short: "RBL" },
        "50": { full: "1. FC Heidenheim", short: "FCH" }
    };

    function getTeamData(tid) {
        return TEAM_MAPPING[String(tid)] || { full: "Team-ID " + tid, short: "T" + tid };
    }

    // --- Events ---
    fetchBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password) return showError("Bitte E-Mail und Passwort eingeben.");

        fetchBtn.textContent = "Logge ein...";
        fetchBtn.disabled = true;
        hideError();

        try {
            const loginRes = await apiCall("/user/login", "POST", { em: email, pass: password });
            token = loginRes.tkn;
            
            fetchBtn.textContent = "Lade Ligen...";
            const leaguesRes = await apiCall("/leagues", "GET");
            const leagues = leaguesRes.lins || [];
            
            const validLeagues = leagues.filter(l => !l.n.toLowerCase().includes("challenge"));
            
            if (validLeagues.length === 0) throw new Error("Keine passenden Ligen gefunden.");
            
            showLeagueSelection(validLeagues);
        } catch (err) {
            showError(err.message);
        } finally {
            fetchBtn.textContent = "Daten abrufen";
            fetchBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener("click", () => {
        token = "";
        dashboardSection.classList.add("hidden");
        loginSection.classList.remove("hidden");
    });

    // --- Core Functions ---
    async function apiCall(endpoint, method = "GET", body = null) {
        const headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const proxyUrl = `/api/kickbase?endpoint=${endpoint}`;
        
        const response = await fetch(proxyUrl, options);
        if (!response.ok) throw new Error(`API Fehler: ${response.status}`);
        return response.json();
    }

    function showLeagueSelection(leagues) {
        loginSection.classList.add("hidden");
        leagueSection.classList.remove("hidden");
        leagueButtonsContainer.innerHTML = "";

        leagues.forEach(league => {
            const btn = document.createElement("button");
            btn.textContent = league.n;
            btn.onclick = () => loadLeagueData(league.i, league.n);
            leagueButtonsContainer.appendChild(btn);
        });
    }

    async function loadLeagueData(leagueId, leagueName) {
        leagueSection.classList.add("hidden");
        sellSet.clear();
        
        try {
            await fetchNextMatchday();

            const meRes = await apiCall(`/leagues/${leagueId}/me`);
            currentBudget = Number(meRes.b) || 0;

            const squadRes = await apiCall(`/leagues/${leagueId}/squad`);
            const items = squadRes.it || [];

            playersData = items.map((p, index) => {
                const mv = Number(p.mv) || 0;
                const mvgl = Number(p.mvgl) || 0;
                const buyPrice = mvgl ? (mv - mvgl) : mv;
                return {
                    id: p.id || p.i || `p_${index}`, 
                    name: p.n,
                    teamId: p.tid,
                    pos: Number(p.pos),
                    marketValue: mv,
                    buyPrice: buyPrice,
                    profit: mv - buyPrice
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            document.getElementById("league-name").textContent = `Kaderübersicht ${leagueName}`;
            document.getElementById("last-update").textContent = `Stand: ${new Date().toLocaleString('de-DE')}`;
            
            renderDashboard();
        } catch (err) {
            showError("Fehler beim Laden des Kaders: " + err.message);
            leagueSection.classList.remove("hidden");
        }
    }

    async function fetchNextMatchday() {
        try {
            const year = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
            const res = await fetch(`https://api.openligadb.de/getmatchdata/bl1/${year}`);
            const matches = await res.json();
            
            const now = new Date();
            let earliestFuture = new Date("2999-12-31");
            
            matches.forEach(m => {
                const matchDate = new Date(m.matchDateTimeUTC);
                if (matchDate >= now && matchDate < earliestFuture) {
                    earliestFuture = matchDate;
                }
            });

            if (earliestFuture.getFullYear() !== 2999) {
                const todayMidnight = new Date();
                todayMidnight.setHours(0, 0, 0, 0);
                
                const matchMidnight = new Date(earliestFuture);
                matchMidnight.setHours(0, 0, 0, 0);

                daysToNextMatch = Math.max(0, Math.round((matchMidnight - todayMidnight) / (1000 * 60 * 60 * 24)));
                
                nextMatchLabel.textContent = `Nächster Spieltag: ${earliestFuture.toLocaleDateString('de-DE')}`;
                nextMatchLabel.style.color = "var(--text-color)";
            } else {
                nextMatchLabel.textContent = "Nächster Spieltag: Nicht abrufbar!";
                nextMatchLabel.style.color = "var(--negative-color)";
                daysToNextMatch = 0;
            }
        } catch (e) {
            nextMatchLabel.textContent = "Nächster Spieltag: Fehler beim Abruf";
            daysToNextMatch = 0;
        }
    }

    function renderDashboard() {
        dashboardSection.classList.remove("hidden");
        const tbody = document.getElementById("squad-body");
        tbody.innerHTML = "";

        for (let pos = 1; pos <= 4; pos++) {
            const posPlayers = playersData.filter(p => p.pos === pos);
            if (posPlayers.length === 0) continue;

            const headerRow = document.createElement("tr");
            headerRow.className = "pos-header";
            headerRow.innerHTML = `<td colspan="6">${POSITIONS[pos]}</td>`;
            tbody.appendChild(headerRow);

            posPlayers.forEach(p => {
                const tr = document.createElement("tr");
                const isChecked = sellSet.has(p.id);
                const team = getTeamData(p.teamId);
                
                tr.innerHTML = `
                    <td>${p.name}</td>
                    <td>
                        <span class="team-full">${team.full}</span>
                        <span class="team-short">${team.short}</span>
                    </td>
                    <td class="text-right muted">${formatCurrency(p.buyPrice)}</td>
                    <td class="text-right font-bold">${formatCurrency(p.marketValue)}</td>
                    <td class="text-center checkbox-cell"><input type="checkbox" data-id="${p.id}" ${isChecked ? "checked" : ""}></td>
                    <td class="text-right font-bold ${p.profit >= 0 ? 'val-positive' : 'val-negative'}">${formatCurrency(p.profit)}</td>
                `;
                
                const cb = tr.querySelector("input");
                cb.addEventListener("change", (e) => {
                    if (e.target.checked) sellSet.add(p.id);
                    else sellSet.delete(p.id);
                    updateCalculations();
                });

                tbody.appendChild(tr);
            });
        }
        
        updateCalculations();
    }

    function updateCalculations() {
        let totalBuy = 0, totalMv = 0, totalProfit = 0;
        let sellMv = 0, sellProfit = 0;
        let expectedBonus = 0;

        playersData.forEach(p => {
            totalBuy += p.buyPrice;
            totalMv += p.marketValue;
            totalProfit += p.profit;

            if (sellSet.has(p.id)) {
                sellMv += p.marketValue;
                sellProfit += p.profit;

                if (p.profit >= 3000000 && p.profit < 5000000) expectedBonus += 250000;
                else if (p.profit >= 5000000 && p.profit < 10000000) expectedBonus += 750000;
                else if (p.profit >= 10000000 && p.profit < 25000000) expectedBonus += 1750000;
                else if (p.profit >= 25000000) expectedBonus += 3750000;
            }
        });

        expectedBonus += (daysToNextMatch * 100000);

        const budgetAfterTransfers = currentBudget + sellMv;
        const budgetAfterBonus = budgetAfterTransfers + expectedBonus;

        document.getElementById("budget-current").textContent = formatCurrency(currentBudget);
        setColoredValue("budget-current", currentBudget);
        
        document.getElementById("budget-transfers").textContent = formatCurrency(budgetAfterTransfers);
        setColoredValue("budget-transfers", budgetAfterTransfers);
        
        document.getElementById("budget-bonus").textContent = formatCurrency(budgetAfterBonus);
        setColoredValue("budget-bonus", budgetAfterBonus);

        const tfoot = document.getElementById("squad-footer");
        tfoot.innerHTML = `
            <tr class="footer-row">
                <td>Kader</td>
                <td>${playersData.length}/25 Spieler</td>
                <td class="text-right muted">${formatCurrency(totalBuy)}</td>
                <td class="text-right">${formatCurrency(totalMv)}</td>
                <td class="text-center">${formatCurrency(sellMv)}</td>
                <td class="text-right ${totalProfit >= 0 ? 'val-positive' : 'val-negative'}">${formatCurrency(totalProfit)}</td>
            </tr>
            <tr class="footer-row">
                <td>Transfers</td>
                <td>${playersData.length - sellSet.size}/25 Spieler</td>
                <td></td>
                <td class="text-center" colspan="2">${formatCurrency(totalMv - sellMv)}</td>
                <td class="text-right ${sellProfit >= 0 ? 'val-positive' : 'val-negative'}">${formatCurrency(sellProfit)}</td>
            </tr>
        `;
    }

    function formatCurrency(val) {
        return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(val);
    }

    function setColoredValue(elementId, value) {
        const el = document.getElementById(elementId);
        el.classList.remove("val-positive", "val-negative");
        if (value >= 0) el.classList.add("val-positive");
        else el.classList.add("val-negative");
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove("hidden");
    }

    function hideError() {
        errorMessage.classList.add("hidden");
    }
});
