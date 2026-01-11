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
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];

        // Parse du CSV
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((h, idx) => {
                const val = values[idx];
                row[h] = (val && val !== 'NA' && !isNaN(val)) ? parseFloat(val) : val;
            });
            data.push(row);
        }

        // Détection des cœurs CPU actifs
        const activeCores = [];
        for (let i = 0; i < 64; i++) {
            const coreKey = `CPUCoreUtil%[${i}]`;
            if (headers.includes(coreKey)) {
                const coreValues = data.map(d => d[coreKey]).filter(v => v !== 'NA' && v !== undefined && v !== null && !isNaN(v));
                if (coreValues.length > 0) {
                    activeCores.push(i);
                }
            }
        }

        console.log(`🔥 Cœurs CPU détectés: ${activeCores.length} cœurs actifs`);

        // Calcul des FPS
        const fps = data.map(d => d.MsBetweenPresents ? 1000 / d.MsBetweenPresents : 0).filter(f => f > 0 && isFinite(f));
        const sorted = [...fps].sort((a, b) => a - b);

        // Calcul des statistiques de latence
        const latencyMetrics = {
            simulationStart: data.map(d => d.MsBetweenSimulationStart).filter(v => v && isFinite(v)),
            presents: data.map(d => d.MsBetweenPresents).filter(v => v && isFinite(v)),
            displayChange: data.map(d => d.MsBetweenDisplayChange).filter(v => v && isFinite(v)),
            presentAPI: data.map(d => d.MsInPresentAPI).filter(v => v && isFinite(v)),
            renderPresent: data.map(d => d.MsRenderPresentLatency).filter(v => v && isFinite(v)),
            untilDisplayed: data.map(d => d.MsUntilDisplayed).filter(v => v && isFinite(v)),
            renderQueue: data.map(d => d['Render Queue Depth']).filter(v => v && isFinite(v)),
            pcLatency: data.map(d => d.MsPCLatency).filter(v => v && isFinite(v))
        };

        // Calcul des statistiques CPU
        const cpuMetrics = {
            freq: data.map(d => d['CPUClk(MHz)']).filter(v => v && isFinite(v)),
            util: data.map(d => d['CPUUtil(%)']).filter(v => v && isFinite(v)),
            temp: data.map(d => d['CPU Package Temp(C)']).filter(v => v && isFinite(v)),
            power: data.map(d => d['CPU Package Power(W)']).filter(v => v && isFinite(v)),
            tdp: data.map(d => d['CPU TDP (W)']).filter(v => v && isFinite(v)),
            activeCores: activeCores,
            coresData: activeCores.map(coreIdx => ({
                index: coreIdx,
                data: data.map(d => {
                    const val = d[`CPUCoreUtil%[${coreIdx}]`];
                    return (val && !isNaN(val)) ? val : 0;
                })
            }))
        };

        // Calcul des statistiques principales
        const stats = {
            avgFps: fps.length > 0 ? (fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1) : '0.0',
            minFps: fps.length > 0 ? Math.min(...fps).toFixed(1) : '0.0',
            maxFps: fps.length > 0 ? Math.max(...fps).toFixed(1) : '0.0',
            p1Fps: fps.length > 0 ? sorted[Math.floor(fps.length * 0.01)].toFixed(1) : '0.0',
            p01Fps: fps.length > 0 ? sorted[Math.floor(fps.length * 0.001)].toFixed(1) : '0.0',
            avgGpuUtil: (data.map(d => d['GPU0Util(%)']).filter(v => v && isFinite(v)).reduce((a, b) => a + b, 0) / data.length).toFixed(1),
            avgCpuUtil: (data.map(d => d['CPUUtil(%)']).filter(v => v && isFinite(v)).reduce((a, b) => a + b, 0) / data.length).toFixed(1),
            avgGpuTemp: (data.map(d => d['GPU0Temp(C)']).filter(v => v && isFinite(v)).reduce((a, b) => a + b, 0) / data.length).toFixed(1),
            avgCpuTemp: cpuMetrics.temp.length > 0 ? (cpuMetrics.temp.reduce((a, b) => a + b, 0) / cpuMetrics.temp.length).toFixed(1) : '0.0',
            avgGpuPower: (data.map(d => d['NV Pwr(W) (API)'] || d['AMDPwr(W) (API)']).filter(v => v && isFinite(v)).reduce((a, b) => a + b, 0) / data.length).toFixed(1),
            avgCpuPower: (data.map(d => d['CPU Package Power(W)']).filter(v => v && isFinite(v)).reduce((a, b) => a + b, 0) / data.length).toFixed(1),
            avgPCLatency: latencyMetrics.pcLatency.length > 0 ? (latencyMetrics.pcLatency.reduce((a, b) => a + b, 0) / latencyMetrics.pcLatency.length).toFixed(1) : '0.0',
            droppedFrames: data.filter(d => d.Dropped === 1 || d.Dropped === '1').length,
            totalFrames: fps.length,
            gameName: data[0].Application || 'Jeu',
            gpu: data[0].GPU || 'GPU',
            cpu: data[0].CPU || 'CPU',
            resolution: data[0].Resolution || 'N/A',
            latency: latencyMetrics,
            cpuMetrics: cpuMetrics
        };

        // Calcul du Perf per Watt
        const totalWatts = parseFloat(stats.avgGpuPower) + parseFloat(stats.avgCpuPower);
        stats.perfPerWatt = totalWatts > 0 ? (parseFloat(stats.avgFps) / totalWatts).toFixed(2) : '0.00';

        console.log('Stats calculées:', stats);

        // Affichage des résultats
        displayStats(stats);
        displayLatencyStats(stats);
        displayCPUStats(stats);
        createCharts(data, fps, stats);

        uploadSection.style.display = 'none';
        resultsSection.style.display = 'block';
        subtitle.textContent = `${stats.gameName} - ${stats.gpu} - ${stats.cpu} - ${stats.resolution} - ${stats.totalFrames} frames analysées`;
    } catch (error) {
        console.error('Erreur lors de l\'analyse:', error);
        alert('Erreur lors de l\'analyse du fichier CSV. Vérifie la console pour plus de détails.');
    }
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
// CRÉATION DES GRAPHIQUES
// ========================================

function createCharts(data, fps, stats) {
    Object.values(charts).forEach(chart => chart.destroy());

    const frames = data.map((_, i) => i + 1);

    charts.fps = new Chart(document.getElementById('fpsChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [{
                label: 'FPS',
                data: fps,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: getChartOptions('FPS')
    });

    charts.frametime = new Chart(document.getElementById('frametimeChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [{
                label: 'Frame Time (ms)',
                data: data.map(d => d.MsBetweenPresents || 0),
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: getChartOptions('Millisecondes')
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

    charts.utilisation = new Chart(document.getElementById('utilisationChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'GPU Util %',
                    data: data.map(d => d['GPU0Util(%)'] || 0),
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'CPU Util %',
                    data: data.map(d => d['CPUUtil(%)'] || 0),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: getChartOptions('Pourcentage')
    });

    charts.temperature = new Chart(document.getElementById('temperatureChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [{
                label: 'GPU Temp (°C)',
                data: data.map(d => d['GPU0Temp(C)'] || 0),
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: getChartOptions('°Celsius')
    });

    charts.puissance = new Chart(document.getElementById('puissanceChart'), {
        type: 'line',
        data: {
            labels: frames,
            datasets: [
                {
                    label: 'GPU Power (W)',
                    data: data.map(d => d['NV Pwr(W) (API)'] || d['AMDPwr(W) (API)'] || 0),
                    borderColor: '#84cc16',
                    backgroundColor: 'rgba(132, 204, 22, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'CPU Power (W)',
                    data: data.map(d => d['CPU Package Power(W)'] || 0),
                    borderColor: '#eab308',
                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: getChartOptions('Watts')
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