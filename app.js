let charts = {};

// Récupération des éléments DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('upload-section');
const resultsSection = document.getElementById('results');
const subtitle = document.querySelector('.subtitle');

// ========================================
// GESTION DU DRAG & DROP
// ========================================

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        processFile(file);
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
});

// ========================================
// GESTION DES ONGLETS
// ========================================

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// ========================================
// TRAITEMENT DU FICHIER CSV
// ========================================

function processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const csv = e.target.result;
        analyzeData(csv);
    };
    reader.readAsText(file);
}

function analyzeData(csv) {
    try {
        const lines = csv.split('\n').filter(l => l.trim());
        
        if (lines.length < 2) {
            alert('Fichier CSV vide ou invalide. Assure-toi qu\'il contient au moins une ligne d\'en-têtes et une ligne de données.');
            return;
        }
        
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];

        // Parse du CSV avec conversion systématique en nombres
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((h, idx) => {
                const val = values[idx] ? values[idx].trim() : ''; // Trim pour éviter les espaces
                
                // FIX: Ne pas convertir certains champs spéciaux en nombres
                if (h === 'Resolution' || h === 'Application' || h === 'GPU' || h === 'CPU' || h === 'Runtime') {
                    row[h] = val || null;
                } else if (val && val !== 'NA') {
                    const num = parseFloat(val);
                    row[h] = !isNaN(num) ? num : val;
                } else {
                    row[h] = null;
                }
            });
            data.push(row);
        }

        // Vérification critique : au moins une ligne de données
        if (data.length === 0) {
            alert('Aucune donnée trouvée dans le fichier CSV.');
            return;
        }

        // Détection des cœurs CPU actifs
        const activeCores = [];
        const coreMapping = {}; // Map index remappé -> index réel CSV
        let remappedIndex = 0;
        
        for (let i = 0; i < 64; i++) {
            const coreKey = `CPUCoreUtil%[${i}]`;
            if (headers.includes(coreKey)) {
                // FIX: garder les zéros, juste exclure null/undefined
                const coreValues = data.map(d => d[coreKey]).filter(v => v !== null && v !== undefined && typeof v === 'number');
                if (coreValues.length > 0) {
                    activeCores.push(remappedIndex);
                    coreMapping[remappedIndex] = i; // remappé -> réel CSV
                    remappedIndex++;
                }
            }
        }

        console.log(`🔥 Cœurs CPU détectés: ${activeCores.length} cœurs actifs`);
        console.log('Mapping des cœurs (affichage→CSV):', coreMapping);

        // Calcul des FPS - FIX: garder les 0 si valides
        const fpsList = data.map(d => d.MsBetweenPresents && d.MsBetweenPresents > 0 ? 1000 / d.MsBetweenPresents : null)
                           .filter(f => f !== null && isFinite(f) && f > 0);
        
        if (fpsList.length === 0) {
            alert('Aucune donnée FPS valide trouvée dans le fichier.');
            return;
        }
        
        const sorted = [...fpsList].sort((a, b) => a - b);
        
        // Calcul des percentiles détaillés
        const fpsPercentiles = {
            p95: sorted[Math.floor(fpsList.length * 0.95)] || 0,
            p99: sorted[Math.floor(fpsList.length * 0.99)] || 0,
            p1: sorted[Math.floor(fpsList.length * 0.01)] || 0,
            p01: sorted[Math.floor(fpsList.length * 0.001)] || 0
        };
        
        // Calcul de la variance/stabilité du frametime
        const frametimes = data.map(d => d.MsBetweenPresents || 0).filter(f => f > 0);
        const avgFrametime = frametimes.reduce((a, b) => a + b, 0) / frametimes.length;
        const variance = frametimes.map(f => Math.pow(f - avgFrametime, 2)).reduce((a, b) => a + b, 0) / frametimes.length;
        const stdDev = Math.sqrt(variance);

        // Helper pour filtrer proprement (garde les zéros)
        const filterValid = (arr) => arr.filter(v => typeof v === 'number' && isFinite(v));

        // Calcul des statistiques de latence - FIX: garder les zéros
        const latencyMetrics = {
            simulationStart: filterValid(data.map(d => d.MsBetweenSimulationStart)),
            presents: filterValid(data.map(d => d.MsBetweenPresents)),
            displayChange: filterValid(data.map(d => d.MsBetweenDisplayChange)),
            presentAPI: filterValid(data.map(d => d.MsInPresentAPI)),
            renderPresent: filterValid(data.map(d => d.MsRenderPresentLatency)),
            untilDisplayed: filterValid(data.map(d => d.MsUntilDisplayed)),
            renderQueue: filterValid(data.map(d => d['Render Queue Depth'])),
            pcLatency: filterValid(data.map(d => d.MsPCLatency))
        };

        // Calcul des statistiques CPU - FIX: garder les zéros
        const cpuMetrics = {
            freq: filterValid(data.map(d => d['CPUClk(MHz)'])),
            util: filterValid(data.map(d => d['CPUUtil(%)'])),
            temp: filterValid(data.map(d => d['CPU Package Temp(C)'])),
            power: filterValid(data.map(d => d['CPU Package Power(W)'])),
            tdp: filterValid(data.map(d => d['CPU TDP (W)'])),
            activeCores: activeCores,
            coresData: activeCores.map(remappedIdx => {
                const realCoreIdx = coreMapping[remappedIdx]; // Récupérer l'index réel du CSV
                return {
                    index: remappedIdx, // Index affiché (0-7)
                    data: data.map(d => {
                        const val = d[`CPUCoreUtil%[${realCoreIdx}]`]; // Utiliser l'index réel
                        return (typeof val === 'number') ? val : 0;
                    })
                };
            })
        };

        // Calcul des statistiques GPU
        const gpuMetrics = {
            // GPU Principal (GPU0)
            gpu0Clk: filterValid(data.map(d => d['GPU0Clk(MHz)'])),
            gpu0MemClk: filterValid(data.map(d => d['GPU0MemClk(MHz)'])),
            gpu0Util: filterValid(data.map(d => d['GPU0Util(%)'])),
            gpu0Temp: filterValid(data.map(d => d['GPU0Temp(C)'])),
            // GPU Secondaire (GPU1)
            gpu1Clk: filterValid(data.map(d => d['GPU1Clk(MHz)'])),
            gpu1MemClk: filterValid(data.map(d => d['GPU1MemClk(MHz)'])),
            gpu1Util: filterValid(data.map(d => d['GPU1Util(%)'])),
            gpu1Temp: filterValid(data.map(d => d['GPU1Temp(C)'])),
            hasGpu1: filterValid(data.map(d => d['GPU1Util(%)'])).length > 0
        };

        // Calcul des statistiques de puissance
        const powerMetrics = {
            pcatTotal: filterValid(data.map(d => d['PCAT Power Total(W)'])),
            perfWattPCAT: filterValid(data.map(d => d['Perf/W Total(F/J) (PCAT)'])),
            perfWattAPI: filterValid(data.map(d => d['Perf/W Total(F/J) (API)'])),
            perfWattGPU: filterValid(data.map(d => d['Perf/W GPUOnly(F/J) (API)'])),
            perfWattUSBC: filterValid(data.map(d => d['Perf/W Total-USBC(F/J) (API)'])),
            gpuOnlyPower: filterValid(data.map(d => d['GPUOnlyPwr(W) (API)'])),
            usbcPower: filterValid(data.map(d => d['NV-Total-USBCPwr(W) (API)'])),
            nvPower: filterValid(data.map(d => d['NV Pwr(W) (API)'])),
            amdPower: filterValid(data.map(d => d['AMDPwr(W) (API)'])),
            hasPCAT: filterValid(data.map(d => d['PCAT Power Total(W)'])).length > 0,
            hasUSBC: filterValid(data.map(d => d['NV-Total-USBCPwr(W) (API)'])).length > 0
        };

        // Helper pour calculer moyenne safe
        const safeAvg = (arr) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '0.0';

        // Calcul des statistiques principales - FIX: divisions sécurisées
        const gpuUtilValues = filterValid(data.map(d => d['GPU0Util(%)']));
        const cpuUtilValues = filterValid(data.map(d => d['CPUUtil(%)']));
        const gpuTempValues = filterValid(data.map(d => d['GPU0Temp(C)']));
        const gpuPowerValues = filterValid(data.map(d => d['NV Pwr(W) (API)'] || d['AMDPwr(W) (API)']));
        const cpuPowerValues = filterValid(data.map(d => d['CPU Package Power(W)']));
        
        const stats = {
            avgFps: safeAvg(fpsList),
            minFps: fpsList.length > 0 ? Math.min(...fpsList).toFixed(1) : '0.0',
            maxFps: fpsList.length > 0 ? Math.max(...fpsList).toFixed(1) : '0.0',
            p95Fps: fpsPercentiles.p95.toFixed(1),
            p99Fps: fpsPercentiles.p99.toFixed(1),
            p1Fps: fpsPercentiles.p1.toFixed(1),
            p01Fps: fpsPercentiles.p01.toFixed(1),
            avgFrametime: avgFrametime.toFixed(2),
            frametimeStdDev: stdDev.toFixed(2),
            avgGpuUtil: safeAvg(gpuUtilValues),
            avgCpuUtil: safeAvg(cpuUtilValues),
            avgGpuTemp: safeAvg(gpuTempValues),
            avgCpuTemp: safeAvg(cpuMetrics.temp),
            avgGpuPower: safeAvg(gpuPowerValues),
            avgCpuPower: safeAvg(cpuPowerValues),
            avgPCLatency: safeAvg(latencyMetrics.pcLatency),
            droppedFrames: data.filter(d => d.Dropped === 1 || d.Dropped === '1').length,
            totalFrames: fpsList.length,
            gameName: (data[0] && data[0].Application) || 'Jeu',
            gpu: (data[0] && data[0].GPU) || 'GPU',
            cpu: (data[0] && data[0].CPU) || 'CPU',
            resolution: (data[0] && data[0].Resolution) || 'N/A',
            latency: latencyMetrics,
            cpuMetrics: cpuMetrics,
            gpuMetrics: gpuMetrics,
            powerMetrics: powerMetrics,
            fpsData: fpsList,
            frametimeData: frametimes
        };

        // Calcul du Perf per Watt - FIX: vérification division par zéro
        const totalWatts = parseFloat(stats.avgGpuPower) + parseFloat(stats.avgCpuPower);
        stats.perfPerWatt = totalWatts > 0 ? (parseFloat(stats.avgFps) / totalWatts).toFixed(2) : '0.00';

        console.log('Stats calculées:', stats);
        
        // DEBUG: Vérification des données de latence
        console.log('=== DEBUG LATENCE ===');
        console.log('Render→Present (10 premières valeurs):', stats.latency.renderPresent.slice(0, 10));
        console.log('Until Displayed (10 premières valeurs):', stats.latency.untilDisplayed.slice(0, 10));
        console.log('Sont-elles identiques?', JSON.stringify(stats.latency.renderPresent.slice(0, 10)) === JSON.stringify(stats.latency.untilDisplayed.slice(0, 10)));
        console.log('====================');

        // Affichage des résultats
        displayStats(stats);
        displayFPSStats(stats);
        displayLatencyStats(stats);
        displayCPUStats(stats);
        displayGPUStats(stats);
        displayPowerStats(stats);
        createCharts(data, fpsList, stats);

        uploadSection.style.display = 'none';
        resultsSection.style.display = 'block';
        subtitle.textContent = `${stats.gameName} - ${stats.gpu} - ${stats.cpu} - ${stats.resolution} - ${stats.totalFrames} frames analysées`;
    } catch (error) {
        console.error('Erreur lors de l\'analyse:', error);
        alert('Erreur lors de l\'analyse du fichier CSV. Vérifie la console (F12) pour plus de détails.');
    }
}

// ========================================
// AFFICHAGE DES STATISTIQUES FPS
// ========================================

function displayFPSStats(stats) {
    const fpsStatsGrid = document.getElementById('fpsStatsGrid');
    
    fpsStatsGrid.innerHTML = `
        <div class="stat-card gradient-green">
            <div class="stat-title">FPS Moyen</div>
            <div class="stat-value">${stats.avgFps}<span class="stat-unit">FPS</span></div>
            <div class="stat-subtitle">Frametime: ${stats.avgFrametime}ms</div>
        </div>
        <div class="stat-card gradient-blue">
            <div class="stat-title">FPS Max</div>
            <div class="stat-value">${stats.maxFps}<span class="stat-unit">FPS</span></div>
            <div class="stat-subtitle">Pic de performance</div>
        </div>
        <div class="stat-card gradient-red">
            <div class="stat-title">FPS Min</div>
            <div class="stat-value">${stats.minFps}<span class="stat-unit">FPS</span></div>
            <div class="stat-subtitle">Pire moment</div>
        </div>
        <div class="stat-card gradient-purple">
            <div class="stat-title">P95 (95e percentile)</div>
            <div class="stat-value">${stats.p95Fps}<span class="stat-unit">FPS</span></div>
            <div class="stat-subtitle">95% du temps au-dessus</div>
        </div>
        <div class="stat-card gradient-cyan">
            <div class="stat-title">P99 (99e percentile)</div>
            <div class="stat-value">${stats.p99Fps}<span class="stat-unit">FPS</span></div>
            <div class="stat-subtitle">99% du temps au-dessus</div>
        </div>
        <div class="stat-card gradient-yellow">
            <div class="stat-title">1% Low</div>
            <div class="stat-value">${stats.p1Fps}<span class="stat-unit">FPS</span></div>
            <div class="stat-subtitle">1% le plus lent</div>
        </div>
        <div class="stat-card gradient-orange">
            <div class="stat-title">0.1% Low</div>
            <div class="stat-value">${stats.p01Fps}<span class="stat-unit">FPS</span></div>
            <div class="stat-subtitle">0.1% le plus lent</div>
        </div>
        <div class="stat-card gradient-pink">
            <div class="stat-title">Stabilité Frametime</div>
            <div class="stat-value">${stats.frametimeStdDev}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">Écart-type (plus bas = mieux)</div>
        </div>
    `;
}

// ========================================
// AFFICHAGE DES STATISTIQUES VUE D'ENSEMBLE
// ========================================

function displayStats(stats) {
    document.getElementById('avgFps').textContent = stats.avgFps;
    document.getElementById('minFps').textContent = stats.minFps;
    document.getElementById('maxFps').textContent = stats.maxFps;
    document.getElementById('p1Fps').textContent = stats.p1Fps;
    document.getElementById('p01Fps').textContent = stats.p01Fps;
    
    document.getElementById('avgCpuUtil').textContent = stats.avgCpuUtil;
    document.getElementById('avgCpuTemp').textContent = stats.avgCpuTemp;
    document.getElementById('avgCpuPower').textContent = stats.avgCpuPower;
    
    document.getElementById('avgGpuUtil').textContent = stats.avgGpuUtil;
    document.getElementById('avgGpuTemp').textContent = stats.avgGpuTemp;
    document.getElementById('avgGpuPower').textContent = stats.avgGpuPower;
    
    document.getElementById('avgPCLatency').textContent = stats.avgPCLatency;
    document.getElementById('perfPerWatt').textContent = stats.perfPerWatt;
    document.getElementById('droppedFrames').textContent = stats.droppedFrames;
}

// ========================================
// AFFICHAGE DES STATISTIQUES DE LATENCE
// ========================================

function displayLatencyStats(stats) {
    const lat = stats.latency;
    const latencyStatsGrid = document.getElementById('latencyStatsGrid');
    
    const calcStats = (arr) => {
        if (!arr || arr.length === 0) return { avg: 0, min: 0, max: 0, p99: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        return {
            avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
            min: Math.min(...arr).toFixed(2),
            max: Math.max(...arr).toFixed(2),
            p99: sorted[Math.floor(arr.length * 0.99)].toFixed(2)
        };
    };
    
    const simStats = calcStats(lat.simulationStart);
    const presentStats = calcStats(lat.presents);
    const apiStats = calcStats(lat.presentAPI);
    const renderPresentStats = calcStats(lat.renderPresent);
    const displayedStats = calcStats(lat.untilDisplayed);
    const queueStats = calcStats(lat.renderQueue);
    const pcLatencyStats = calcStats(lat.pcLatency);
    
    latencyStatsGrid.innerHTML = `
        <div class="stat-card gradient-purple">
            <div class="stat-title">PC Latency (Moy)</div>
            <div class="stat-value">${pcLatencyStats.avg}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">P99: ${pcLatencyStats.p99}ms</div>
        </div>
        <div class="stat-card gradient-cyan">
            <div class="stat-title">Simulation Start</div>
            <div class="stat-value">${simStats.avg}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">P99: ${simStats.p99}ms</div>
        </div>
        <div class="stat-card gradient-blue">
            <div class="stat-title">Between Presents</div>
            <div class="stat-value">${presentStats.avg}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">P99: ${presentStats.p99}ms</div>
        </div>
        <div class="stat-card gradient-orange">
            <div class="stat-title">In Present API</div>
            <div class="stat-value">${apiStats.avg}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">P99: ${apiStats.p99}ms</div>
        </div>
        <div class="stat-card gradient-pink">
            <div class="stat-title">Render → Present</div>
            <div class="stat-value">${renderPresentStats.avg}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">P99: ${renderPresentStats.p99}ms</div>
        </div>
        <div class="stat-card gradient-lime">
            <div class="stat-title">Until Displayed</div>
            <div class="stat-value">${displayedStats.avg}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">P99: ${displayedStats.p99}ms</div>
        </div>
        <div class="stat-card gradient-yellow">
            <div class="stat-title">Render Queue (Moy)</div>
            <div class="stat-value">${queueStats.avg}<span class="stat-unit">frames</span></div>
            <div class="stat-subtitle">Max: ${queueStats.max}</div>
        </div>
        <div class="stat-card gradient-indigo">
            <div class="stat-title">Latence Totale Max</div>
            <div class="stat-value">${pcLatencyStats.max}<span class="stat-unit">ms</span></div>
            <div class="stat-subtitle">Min: ${pcLatencyStats.min}ms</div>
        </div>
    `;
}

// ========================================
// AFFICHAGE DES STATISTIQUES CPU
// ========================================

function displayCPUStats(stats) {
    const cpu = stats.cpuMetrics;
    const cpuStatsGrid = document.getElementById('cpuStatsGrid');
    
    const calcStats = (arr) => {
        if (!arr || arr.length === 0) return { avg: 0, min: 0, max: 0, p99: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        return {
            avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
            min: Math.min(...arr).toFixed(2),
            max: Math.max(...arr).toFixed(2),
            p99: sorted[Math.floor(arr.length * 0.99)].toFixed(2)
        };
    };
    
    const freqStats = calcStats(cpu.freq);
    const utilStats = calcStats(cpu.util);
    const tempStats = calcStats(cpu.temp);
    const powerStats = calcStats(cpu.power);
    const tdpStats = calcStats(cpu.tdp);
    
    const coresUtilAvg = cpu.coresData.map(core => {
        const avg = core.data.reduce((a, b) => a + b, 0) / core.data.length;
        return { index: core.index, avg: avg };
    }).sort((a, b) => b.avg - a.avg);
    
    const mostUsedCore = coresUtilAvg[0] || { index: 0, avg: 0 };
    const leastUsedCore = coresUtilAvg[coresUtilAvg.length - 1] || { index: 0, avg: 0 };
    
    cpuStatsGrid.innerHTML = `
        <div class="stat-card gradient-cyan">
            <div class="stat-title">Fréquence CPU Moyenne</div>
            <div class="stat-value">${freqStats.avg}<span class="stat-unit">MHz</span></div>
            <div class="stat-subtitle">Max: ${freqStats.max} MHz</div>
        </div>
        <div class="stat-card gradient-purple">
            <div class="stat-title">Utilisation CPU</div>
            <div class="stat-value">${utilStats.avg}<span class="stat-unit">%</span></div>
            <div class="stat-subtitle">P99: ${utilStats.p99}%</div>
        </div>
        <div class="stat-card gradient-orange">
            <div class="stat-title">Température Package</div>
            <div class="stat-value">${tempStats.avg}<span class="stat-unit">°C</span></div>
            <div class="stat-subtitle">Max: ${tempStats.max}°C</div>
        </div>
        <div class="stat-card gradient-lime">
            <div class="stat-title">Puissance CPU</div>
            <div class="stat-value">${powerStats.avg}<span class="stat-unit">W</span></div>
            <div class="stat-subtitle">Max: ${powerStats.max}W</div>
        </div>
        <div class="stat-card gradient-yellow">
            <div class="stat-title">TDP CPU</div>
            <div class="stat-value">${tdpStats.avg}<span class="stat-unit">W</span></div>
            <div class="stat-subtitle">Limite thermique</div>
        </div>
        <div class="stat-card gradient-blue">
            <div class="stat-title">Cœurs Actifs</div>
            <div class="stat-value">${cpu.activeCores.length}<span class="stat-unit">cores</span></div>
            <div class="stat-subtitle">Threads détectés</div>
        </div>
        <div class="stat-card gradient-pink">
            <div class="stat-title">Cœur le + Utilisé</div>
            <div class="stat-value">Core ${mostUsedCore.index}</div>
            <div class="stat-subtitle">${mostUsedCore.avg.toFixed(1)}% en moyenne</div>
        </div>
        <div class="stat-card gradient-indigo">
            <div class="stat-title">Cœur le - Utilisé</div>
            <div class="stat-value">Core ${leastUsedCore.index}</div>
            <div class="stat-subtitle">${leastUsedCore.avg.toFixed(1)}% en moyenne</div>
        </div>
    `;
}

// ========================================
// AFFICHAGE DES STATISTIQUES GPU
// ========================================

function displayGPUStats(stats) {
    const gpu = stats.gpuMetrics;
    const gpuStatsGrid = document.getElementById('gpuStatsGrid');
    
    const calcStats = (arr) => {
        if (!arr || arr.length === 0) return { avg: 0, min: 0, max: 0, p99: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        return {
            avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
            min: Math.min(...arr).toFixed(2),
            max: Math.max(...arr).toFixed(2),
            p99: sorted[Math.floor(arr.length * 0.99)].toFixed(2)
        };
    };
    
    const gpu0ClkStats = calcStats(gpu.gpu0Clk);
    const gpu0MemClkStats = calcStats(gpu.gpu0MemClk);
    const gpu0UtilStats = calcStats(gpu.gpu0Util);
    const gpu0TempStats = calcStats(gpu.gpu0Temp);
    
    let cardsHTML = `
        <div class="stat-card gradient-cyan">
            <div class="stat-title">GPU Fréquence Moy</div>
            <div class="stat-value">${gpu0ClkStats.avg}<span class="stat-unit">MHz</span></div>
            <div class="stat-subtitle">Max: ${gpu0ClkStats.max} MHz</div>
        </div>
        <div class="stat-card gradient-blue">
            <div class="stat-title">Mémoire GPU Moy</div>
            <div class="stat-value">${gpu0MemClkStats.avg}<span class="stat-unit">MHz</span></div>
            <div class="stat-subtitle">Max: ${gpu0MemClkStats.max} MHz</div>
        </div>
        <div class="stat-card gradient-purple">
            <div class="stat-title">GPU Utilisation</div>
            <div class="stat-value">${gpu0UtilStats.avg}<span class="stat-unit">%</span></div>
            <div class="stat-subtitle">P99: ${gpu0UtilStats.p99}%</div>
        </div>
        <div class="stat-card gradient-orange">
            <div class="stat-title">GPU Température</div>
            <div class="stat-value">${gpu0TempStats.avg}<span class="stat-unit">°C</span></div>
            <div class="stat-subtitle">Max: ${gpu0TempStats.max}°C</div>
        </div>
    `;
    
    // Si GPU secondaire détecté
    if (gpu.hasGpu1) {
        const gpu1ClkStats = calcStats(gpu.gpu1Clk);
        const gpu1MemClkStats = calcStats(gpu.gpu1MemClk);
        const gpu1UtilStats = calcStats(gpu.gpu1Util);
        const gpu1TempStats = calcStats(gpu.gpu1Temp);
        
        cardsHTML += `
            <div class="stat-card gradient-lime">
                <div class="stat-title">GPU2 Fréquence Moy</div>
                <div class="stat-value">${gpu1ClkStats.avg}<span class="stat-unit">MHz</span></div>
                <div class="stat-subtitle">Max: ${gpu1ClkStats.max} MHz</div>
            </div>
            <div class="stat-card gradient-green">
                <div class="stat-title">GPU2 Mémoire Moy</div>
                <div class="stat-value">${gpu1MemClkStats.avg}<span class="stat-unit">MHz</span></div>
                <div class="stat-subtitle">Max: ${gpu1MemClkStats.max} MHz</div>
            </div>
            <div class="stat-card gradient-pink">
                <div class="stat-title">GPU2 Utilisation</div>
                <div class="stat-value">${gpu1UtilStats.avg}<span class="stat-unit">%</span></div>
                <div class="stat-subtitle">P99: ${gpu1UtilStats.p99}%</div>
            </div>
            <div class="stat-card gradient-red">
                <div class="stat-title">GPU2 Température</div>
                <div class="stat-value">${gpu1TempStats.avg}<span class="stat-unit">°C</span></div>
                <div class="stat-subtitle">Max: ${gpu1TempStats.max}°C</div>
            </div>
        `;
        
        // Afficher le graphique GPU1
        document.getElementById('gpu1Container').style.display = 'block';
    }
    
    gpuStatsGrid.innerHTML = cardsHTML;
}

// ========================================
// AFFICHAGE DES STATISTIQUES DE PUISSANCE
// ========================================

function displayPowerStats(stats) {
    const power = stats.powerMetrics;
    const powerStatsGrid = document.getElementById('powerStatsGrid');
    
    const calcStats = (arr) => {
        if (!arr || arr.length === 0) return { avg: 0, min: 0, max: 0, p99: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        return {
            avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
            min: Math.min(...arr).toFixed(2),
            max: Math.max(...arr).toFixed(2),
            p99: sorted[Math.floor(arr.length * 0.99)].toFixed(2)
        };
    };
    
    const cpuPowerStats = calcStats(stats.cpuMetrics.power);
    const gpuPowerNV = calcStats(power.nvPower);
    const gpuPowerAMD = calcStats(power.amdPower);
    const gpuOnlyStats = calcStats(power.gpuOnlyPower);
    
    // Déterminer quelle puissance GPU utiliser (NVIDIA ou AMD)
    const gpuPowerStats = power.nvPower.length > 0 ? gpuPowerNV : gpuPowerAMD;
    const gpuVendor = power.nvPower.length > 0 ? 'NVIDIA' : 'AMD';
    
    let cardsHTML = `
        <div class="stat-card gradient-lime">
            <div class="stat-title">CPU Power Moy</div>
            <div class="stat-value">${cpuPowerStats.avg}<span class="stat-unit">W</span></div>
            <div class="stat-subtitle">Max: ${cpuPowerStats.max}W</div>
        </div>
        <div class="stat-card gradient-green">
            <div class="stat-title">GPU Power Moy (${gpuVendor})</div>
            <div class="stat-value">${gpuPowerStats.avg}<span class="stat-unit">W</span></div>
            <div class="stat-subtitle">Max: ${gpuPowerStats.max}W</div>
        </div>
    `;
    
    // Si on a la puissance GPU seule (sans le reste du système)
    if (gpuOnlyStats.avg > 0) {
        cardsHTML += `
            <div class="stat-card gradient-cyan">
                <div class="stat-title">GPU Seul (API)</div>
                <div class="stat-value">${gpuOnlyStats.avg}<span class="stat-unit">W</span></div>
                <div class="stat-subtitle">Max: ${gpuOnlyStats.max}W</div>
            </div>
        `;
    }
    
    // Performance par Watt
    const perfWattAPIStats = calcStats(power.perfWattAPI);
    const perfWattGPUStats = calcStats(power.perfWattGPU);
    
    cardsHTML += `
        <div class="stat-card gradient-purple">
            <div class="stat-title">Perf/Watt Total</div>
            <div class="stat-value">${perfWattAPIStats.avg}<span class="stat-unit">FPS/W</span></div>
            <div class="stat-subtitle">Efficacité système</div>
        </div>
    `;
    
    if (perfWattGPUStats.avg > 0) {
        cardsHTML += `
            <div class="stat-card gradient-pink">
                <div class="stat-title">Perf/Watt GPU</div>
                <div class="stat-value">${perfWattGPUStats.avg}<span class="stat-unit">FPS/W</span></div>
                <div class="stat-subtitle">Efficacité GPU</div>
            </div>
        `;
    }
    
    // Si PCAT disponible (mesure hardware précise)
    if (power.hasPCAT) {
        const pcatStats = calcStats(power.pcatTotal);
        const perfWattPCATStats = calcStats(power.perfWattPCAT);
        
        cardsHTML += `
            <div class="stat-card gradient-orange">
                <div class="stat-title">PCAT Power Total</div>
                <div class="stat-value">${pcatStats.avg}<span class="stat-unit">W</span></div>
                <div class="stat-subtitle">Mesure hardware</div>
            </div>
            <div class="stat-card gradient-yellow">
                <div class="stat-title">Perf/Watt PCAT</div>
                <div class="stat-value">${perfWattPCATStats.avg}<span class="stat-unit">FPS/W</span></div>
                <div class="stat-subtitle">Via mesure PCAT</div>
            </div>
        `;
    }
    
    // Si USB-C Power Delivery disponible (laptops)
    if (power.hasUSBC) {
        const usbcStats = calcStats(power.usbcPower);
        const perfWattUSBCStats = calcStats(power.perfWattUSBC);
        
        cardsHTML += `
            <div class="stat-card gradient-blue">
                <div class="stat-title">USB-C Power</div>
                <div class="stat-value">${usbcStats.avg}<span class="stat-unit">W</span></div>
                <div class="stat-subtitle">Laptop charging</div>
            </div>
            <div class="stat-card gradient-indigo">
                <div class="stat-title">Perf/Watt USB-C</div>
                <div class="stat-value">${perfWattUSBCStats.avg}<span class="stat-unit">FPS/W</span></div>
                <div class="stat-subtitle">Via USB-C PD</div>
            </div>
        `;
    }
    
    // Calcul de la puissance totale moyenne
    const totalPower = parseFloat(cpuPowerStats.avg) + parseFloat(gpuPowerStats.avg);
    
    cardsHTML += `
        <div class="stat-card gradient-red">
            <div class="stat-title">Total CPU+GPU</div>
            <div class="stat-value">${totalPower.toFixed(2)}<span class="stat-unit">W</span></div>
            <div class="stat-subtitle">Conso combinée</div>
        </div>
    `;
    
    powerStatsGrid.innerHTML = cardsHTML;
}

// ========================================
// CRÉATION DES GRAPHIQUES
// ========================================

function createCharts(data, fps, stats) {
    // FIX: destruction sécurisée des charts
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });

    const frames = data.map((_, i) => i + 1);

    // Graphique FPS avec lignes de référence (lignes AVANT fps pour visibilité)
    const avgFpsValue = parseFloat(stats.avgFps);
    const p1FpsValue = parseFloat(stats.p1Fps);
    const p01FpsValue = parseFloat(stats.p01Fps);
    
    charts.fps = new Chart(document.getElementById('fpsChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: `Avg: ${stats.avgFps}`,
                    data: new Array(frames.length).fill(avgFpsValue),
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 1
                },
                {
                    label: `1% Low: ${stats.p1Fps}`,
                    data: new Array(frames.length).fill(p1FpsValue),
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [5, 3],
                    pointRadius: 0,
                    fill: false,
                    order: 2
                },
                {
                    label: `0.1% Low: ${stats.p01Fps}`,
                    data: new Array(frames.length).fill(p01FpsValue),
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [3, 2],
                    pointRadius: 0,
                    fill: false,
                    order: 3
                },
                {
                    label: 'FPS',
                    data: fps,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                    order: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#cbd5e0', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' }
                },
                y: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'FPS', color: '#cbd5e0' }
                }
            }
        }
    });

    // Histogramme de distribution FPS
    const fpsHistogram = createHistogram(stats.fpsData, 20);
    
    charts.fpsHistogram = new Chart(document.getElementById('fpsHistogramChart'), {
        type: 'bar',
        data: {
            labels: fpsHistogram.labels,
            datasets: [{
                label: 'Nombre de frames',
                data: fpsHistogram.counts,
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderColor: '#10b981',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#cbd5e0', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1,
                    callbacks: {
                        title: function(context) {
                            return `FPS: ${context[0].label}`;
                        },
                        label: function(context) {
                            const total = stats.fpsData.length;
                            const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                            return `${context.parsed.y} frames (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'FPS Range', color: '#cbd5e0' }
                },
                y: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'Nombre de frames', color: '#cbd5e0' }
                }
            }
        }
    });

    // Graphique Frame Time avec références FPS (240, 120, 60, 30)
    charts.frametime = new Chart(document.getElementById('frametimeChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: '240 FPS (4.17ms)',
                    data: new Array(frames.length).fill(4.17),
                    borderColor: '#8b5cf6',
                    borderWidth: 1.5,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false,
                    order: 1
                },
                {
                    label: '120 FPS (8.33ms)',
                    data: new Array(frames.length).fill(8.33),
                    borderColor: '#06b6d4',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 2
                },
                {
                    label: '60 FPS (16.67ms)',
                    data: new Array(frames.length).fill(16.67),
                    borderColor: '#10b981',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 3
                },
                {
                    label: '30 FPS (33.33ms)',
                    data: new Array(frames.length).fill(33.33),
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [5, 3],
                    pointRadius: 0,
                    fill: false,
                    order: 4
                },
                {
                    label: 'Frame Time (ms)',
                    data: data.map(d => d.MsBetweenPresents || 0),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                    order: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#cbd5e0', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' }
                },
                y: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'Millisecondes', color: '#cbd5e0' }
                }
            }
        }
    });

    // Graphique de variance du frametime (rolling window)
    const windowSize = 60; // 60 frames
    const variance = [];
    for (let i = windowSize; i < stats.frametimeData.length; i++) {
        const window = stats.frametimeData.slice(i - windowSize, i);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const v = window.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / window.length;
        variance.push(Math.sqrt(v));
    }
    
    charts.frametimeVariance = new Chart(document.getElementById('frametimeVarianceChart'), {
        type: 'line',
        data: {
            labels: frames.slice(windowSize),
            datasets: [{
                label: 'Écart-type Frame Time (60 frames)',
                data: variance,
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#cbd5e0', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return `Variance: ${context.parsed.y.toFixed(2)}ms (plus bas = plus stable)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' }
                },
                y: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'Écart-type (ms)', color: '#cbd5e0' }
                }
            }
        }
    });

    charts.latencyPipeline = new Chart(document.getElementById('latencyPipelineChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'PC Latency',
                    data: data.map(d => d.MsPCLatency || 0),
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Render → Present',
                    data: data.map(d => d.MsRenderPresentLatency || 0),
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Until Displayed',
                    data: data.map(d => d.MsUntilDisplayed || 0),
                    borderColor: '#84cc16',
                    backgroundColor: 'rgba(132, 204, 22, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: getChartOptions('Millisecondes')
    });

    charts.latencyStacked = new Chart(document.getElementById('latencyStackedChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'In Present API',
                    data: data.map(d => d.MsInPresentAPI || 0),
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.6)',
                    borderWidth: 1,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'Simulation Start',
                    data: data.map(d => d.MsBetweenSimulationStart || 0),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.6)',
                    borderWidth: 1,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'Display Change',
                    data: data.map(d => d.MsBetweenDisplayChange || 0),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderWidth: 1,
                    fill: true,
                    pointRadius: 0
                }
            ]
        },
        options: {
            ...getChartOptions('Millisecondes'),
            scales: {
                ...getChartOptions('Millisecondes').scales,
                y: {
                    ...getChartOptions('Millisecondes').scales.y,
                    stacked: true
                }
            }
        }
    });

    charts.renderQueue = new Chart(document.getElementById('renderQueueChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [{
                label: 'Render Queue Depth',
                data: data.map(d => d['Render Queue Depth'] || 0),
                borderColor: '#eab308',
                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                stepped: true
            }]
        },
        options: getChartOptions('Frames en queue')
    });

    charts.cpuFreqTemp = new Chart(document.getElementById('cpuFreqTempChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'Fréquence CPU (MHz)',
                    data: data.map(d => d['CPUClk(MHz)'] || 0),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y'
                },
                {
                    label: 'Température CPU (°C)',
                    data: data.map(d => d['CPU Package Temp(C)'] || 0),
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: { color: '#cbd5e0', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: '#06b6d4' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'MHz', color: '#06b6d4' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: '#f97316' },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: '°Celsius', color: '#f97316' }
                }
            }
        }
    });

    charts.cpuPower = new Chart(document.getElementById('cpuPowerChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'Puissance CPU (W)',
                    data: data.map(d => d['CPU Package Power(W)'] || 0),
                    borderColor: '#84cc16',
                    backgroundColor: 'rgba(132, 204, 22, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'TDP CPU (W)',
                    data: data.map(d => d['CPU TDP (W)'] || 0),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: getChartOptions('Watts')
    });

    const cpuCoresDatasets = stats.cpuMetrics.coresData.map((core, idx) => {
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
            '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#eab308'
        ];
        const color = colors[idx % colors.length];
        
        return {
            label: `Core ${core.index}`,
            data: core.data,
            borderColor: color,
            backgroundColor: color + '20',
            borderWidth: 1.5,
            tension: 0.3,
            pointRadius: 0
        };
    });

    charts.cpuCores = new Chart(document.getElementById('cpuCoresChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: cpuCoresDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { 
                        color: '#cbd5e0', 
                        font: { size: 10 },
                        boxWidth: 12
                    },
                    maxHeight: 150
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.95)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' }
                },
                y: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'Utilisation (%)', color: '#cbd5e0' },
                    min: 0,
                    max: 100
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });

    // Graphique Fréquence GPU & Mémoire
    charts.gpuFreq = new Chart(document.getElementById('gpuFreqChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'GPU Core Clock (MHz)',
                    data: data.map(d => d['GPU0Clk(MHz)'] || 0),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y'
                },
                {
                    label: 'GPU Memory Clock (MHz)',
                    data: data.map(d => d['GPU0MemClk(MHz)'] || 0),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: { color: '#cbd5e0', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'MHz', color: '#cbd5e0' }
                }
            }
        }
    });

    // Graphique Utilisation & Température GPU
    charts.gpuUtilTemp = new Chart(document.getElementById('gpuUtilTempChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'GPU Utilisation (%)',
                    data: data.map(d => d['GPU0Util(%)'] || 0),
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y'
                },
                {
                    label: 'GPU Température (°C)',
                    data: data.map(d => d['GPU0Temp(C)'] || 0),
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: { color: '#cbd5e0', font: { size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleColor: '#cbd5e0',
                    bodyColor: '#cbd5e0',
                    borderColor: '#9333ea',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e0' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: '#a855f7' },
                    grid: { color: 'rgba(203, 213, 224, 0.1)' },
                    title: { display: true, text: 'Utilisation (%)', color: '#a855f7' },
                    min: 0,
                    max: 100
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: '#f97316' },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: '°Celsius', color: '#f97316' }
                }
            }
        }
    });

    // Graphique GPU Secondaire (si présent)
    if (stats.gpuMetrics.hasGpu1) {
        charts.gpu1 = new Chart(document.getElementById('gpu1Chart'), {
            type: 'line',
            data: {
                labels: frames,
                datasets: [
                    {
                        label: 'GPU2 Core Clock (MHz)',
                        data: data.map(d => d['GPU1Clk(MHz)'] || 0),
                        borderColor: '#84cc16',
                        backgroundColor: 'rgba(132, 204, 22, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0
                    },
                    {
                        label: 'GPU2 Utilisation (%)',
                        data: data.map(d => d['GPU1Util(%)'] || 0),
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0
                    },
                    {
                        label: 'GPU2 Température (°C)',
                        data: data.map(d => d['GPU1Temp(C)'] || 0),
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0
                    }
                ]
            },
            options: getChartOptions('Valeurs')
        });
    }

    // Graphique Consommation Totale Système
    const powerDatasets = [
        {
            label: 'CPU Power (W)',
            data: data.map(d => d['CPU Package Power(W)'] || 0),
            borderColor: '#eab308',
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0
        },
        {
            label: 'GPU Power (W)',
            data: data.map(d => d['NV Pwr(W) (API)'] || d['AMDPwr(W) (API)'] || 0),
            borderColor: '#84cc16',
            backgroundColor: 'rgba(132, 204, 22, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0
        }
    ];
    
    // Ajouter PCAT si disponible
    if (stats.powerMetrics.hasPCAT) {
        powerDatasets.push({
            label: 'PCAT Total (W)',
            data: data.map(d => d['PCAT Power Total(W)'] || 0),
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 0
        });
    }
    
    // Ajouter USB-C si disponible
    if (stats.powerMetrics.hasUSBC) {
        powerDatasets.push({
            label: 'USB-C Power (W)',
            data: data.map(d => d['NV-Total-USBCPwr(W) (API)'] || 0),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            borderDash: [3, 3],
            tension: 0.4,
            pointRadius: 0
        });
    }
    
    charts.totalPower = new Chart(document.getElementById('totalPowerChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: powerDatasets
        },
        options: getChartOptions('Watts')
    });

    // Graphique Répartition CPU vs GPU
    charts.powerBreakdown = new Chart(document.getElementById('powerBreakdownChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'CPU Power (W)',
                    data: data.map(d => d['CPU Package Power(W)'] || 0),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.6)',
                    borderWidth: 1,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'GPU Power (W)',
                    data: data.map(d => d['NV Pwr(W) (API)'] || d['AMDPwr(W) (API)'] || 0),
                    borderColor: '#84cc16',
                    backgroundColor: 'rgba(132, 204, 22, 0.6)',
                    borderWidth: 1,
                    fill: true,
                    pointRadius: 0
                }
            ]
        },
        options: {
            ...getChartOptions('Watts'),
            scales: {
                ...getChartOptions('Watts').scales,
                y: {
                    ...getChartOptions('Watts').scales.y,
                    stacked: true
                }
            }
        }
    });

    // Graphique Performance par Watt
    const perfWattDatasets = [
        {
            label: 'Perf/Watt Total (API)',
            data: data.map(d => d['Perf/W Total(F/J) (API)'] || 0),
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0
        }
    ];
    
    // Ajouter GPU Only si disponible
    if (stats.powerMetrics.perfWattGPU.length > 0) {
        perfWattDatasets.push({
            label: 'Perf/Watt GPU Only',
            data: data.map(d => d['Perf/W GPUOnly(F/J) (API)'] || 0),
            borderColor: '#ec4899',
            backgroundColor: 'rgba(236, 72, 153, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0
        });
    }
    
    // Ajouter PCAT si disponible
    if (stats.powerMetrics.hasPCAT) {
        perfWattDatasets.push({
            label: 'Perf/Watt PCAT',
            data: data.map(d => d['Perf/W Total(F/J) (PCAT)'] || 0),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 0
        });
    }
    
    charts.perfPerWatt = new Chart(document.getElementById('perfPerWattChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: perfWattDatasets
        },
        options: getChartOptions('FPS par Watt')
    });
}

function getChartOptions(yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                labels: { color: '#cbd5e0', font: { size: 12 } }
            },
            tooltip: {
                backgroundColor: 'rgba(30, 41, 59, 0.9)',
                titleColor: '#cbd5e0',
                bodyColor: '#cbd5e0',
                borderColor: '#9333ea',
                borderWidth: 1
            }
        },
        scales: {
            x: {
                ticks: { color: '#cbd5e0' },
                grid: { color: 'rgba(203, 213, 224, 0.1)' }
            },
            y: {
                ticks: { color: '#cbd5e0' },
                grid: { color: 'rgba(203, 213, 224, 0.1)' },
                title: { display: true, text: yLabel, color: '#cbd5e0' }
            }
        }
    };
}

// Helper pour créer un histogramme
function createHistogram(data, bins) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binSize = (max - min) / bins;
    
    const histogram = new Array(bins).fill(0);
    const labels = [];
    
    for (let i = 0; i < bins; i++) {
        const binStart = min + (i * binSize);
        const binEnd = min + ((i + 1) * binSize);
        labels.push(`${binStart.toFixed(0)}-${binEnd.toFixed(0)}`);
    }
    
    data.forEach(value => {
        const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
        histogram[binIndex]++;
    });
    
    return { labels, counts: histogram };
}