// ================================================================
// КЕШ ДЛЯ ДАННЫХ ИЗ API
// ================================================================
const apiCache = {
  standings: {}, // { year: [driverStandings] }
  champions: {}, // { year: [top3Champions] }
  facts: {}      // { year: [races] }
};

// ================================================================
// СЛОВАРЬ РУССКИХ ИМЁН ПИЛОТОВ (загружается из JSON)
// ================================================================
let driverNameRu = {};

async function loadDriverNames() {
  try {
    const response = await fetch('driver_names_ru.json');
    if (!response.ok) throw new Error('Не удалось загрузить словарь');
    driverNameRu = await response.json();
    console.log(`✅ Загружено ${Object.keys(driverNameRu).length} русских имён пилотов`);
  } catch (error) {
    console.warn('Не удалось загрузить словарь имён:', error);
  }
}

// ================================================================
// 1. ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ================================================================
const map = L.map('map', {
  center: [20, 0],
  zoom: 2,
  zoomControl: true,
  fadeAnimation: true,
});

const standardLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; CartoDB'
});
const terrainLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
  maxZoom: 16
});
standardLayer.addTo(map);
L.control.layers({
  "Стандартная": standardLayer,
  "Рельеф": terrainLayer
}).addTo(map);

const minZoomForPolygons = 8;
const minZoomForThickLines = 12;

// ================================================================
// 2. ГЛОБАЛЬНЫЕ ДАННЫЕ (CSV + GeoJSON)
// ================================================================
let circuitsData = [];
let geoJsonData = null;

let trackLayer = L.geoJSON(null, {
  style: function() { return { color: '#ce0000', weight: 2, opacity: 0.7, fillOpacity: 0.15 }; },
  onEachFeature: function(feature, layer) {
    const props = feature.properties;
    const name = props.name_ru || props.name || 'Без названия';
    const country = props.country_ru || props.country || '';
    const first = props.first_gp || 'н/д';
    const last = props.last_gp || 'н/д';
    layer.bindPopup(`
      <b>${name}</b><br>
      <i>${country}</i><br>
      Годы: ${first} – ${last === 2026 ? 'н.в.' : last}
    `);
  }
}).addTo(map);

let markerLayer = L.layerGroup().addTo(map);

// ================================================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ КАРТЫ
// ================================================================
function getStatus(circuit, year) {
  const { first_gp, last_gp } = circuit;
  if (year >= first_gp && year <= last_gp) {
    if (last_gp >= 2026 && first_gp <= 2026) return 'active';
    else if (last_gp < 2026) return 'historic';
    else if (first_gp > 2026) return 'future';
    else return 'active';
  }
  return null;
}

function renderTracks(year) {
  trackLayer.clearLayers();
  markerLayer.clearLayers();
  if (!geoJsonData) return;

  // Полигоны
  const filtered = geoJsonData.features.filter(f => {
    const first = f.properties.first_gp;
    const last = f.properties.last_gp;
    return (year >= first && year <= last);
  });
  
  filtered.forEach(feature => {
      trackLayer.addData(feature);
    });

  function getTrackIcon(type) {
    // Пути к иконкам (относительно корня сайта)
    const iconMap = {
      'Городская': 'img/icons/urban.png',
      'Трековая': 'img/icons/track.png',
      'Смешанная': 'img/icons/mixed.png'
    };
    const defaultIcon = 'img/icons/track.png';
    const iconUrl = iconMap[type] || defaultIcon;

    return L.divIcon({
      html: `<img src="${iconUrl}" style="width:28px; height:28px; border-radius:50%; border:2px solid #fff; box-shadow: 0 0 8px rgba(0,0,0,0.6); background: rgba(0,0,0,0.3);" />`,
      className: 'custom-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  // Маркеры (кружки)
  circuitsData.forEach(circuit => {
    const status = getStatus(circuit, year);
    if (!status) return;
    if (!circuit.lat || !circuit.lng) return;
    
    const icon = getTrackIcon(circuit.type_circuit);
    const marker = L.marker([circuit.lat, circuit.lng], { icon })
      .addTo(markerLayer)
      .bindPopup(`
        <b>${circuit.name_ru}</b><br>
        <i>${circuit.country}</i><br>
        Тип: ${circuit.type_circuit}<br>
        Годы: ${circuit.first_gp} – ${circuit.last_gp === 2026 ? 'н.в.' : circuit.last_gp}
      `);
  });

  document.getElementById('yearDisplay').textContent = year;
}

function updateTrackVisibility() {
  const currentZoom = map.getZoom();
  if (currentZoom >= minZoomForPolygons) {
    if (!map.hasLayer(trackLayer)) map.addLayer(trackLayer);
    if (currentZoom >= minZoomForThickLines) {
      trackLayer.setStyle({ weight: 5, opacity: 1 });
    } else {
      trackLayer.setStyle({ weight: 3, opacity: 0.8 });
    }
  } else {
    if (map.hasLayer(trackLayer)) map.removeLayer(trackLayer);
  }
  if (!map.hasLayer(markerLayer)) map.addLayer(markerLayer);
}

map.on('zoomend', updateTrackVisibility);

// ================================================================
// 4. ЗАГРУЗКА ЛОКАЛЬНЫХ ДАННЫХ (CSV + GeoJSON)
// ================================================================
const CIRCUITS_CSV_URL = 'circuits.csv';
const RACES_CSV_URL = 'races.csv';
const GEOJSON_URL = 'circuits.geojson';

async function loadLocalData() {
  await loadDriverNames();
  try {
    const circuitsResp = await fetch(CIRCUITS_CSV_URL);
    if (!circuitsResp.ok) throw new Error('CSV circuits not found');
    const circuitsText = await circuitsResp.text();
    const circuitsParsed = Papa.parse(circuitsText, { header: true, skipEmptyLines: true });
    const circuitsRows = circuitsParsed.data;

    const racesResp = await fetch(RACES_CSV_URL);
    if (!racesResp.ok) throw new Error('CSV races not found');
    const racesText = await racesResp.text();
    const racesParsed = Papa.parse(racesText, { header: true, skipEmptyLines: true });
    const racesRows = racesParsed.data;

    const circuitYears = {};
    racesRows.forEach(row => {
      const circuitId = row.circuitId?.trim();
      const season = parseInt(row.season, 10);
      if (!circuitId || isNaN(season)) return;
      if (!circuitYears[circuitId]) circuitYears[circuitId] = { first: season, last: season };
      else {
        if (season < circuitYears[circuitId].first) circuitYears[circuitId].first = season;
        if (season > circuitYears[circuitId].last) circuitYears[circuitId].last = season;
      }
    });
      // Принудительно задаём годы для Мадринга (если нет данных в races.csv)
      if (!circuitYears['es-2026']) {
        circuitYears['es-2026'] = { first: 2026, last: 2026 };
      }

    circuitsData = circuitsRows
      .filter(row => row.circuitId && row.circuitName)
      .map(row => {
        const id = row.circuitId.trim();
        const years = circuitYears[id] || { first: 1950, last: 2027 };
        return {
          id,
          name: row.circuitName.trim(),
          name_ru: row.circuitName_ru?.trim(),
          country: row.country_ru?.trim() || row.country?.trim() || 'Неизвестно',
          lat: parseFloat(row.lat),
          lng: parseFloat(row.long),
          first_gp: years.first,
          last_gp: years.last,
          type_circuit: row.type_circuit_ru || 'Трековая' // если нет типа, ставим по умолчанию
        };
      });

    console.log(`✅ Загружено ${circuitsData.length} трасс из CSV`);

    const geoResp = await fetch(GEOJSON_URL);
    if (!geoResp.ok) throw new Error('GeoJSON not found');
    geoJsonData = await geoResp.json();
    console.log(`✅ Загружено ${geoJsonData.features.length} полигонов`);

    enrichGeoJsonWithYears();

  } catch (error) {
    console.error('Ошибка загрузки локальных данных:', error);
    alert('Не удалось загрузить локальные данные. Проверьте консоль.');
  }
}

function enrichGeoJsonWithYears() {
  geoJsonData.features.forEach(feature => {
    const geoName = feature.properties?.Name || feature.properties?.name || '';
    const match = circuitsData.find(c => 
      c.name.toLowerCase().trim() === geoName.toLowerCase().trim()
    );
    if (match) {
      feature.properties.first_gp = match.first_gp;
      feature.properties.last_gp = match.last_gp;
      feature.properties.circuitId = match.id;
      feature.properties.country = match.country_ru;
      feature.properties.name_ru = match.name_ru;
      feature.properties.type_circuit = match.type_circuit;
    } else {
      feature.properties.first_gp = 1950;
      feature.properties.last_gp = 2026;
      console.warn(`Не найдено соответствие для: "${geoName}"`);
    }
  });
}

// ================================================================
// 5. ЗАГРУЗКА ДАННЫХ ИЗ НОВОГО API (F1 API) В КЕШ
// ================================================================
const API_BASE = 'https://f1api.dev/api';

async function loadAllApiData() {
  console.log('🚀 Начинаем загрузку данных из F1 API...');
  const years = [];
  for (let y = 1950; y <= 2026; y++) years.push(y);

  // Функция для запроса с обработкой ошибок
  const fetchYear = async (year) => {
    try {
      const [standingsResp, racesResp] = await Promise.all([
        fetch(`${API_BASE}/${year}/drivers-championship`),
        fetch(`${API_BASE}/${year}`)
      ]);

      let standings = [];
      let races = [];

      if (standingsResp.ok) {
        const data = await standingsResp.json();
        // Новая структура: drivers_championship
        standings = data?.drivers_championship || [];
        if (!Array.isArray(standings)) standings = [];
        console.log(`📊 Standings ${year}:`, standings.length); // для проверки
      } else {
        console.warn(`⚠️ Не удалось загрузить чемпионат ${year}: ${standingsResp.status}`);
      }

      if (racesResp.ok) {
        const data = await racesResp.json();
        // Проверяем возможные поля: races, results, data
        races = data?.races || data?.results || data?.data || [];
        if (!Array.isArray(races)) races = [];
        console.log(`🏁 Races ${year}:`, races.length);
      } else {
        console.warn(`⚠️ Не удалось загрузить гонки ${year}: ${racesResp.status}`);
      }
      
      return { year, standings, races };
    } catch (e) {
      console.warn(`⚠️ Ошибка загрузки данных для ${year}:`, e);
      return { year, standings: [], races: [] };
    }
  };

  // Параллельная загрузка всех лет (разбиваем на чанки, чтобы не перегружать сервер)
  const chunkSize = 10;
  const allResults = [];
  for (let i = 0; i < years.length; i += chunkSize) {
    const chunk = years.slice(i, i + chunkSize);
    const chunkPromises = chunk.map(year => fetchYear(year));
    const chunkResults = await Promise.all(chunkPromises);
    allResults.push(...chunkResults);
    console.log(`✅ Загружена группа лет: ${chunk[0]}–${chunk[chunk.length-1]}`);
    // небольшая пауза между группами
    await new Promise(r => setTimeout(r, 200));
  }

  // Сохраняем в кеш
  allResults.forEach(({ year, standings, races }) => {
    apiCache.standings[year] = standings;

    // Топ-3 чемпиона (исправлено)
    if (standings && standings.length > 0) {
      apiCache.champions[year] = standings.slice(0, 3).map(item => ({
        driverId: item.driverId || null,
        team: item.team_name || item.teamId || 'Unknown',
        points: item.points || '0',
      }));
    } else {
      apiCache.champions[year] = null;
    }

    // Гонки (для фактов) – исправлено
    if (races && races.length > 0) {
      apiCache.facts[year] = races.map(race => ({
        raceName: race.raceName || 'Гран-при',
        circuit: race.circuit?.circuitName || race.circuitName || 'Unknown',
        winner: race.winner || 'Unknown',
        teamWinner: race.teamWinner || 'Unknown',
        date: race.schedule?.race?.date || race.date || '',
        year: year
      }));
    } else {
      apiCache.facts[year] = [];
    }

    console.log(`✅ Сохранены standings для ${year}: ${standings.length} записей`);
  });

  console.log('🎉 Все данные из API загружены и сохранены в кеш');
}

// ================================================================
// 6. ФУНКЦИИ ДЛЯ ОТОБРАЖЕНИЯ ДАННЫХ (читают из кеша)
// ================================================================
function renderStandingsTable(standings, container) {
  if (!standings || standings.length === 0) {
    container.innerHTML = 'Данные не доступны';
    return;
  }
  let html = `<table class="standings-table">`;
  standings.slice(0, 10).forEach((item, index) => {
    const pos = item.position || index + 1;
    // Получаем driverId
    const driverId = item.driverId || item.Driver?.driverId || null;
    // Пытаемся получить русское имя из словаря
    let name = 'Unknown';
    if (driverId && driverNameRu[driverId]) {
      name = driverNameRu[driverId];
    } else if (item.driver_first_name && item.driver_last_name) {
      name = `${item.driver_first_name} ${item.driver_last_name}`;
    } else if (driverId) {
      name = driverId; // показываем ID, если нет перевода
    }
    const points = item.points || '0';
    html += `<tr><td class="pos">${pos}</td><td class="name">${name}</td><td class="pts">${points}</td></tr>`;
  });
  html += `</table>`;
  container.innerHTML = html;
}

function renderChampionsCarousel(champions, carousel) {
  if (champions && champions.length > 0) {
    carousel.innerHTML = champions.map(c => {
      const driverId = c.driverId || null;
      const ruName = driverId && driverNameRu[driverId] ? driverNameRu[driverId] : driverId || 'Unknown';
      return `
        <div class="champion-card" data-driver="${driverId}" data-team="${c.team}" data-points="${c.points}">
          <div class="avatar">🏆</div>
          <div class="info">
            <div class="name">${ruName}</div>
            <div class="year">${c.team} • ${c.points} очков</div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    carousel.innerHTML = `<div class="champion-card">
      <div class="avatar">🏁</div>
      <div class="info">
        <div class="name">Нет данных</div>
        <div class="year">за выбранный год</div>
      </div>
    </div>`;
  }
}

function renderFact(fact, container) {
  if (fact) {
    const winnerId = fact.winner || null;
    const winnerName = winnerId && driverNameRu[winnerId] ? driverNameRu[winnerId] : winnerId || 'Unknown';
    const teamName = fact.constructor || fact.teamWinner || 'неизвестную команду';
    container.innerHTML = `
      <strong>${fact.year}:</strong> 
      ${winnerName} победил в Гран-при ${fact.raceName} (${fact.circuit}) 
      за ${teamName}
    `;
  } else {
    container.innerHTML = `<strong>Данные отсутствуют</strong>`;
  }
}

// ================================================================
// 7. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ПРИ СМЕНЕ ГОДА
// ================================================================
function updateStandings(year) {
  const container = document.getElementById('standingsContent');
  const standings = apiCache.standings[year];
  if (standings) {
    renderStandingsTable(standings, container);
  } else {
    container.innerHTML = 'Данные за этот год ещё не загружены';
  }
}

function updateChampionsAndFacts(year) {
  const carousel = document.getElementById('championsCarousel');
  const factContainer = document.getElementById('legendaryFact');

  const champions = apiCache.champions[year] || null;
  renderChampionsCarousel(champions, carousel);

  // Выбираем случайную гонку из года для факта
  const races = apiCache.facts[year] || [];
  let fact = null;
  if (races.length > 0) {
    const randomRace = races[Math.floor(Math.random() * races.length)];
    fact = randomRace;
  }
  renderFact(fact, factContainer);
}

// ================================================================
// 8. ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ ВСЕХ ДАННЫХ
// ================================================================
async function loadAllData() {
  // 1. Загружаем локальные CSV и GeoJSON
  await loadLocalData();

  // 2. Загружаем данные из API в кеш
  await loadAllApiData();

  // 3. Получаем текущий год и рендерим карту
  const currentYear = parseInt(document.getElementById('yearSlider').value, 10);
  renderTracks(currentYear);
  updateTrackVisibility();

  // 4. Обновляем сайдбар и нижнюю секцию
  updateStandings(currentYear);
  updateChampionsAndFacts(currentYear);
}

// ================================================================
// 9. УПРАВЛЕНИЕ СЛАЙДЕРОМ
// ================================================================
document.getElementById('yearSlider').addEventListener('input', function () {
  const year = parseInt(this.value, 10);
  renderTracks(year);
  updateChampionsAndFacts(year);
  // Для таблицы standings: можно обновлять, но она может оставаться на текущий сезон.
  // Чтобы не нагружать, можно обновлять только при клике, но для демонстрации тоже обновим.
  updateStandings(year);
});

// ================================================================
// 10. КЛИКАБЕЛЬНАЯ КАРУСЕЛЬ
// ================================================================
document.addEventListener('click', function(e) {
  const card = e.target.closest('.champion-card');
  if (!card) return;
  const name = card.dataset.driver || 'Unknown';
  const team = card.dataset.team || 'Unknown';
  const points = card.dataset.points || '0';
  const newsFeed = document.getElementById('newsFeed');
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const li = document.createElement('li');
  li.innerHTML = `<span class="time">${time}</span> 🏆 <strong>${name}</strong> — ${team}, ${points} очков`;
  newsFeed.prepend(li);
  while (newsFeed.children.length > 10) newsFeed.removeChild(newsFeed.lastChild);
  showToast(`🏆 ${name} • ${team} • ${points} очков`);
});

function showToast(message) {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ================================================================
// 11. LIVE-ТАЙМИНГ (OpenF1)
// ================================================================
let liveInterval = null;
let currentSessionKey = null;

async function fetchLiveTiming() {
  try {
    let sessionKey = currentSessionKey;
    if (!sessionKey) {
      const sessionResponse = await fetch('https://api.openf1.org/v1/sessions?session_key=latest');
      if (!sessionResponse.ok) throw new Error('Не удалось получить сессию');
      const sessions = await sessionResponse.json();
      if (sessions && sessions.length > 0) {
        sessionKey = sessions[0].session_key;
        currentSessionKey = sessionKey;
      } else {
        updateLiveStatus('⏸ Ожидание', 'Нет активной сессии');
        return;
      }
    }

    const positionResponse = await fetch(`https://api.openf1.org/v1/position?session_key=${sessionKey}`);
    if (positionResponse.status === 429) {
      console.warn('OpenF1 API: слишком много запросов, пропускаем обновление');
      return;
    }
    if (!positionResponse.ok) throw new Error('API вернул ошибку');
    const positions = await positionResponse.json();
    if (positions && positions.length > 0) {
      updateLiveStandings(positions);
      updateLiveStatus('🟢 Live', `Сессия активна • ${new Date().toLocaleTimeString()}`);
    } else {
      updateLiveStatus('⏸ Ожидание', 'Нет данных о позициях');
    }
  } catch (e) {
    console.warn('Ошибка Live-тайминга:', e);
    updateLiveStatus('⏸ Ожидание', 'Нет активной сессии');
  }
}

function updateLiveStandings(positions) {
  const container = document.getElementById('standingsContent');
  if (!positions || positions.length === 0) {
    container.innerHTML = 'Ожидание данных...';
    return;
  }
  const latestPositions = {};
  positions.forEach(p => {
    const key = p.driver_number;
    if (!latestPositions[key] || p.date > latestPositions[key].date) {
      latestPositions[key] = p;
    }
  });
  const sorted = Object.values(latestPositions)
    .sort((a, b) => a.position - b.position)
    .slice(0, 10);
  let html = `<table class="standings-table">`;
  sorted.forEach((item, index) => {
    const name = item.full_name || `Driver ${item.driver_number}`;
    html += `<tr><td class="pos">${index + 1}</td><td class="name">${name}</td><td class="pts">#${item.driver_number}</td></tr>`;
  });
  html += `</table>`;
  container.innerHTML = html;
}

function updateLiveStatus(status, detail) {
  const statusBar = document.querySelector('.status-bar');
  if (statusBar) {
    statusBar.innerHTML = `
      <span>${status}</span>
      <span class="countdown accent">${detail}</span>
    `;
  }
}

function startLiveTiming() {
  fetchLiveTiming();
  liveInterval = setInterval(fetchLiveTiming, 30000);
}

function stopLiveTiming() {
  if (liveInterval) {
    clearInterval(liveInterval);
    liveInterval = null;
  }
}

startLiveTiming();
window.addEventListener('beforeunload', stopLiveTiming);

// ================================================================
// 12. ЗАПУСК
// ================================================================
loadAllData();

console.log('🏁 F1: Картографический путеводитель — запущено (с кешированием API)');